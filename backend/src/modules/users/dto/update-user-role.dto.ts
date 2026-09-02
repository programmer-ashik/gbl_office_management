import { IsEnum } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class UpdateUserRoleDto {
  @IsEnum(Role, {
    message:
      'role must be one of: admin, accountant, project_manager, employee',
  })
  role: Role;
}
