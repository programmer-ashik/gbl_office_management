import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { badRequest, conflict, forbidden } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { hashPassword } from '../../common/utils/crypto.util';
import { toMinorUnits } from '../../common/utils/money';
import { withTransaction } from '../../database/connection';
import { UserModel, type UserDocument } from '../users/user.model';
import type { UsersService } from '../users/users.service';
import {
  CreateEmployeeDto,
  GrantEmployeeAccessDto,
  STAFF_ROLES,
  UpdateEmployeeDto,
  wantsAccount,
} from './dto/employee.dto';
import { EmployeeModel, type EmployeeDocument } from './employee.model';
import {
  emptyEmployeeExpenseSummary,
  employeeExpenseSummaries,
} from './employee-expenses';
import {
  employeeIdForUser,
  findEmployee,
  findEmployeeOrFail,
  toPublicEmployee,
  type PublicEmployee,
} from './employee-records';

export class EmployeesService {
  constructor(private readonly usersService: UsersService) {}

  findEmployee(id: string, session?: ClientSession) {
    return findEmployee(id, session);
  }

  findByIdOrFail(id: string, session?: ClientSession) {
    return findEmployeeOrFail(id, session);
  }

  employeeIdForUser(userId: string) {
    return employeeIdForUser(userId);
  }

  async list(actor: AuthenticatedUser): Promise<PublicEmployee[]> {
    this.assertManage(actor);
    const rows = await EmployeeModel.find()
      .sort({ firstName: 1, lastName: 1 })
      .limit(1000)
      .exec();
    return this.withAccounts(rows, { expenses: true });
  }

  async get(id: string, actor: AuthenticatedUser): Promise<PublicEmployee> {
    this.assertManage(actor);
    const row = await findEmployeeOrFail(id);
    const [publicRow] = await this.withAccounts([row], { expenses: true });
    return publicRow;
  }

  async create(
    dto: CreateEmployeeDto,
    actor: AuthenticatedUser,
  ): Promise<PublicEmployee> {
    this.assertAdmin(actor);
    const profile = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email: dto.email,
      phone: dto.phone?.trim(),
      designation: dto.designation?.trim(),
      salaryMinor: dto.salary != null ? toMinorUnits(dto.salary) : undefined,
      joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
      isActive: true,
      createdBy: new Types.ObjectId(actor.userId),
    };

    if (!wantsAccount(dto)) {
      const employee = await EmployeeModel.create({ ...profile, userId: null });
      return toPublicEmployee(employee);
    }

    const plainPassword = dto.password ?? dto.default_password;
    if (!dto.email || !plainPassword) {
      throw badRequest('email and password are required to grant software access');
    }
    const role = this.assertStaffRole(dto.role);
    await this.assertEmailFree(dto.email);
    const password = await hashPassword(plainPassword);

    const { employee, user } = await withTransaction(async (session) => {
      const created = await this.usersService.create(
        {
          email: dto.email!,
          password,
          firstName: profile.firstName,
          lastName: profile.lastName,
          role,
        },
        session,
      );
      const [row] = await EmployeeModel.create(
        [{ ...profile, userId: created._id }],
        { session },
      );
      return { employee: row, user: created };
    });
    return toPublicEmployee(employee, user);
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    actor: AuthenticatedUser,
  ): Promise<PublicEmployee> {
    this.assertAdmin(actor);
    const row = await findEmployeeOrFail(id);
    if (dto.firstName !== undefined) row.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) row.lastName = dto.lastName.trim();
    if (dto.email !== undefined) row.email = dto.email;
    if (dto.phone !== undefined) row.phone = dto.phone.trim();
    if (dto.designation !== undefined) row.designation = dto.designation.trim();
    if (dto.salary !== undefined) row.salaryMinor = toMinorUnits(dto.salary);
    if (dto.joinDate !== undefined) row.joinDate = new Date(dto.joinDate);
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    await row.save();
    const [publicRow] = await this.withAccounts([row], { expenses: true });
    return publicRow;
  }

  /** Creates a login for an employee who has none and links it. */
  async grantAccess(
    id: string,
    dto: GrantEmployeeAccessDto,
    actor: AuthenticatedUser,
  ): Promise<PublicEmployee> {
    this.assertAdmin(actor);
    const role = this.assertStaffRole(dto.role);
    const existing = await findEmployeeOrFail(id);
    if (existing.userId) {
      const linked = await UserModel.exists({ _id: existing.userId }).exec();
      if (linked) {
        throw conflict('This employee already has a login account');
      }
    }
    await this.assertEmailFree(dto.email);
    const password = await hashPassword(dto.password);

    const { employee, user } = await withTransaction(async (session) => {
      const created = await this.usersService.create(
        {
          email: dto.email,
          password,
          firstName: existing.firstName,
          lastName: existing.lastName,
          role,
        },
        session,
      );
      const row = await EmployeeModel.findOneAndUpdate(
        {
          _id: existing._id,
          $or: [{ userId: null }, { userId: existing.userId ?? null }],
        },
        { $set: { userId: created._id } },
        { new: true, session },
      ).exec();
      if (!row) {
        throw conflict('This employee was linked to another account meanwhile');
      }
      return { employee: row, user: created };
    });
    return toPublicEmployee(employee, user);
  }

  private async withAccounts(
    rows: EmployeeDocument[],
    options: { expenses?: boolean } = {},
  ): Promise<PublicEmployee[]> {
    const userIds = rows
      .map((row) => row.userId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const [users, expenses] = await Promise.all([
      userIds.length
        ? UserModel.find({ _id: { $in: userIds } }).exec()
        : Promise.resolve([] as UserDocument[]),
      options.expenses
        ? employeeExpenseSummaries(rows.map((row) => row._id))
        : Promise.resolve(null),
    ]);
    const byId = new Map<string, UserDocument>(
      users.map((user) => [user._id.toString(), user]),
    );
    return rows.map((row) => {
      const publicRow = toPublicEmployee(
        row,
        row.userId ? byId.get(row.userId.toString()) : null,
      );
      if (!expenses) return publicRow;
      return {
        ...publicRow,
        expenses:
          expenses.get(row._id.toString()) ?? emptyEmployeeExpenseSummary(),
      };
    });
  }

  private assertStaffRole(role: Role | undefined): Role {
    const value = role ?? Role.EMPLOYEE;
    if (!(STAFF_ROLES as readonly Role[]).includes(value)) {
      throw forbidden(
        'Only employee, project manager, or accountant roles can be created here',
      );
    }
    return value;
  }

  private async assertEmailFree(email: string): Promise<void> {
    if (await this.usersService.findByEmail(email)) {
      throw conflict('Email is already registered');
    }
  }

  private assertManage(actor: AuthenticatedUser): void {
    if (actor.role !== Role.ADMIN && actor.role !== Role.ACCOUNTANT) {
      throw forbidden('Finance role required to view employees');
    }
  }

  private assertAdmin(actor: AuthenticatedUser): void {
    if (actor.role !== Role.ADMIN) {
      throw forbidden('Only administrators can add employees');
    }
  }
}
