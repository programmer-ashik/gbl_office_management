import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TransferKind } from '../../../common/enums/transfer-kind.enum';
import { TreasuryKind } from '../../../common/enums/treasury-kind.enum';

export class CreateTreasuryAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsEnum(TreasuryKind)
  kind: TreasuryKind;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(12)
  glAccountCode?: string;
}

export class UpdateTreasuryAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTransferDto {
  @IsMongoId()
  fromTreasuryId: string;

  @IsMongoId()
  toTreasuryId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsDateString()
  date: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  memo: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  @IsOptional()
  @IsEnum(TransferKind)
  kind?: TransferKind;
}

export class StatementLineInputDto {
  @IsDateString()
  date: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class PreviewStatementDto {
  @IsOptional()
  @IsString()
  @MaxLength(200000)
  csv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12_000_000)
  pdfBase64?: string;
}

export class ImportReconciliationDto {
  @IsOptional()
  @IsDateString()
  asOf?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  statementBalance?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200000)
  csv?: string;

  /** Base64-encoded PDF bank statement (optionally data-URL prefixed). */
  @IsOptional()
  @IsString()
  @MaxLength(12_000_000)
  pdfBase64?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StatementLineInputDto)
  lines?: StatementLineInputDto[];
}

export class MatchReconciliationDto {
  @IsMongoId()
  statementLineId: string;

  @IsMongoId()
  ledgerLineId: string;
}

export class UnmatchReconciliationDto {
  @IsMongoId()
  statementLineId: string;
}

export enum BankAdjustKind {
  BANK_CHARGE = 'bank_charge',
  BANK_INTEREST = 'bank_interest',
}

export class AdjustReconciliationDto {
  @IsEnum(BankAdjustKind)
  kind: BankAdjustKind;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  memo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;

  /** Optional project tag for project-wise reporting (charges / interest). */
  @IsOptional()
  @IsMongoId()
  projectId?: string;
}
