import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../../../common/enums/role.enum';

const STAFF_ROLES = [Role.EMPLOYEE, Role.PROJECT_MANAGER, Role.ACCOUNTANT] as const;

const PASSWORD_MATCH = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MSG = 'Password must contain at least one letter and one number';

const lowerTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase().trim() : value;
const optionalEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase().trim() || undefined : value;
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/**
 * A login is created when `createAccount` is true. Older clients that omit
 * the flag but send a password still get one, as before the split.
 */
export function wantsAccount(dto: {
  createAccount?: boolean;
  password?: string;
  default_password?: string;
}): boolean {
  if (dto.createAccount !== undefined) return dto.createAccount;
  return Boolean(dto.password || dto.default_password);
}

class EmployeeProfileFields {
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(120)
  designation?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salary?: number;

  @IsOptional()
  @Transform(blankToUndefined)
  @IsDateString()
  joinDate?: string;
}

export class CreateEmployeeDto extends EmployeeProfileFields {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  /** HR contact email; also the login email when an account is created. */
  @Transform(optionalEmail)
  @ValidateIf((o: CreateEmployeeDto) => wantsAccount(o) || o.email !== undefined)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  createAccount?: boolean;

  @ValidateIf((o: CreateEmployeeDto) => wantsAccount(o) && !o.default_password)
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_MATCH, { message: PASSWORD_MSG })
  password?: string;

  /** Legacy alias of `password`. */
  @ValidateIf((o: CreateEmployeeDto) => wantsAccount(o) && !o.password)
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_MATCH, { message: PASSWORD_MSG })
  default_password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateEmployeeDto extends EmployeeProfileFields {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @Transform(optionalEmail)
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class GrantEmployeeAccessDto {
  @Transform(lowerTrim)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(PASSWORD_MATCH, { message: PASSWORD_MSG })
  password!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export { PASSWORD_MATCH, PASSWORD_MSG, STAFF_ROLES };
