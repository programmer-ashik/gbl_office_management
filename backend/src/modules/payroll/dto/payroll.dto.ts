import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ConveyanceType,
  MedicalAllowanceType,
  TimeUnit,
} from '../../../common/enums/payroll.enum';

export class SalaryComponentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}

export class SalaryBreakdownDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  houseRent?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  medicalAllowance?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  conveyanceAllowance?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherAllowances?: number;
}

export class SalaryDeductionDetailDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  providentFund?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxDeduction?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  advanceAdjustment?: number;
}

/**
 * Prefer `grossSalary` + optional breakdown overrides.
 * Legacy `basic` + allowances/deductions still accepted for older clients.
 */
export class UpsertSalaryStructureDto {
  @IsMongoId()
  employeeId: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  grossSalary?: number;

  @IsOptional()
  @IsBoolean()
  customBreakdownApplied?: boolean;

  /** Alias of customBreakdownApplied */
  @IsOptional()
  @IsBoolean()
  customOverride?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryBreakdownDto)
  breakdown?: SalaryBreakdownDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryDeductionDetailDto)
  deductionsDetail?: SalaryDeductionDetailDto;

  /** @deprecated Prefer grossSalary */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  basic?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  allowances?: SalaryComponentDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  deductions?: SalaryComponentDto[];
}

export class UpdatePayrollSettingsDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  basicPercentOfGross: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  houseRentPercentOfBasic: number;

  @IsEnum(MedicalAllowanceType)
  medicalType: MedicalAllowanceType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  medicalValue: number;

  @IsEnum(ConveyanceType)
  conveyanceType: ConveyanceType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  conveyanceValue: number;
}

export class PreviewSalaryBreakdownDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  grossSalary: number;

  @IsOptional()
  @IsBoolean()
  customBreakdownApplied?: boolean;

  @IsOptional()
  @IsBoolean()
  customOverride?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryBreakdownDto)
  breakdown?: SalaryBreakdownDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalaryDeductionDetailDto)
  deductionsDetail?: SalaryDeductionDetailDto;
}

export class CreateTimeLogDto {
  @IsMongoId()
  employeeId: string;

  @IsMongoId()
  projectId: string;

  @IsInt()
  @Min(2000)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  @IsEnum(TimeUnit)
  unit: TimeUnit;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

export class GeneratePayrollDto {
  @IsInt()
  @Min(2000)
  periodYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;
}

export class DisbursePayrollDto {
  @IsMongoId()
  treasuryId: string;

  @IsString()
  date: string;
}
