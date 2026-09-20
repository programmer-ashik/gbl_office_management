import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateAdvanceDto {
  @IsMongoId()
  projectId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  purpose: string;

  @IsOptional()
  @IsMongoId()
  employeeId?: string;
}

export class RejectAdvanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class DisburseAdvanceDto {
  @IsMongoId()
  treasuryId: string;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;

  @IsOptional()
  @IsMongoId()
  approvalId?: string;
}

export class SettlementVoucherDto {
  @IsString()
  @MinLength(3)
  @MaxLength(12)
  accountCode: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;
}

export class SubmitSettlementDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementVoucherDto)
  lines: SettlementVoucherDto[];
}

export class ConfirmSettlementDto {
  @IsOptional()
  @IsMongoId()
  returnTreasuryId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ReimburseAdvanceDto {
  @IsMongoId()
  treasuryId: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}
