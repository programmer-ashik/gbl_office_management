import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccountType } from '../../../common/enums/account-type.enum';

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

  @IsOptional()
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
}
