import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AccountType } from '../../../common/enums/account-type.enum';
import {
  ACCOUNT_PARTY_TYPES,
  EMPLOYEE_EXPENSE_KIND_VALUES,
  type AccountPartyType,
  type EmployeeExpenseKind,
} from '../account.model';

const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

export class CreateAccountDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{3,12}$/, {
    message: 'code must be 3-12 letters, numbers, or hyphens',
  })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value.trim().toUpperCase() : value;
  })
  @IsString()
  parentCode?: string;

  /** Omitted or empty: postable. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsBoolean()
  isPostable?: boolean;

  /** Optional go-live amount; posts a balanced Opening Balance journal vs capital. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  openingBalance?: number;

  /** Salary / conveyance heads show an employee picker on journal lines. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(EMPLOYEE_EXPENSE_KIND_VALUES)
  employeeExpenseKind?: EmployeeExpenseKind | null;

  /** Journal lines on this account pick a customer / supplier / employee. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(ACCOUNT_PARTY_TYPES)
  partyType?: AccountPartyType | null;
}

export class SplitAccountChildDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9-]{3,12}$/, {
    message: 'code must be 3-12 letters, numbers, or hyphens',
  })
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;
}

export class SplitAccountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SplitAccountChildDto)
  children: SplitAccountChildDto[];

  /** Sub-account code that receives the balance already posted to the account. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined,
  )
  @IsString()
  historyTo?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;

  /** `null` (or empty string) clears the flag. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(EMPLOYEE_EXPENSE_KIND_VALUES)
  employeeExpenseKind?: EmployeeExpenseKind | null;

  /** `null` (or empty string) clears the party list. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(ACCOUNT_PARTY_TYPES)
  partyType?: AccountPartyType | null;

  @IsOptional()
  @IsBoolean()
  journalPicker?: boolean;
}
