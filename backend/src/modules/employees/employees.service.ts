import { Role } from '../../common/enums/role.enum';
import { conflict, forbidden } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { hashPassword } from '../../common/utils/crypto.util';
import type { PublicUser, UsersService } from '../users/users.service';
import { CreateEmployeeDto, STAFF_ROLES } from './dto/employee.dto';

export class EmployeesService {
  constructor(private readonly usersService: UsersService) {}

  async list(actor: AuthenticatedUser): Promise<PublicUser[]> {
    this.assertManage(actor);
    const users = await this.usersService.findAll(500);
    return users.filter(
      (row) =>
        row.role === Role.EMPLOYEE ||
        row.role === Role.PROJECT_MANAGER ||
        row.role === Role.ACCOUNTANT,
    );
  }

  async create(
    dto: CreateEmployeeDto,
    actor: AuthenticatedUser,
  ): Promise<PublicUser> {
    this.assertAdmin(actor);
    const role = dto.role ?? Role.EMPLOYEE;
    if (!(STAFF_ROLES as readonly Role[]).includes(role)) {
      throw forbidden('Only employee, project manager, or accountant roles can be created here');
    }

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw conflict('Email is already registered');
    }

    const password = await hashPassword(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role,
    });
    return this.usersService.toPublicUser(user);
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
