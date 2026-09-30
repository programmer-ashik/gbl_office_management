import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import {
  badRequest,
  conflict,
  notFound,
  unauthorized,
} from '../../common/errors/app-error';
import {
  comparePassword,
  hashPassword,
} from '../../common/utils/crypto.util';
import { withTransaction } from '../../database/connection';
import { RefreshTokenModel } from '../auth/refresh-token.model';
import { EmployeeModel } from '../employees/employee.model';
import type { CreateUserDto } from './dto/create-user.dto';
import { UserModel, type UserDocument } from './user.model';

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive?: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  allowedPermissions: string[] | null;
  deniedPermissions: string[];
  lastLoginAt: Date | null;
  /** Linked HR record, when this login belongs to an employee. */
  employeeId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UsersService {
  async withEmployeeIds(users: PublicUser[]): Promise<PublicUser[]> {
    if (users.length === 0) return users;
    const links = await EmployeeModel.find(
      { userId: { $in: users.map((row) => new Types.ObjectId(row.id)) } },
      { _id: 1, userId: 1 },
    ).exec();
    const byUser = new Map(
      links.map((row) => [String(row.userId), row._id.toString()]),
    );
    return users.map((row) => ({ ...row, employeeId: byUser.get(row.id) ?? null }));
  }

  async toPublicUserWithEmployee(user: UserDocument): Promise<PublicUser> {
    const [row] = await this.withEmployeeIds([this.toPublicUser(user)]);
    return row;
  }

  /** POST /users — a login without an Employee profile. */
  async createStandalone(dto: CreateUserDto): Promise<PublicUser> {
    if (await this.findByEmail(dto.email)) {
      throw conflict('Email is already registered');
    }
    const user = await this.create({
      email: dto.email,
      password: await hashPassword(dto.password),
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role ?? Role.EMPLOYEE,
    });
    return { ...this.toPublicUser(user), employeeId: null };
  }

  /**
   * Deletes a login. A linked employee keeps its record; only its `userId`
   * is cleared (user.model delete middleware).
   */
  async remove(
    id: string,
    actorId: string,
  ): Promise<{ id: string; unlinkedEmployeeId: string | null }> {
    const user = await this.findByIdOrFail(id);
    if (user._id.toString() === actorId) {
      throw badRequest('You cannot delete your own account');
    }
    if (user.role === Role.ADMIN && user.isActive) {
      const adminCount = await UserModel.countDocuments({
        role: Role.ADMIN,
        isActive: true,
      }).exec();
      if (adminCount <= 1) {
        throw badRequest('Cannot delete the last active administrator');
      }
    }
    const linked = await EmployeeModel.findOne({ userId: user._id }, { _id: 1 }).exec();
    await withTransaction(async (session) => {
      await RefreshTokenModel.deleteMany({ userId: user._id }, { session }).exec();
      await UserModel.deleteOne({ _id: user._id }, { session }).exec();
    });
    return {
      id: user._id.toString(),
      unlinkedEmployeeId: linked ? linked._id.toString() : null,
    };
  }

  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      allowedPermissions: Array.isArray(user.allowedPermissions)
        ? [...user.allowedPermissions]
        : null,
      deniedPermissions: [...(user.deniedPermissions ?? [])],
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  count() {
    return UserModel.countDocuments().exec();
  }

  async create(
    input: CreateUserInput,
    session?: ClientSession,
  ): Promise<UserDocument> {
    const document = {
      email: input.email.toLowerCase().trim(),
      password: input.password,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      role: input.role,
      isActive: input.isActive ?? true,
    };

    if (session) {
      const [user] = await UserModel.create([document], { session });
      return user;
    }

    return UserModel.create(document);
  }

  findByEmail(email: string) {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  findByEmailWithPassword(email: string) {
    return UserModel.findOne({ email: email.toLowerCase().trim() })
      .select('+password')
      .exec();
  }

  findById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      return Promise.resolve(null);
    }
    return UserModel.findById(id).exec();
  }

  findByIdWithPassword(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      return Promise.resolve(null);
    }
    return UserModel.findById(id).select('+password').exec();
  }

  async findByIdOrFail(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) {
      throw notFound('User not found');
    }
    return user;
  }

  async findAll(limit = 100): Promise<PublicUser[]> {
    const users = await UserModel.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return this.withEmployeeIds(users.map((user) => this.toPublicUser(user)));
  }

  async touchLastLogin(id: string, session?: ClientSession): Promise<void> {
    await UserModel.findByIdAndUpdate(
      id,
      { lastLoginAt: new Date() },
      session ? { session } : {},
    ).exec();
  }

  async updateRole(id: string, role: Role): Promise<PublicUser> {
    const user = await this.findByIdOrFail(id);

    if (user.role === Role.ADMIN && role !== Role.ADMIN) {
      const adminCount = await UserModel.countDocuments({
        role: Role.ADMIN,
        isActive: true,
      }).exec();
      if (adminCount <= 1) {
        throw badRequest('Cannot demote the last active administrator');
      }
    }

    user.role = role;
    // Drop denials that no longer apply to the new role catalog.
    user.deniedPermissions = (user.deniedPermissions ?? []).filter(Boolean);
    await user.save();
    return this.toPublicUser(user);
  }

  async updatePermissions(
    id: string,
    allowedPermissions: string[],
  ): Promise<PublicUser> {
    const user = await this.findByIdOrFail(id);
    const cleaned = [
      ...new Set(
        (allowedPermissions ?? [])
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    ];
    user.allowedPermissions = cleaned;
    user.deniedPermissions = [];
    await user.save();
    return this.toPublicUser(user);
  }

  async updateStatus(id: string, isActive: boolean): Promise<PublicUser> {
    const user = await this.findByIdOrFail(id);

    if (user.role === Role.ADMIN && !isActive) {
      const adminCount = await UserModel.countDocuments({
        role: Role.ADMIN,
        isActive: true,
      }).exec();
      if (adminCount <= 1) {
        throw badRequest('Cannot deactivate the last active administrator');
      }
    }

    user.isActive = isActive;
    await user.save();
    return this.toPublicUser(user);
  }

  /** Admin sets a new password for another user (hashed with bcrypt). */
  async resetPassword(id: string, newPassword: string): Promise<PublicUser> {
    const user = await this.findByIdWithPassword(id);
    if (!user) {
      throw notFound('User not found');
    }
    user.password = await hashPassword(newPassword);
    await user.save();
    return this.toPublicUser(user);
  }

  /** Authenticated user changes their own password after verifying the old one. */
  async changeOwnPassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<PublicUser> {
    const user = await this.findByIdWithPassword(userId);
    if (!user) {
      throw notFound('User not found');
    }

    const matches = await comparePassword(oldPassword, user.password);
    if (!matches) {
      throw unauthorized('Current password is incorrect');
    }

    if (oldPassword === newPassword) {
      throw badRequest(
        'New password must be different from the current password',
      );
    }

    user.password = await hashPassword(newPassword);
    await user.save();
    return this.toPublicUser(user);
  }
}
