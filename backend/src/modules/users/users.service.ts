import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { badRequest, notFound } from '../../common/errors/app-error';
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
  lastLoginAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UsersService {
  toPublicUser(user: UserDocument): PublicUser {
    return {
      id: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
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
    return users.map((user) => this.toPublicUser(user));
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
}
