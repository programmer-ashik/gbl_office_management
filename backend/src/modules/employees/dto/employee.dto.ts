import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../../../common/enums/role.enum';

const STAFF_ROLES = [Role.EMPLOYEE, Role.PROJECT_MANAGER, Role.ACCOUNTANT] as const;

const PASSWORD_MATCH = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MSG = 'Password must contain at least one letter and one number';

export class CreateEmployeeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  email!: string;

  /** Legacy field — still accepted for existing clients. */
  @ValidateIf((o: CreateEmployeeDto) => !o.default_password)
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_MATCH, { message: PASSWORD_MSG })
  password?: string;

  /** Preferred field when an Admin creates an employee. */
  @ValidateIf((o: CreateEmployeeDto) => !o.password)
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_MATCH, { message: PASSWORD_MSG })
  default_password?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export { STAFF_ROLES };
