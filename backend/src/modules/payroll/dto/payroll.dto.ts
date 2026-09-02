import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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
import { TimeUnit } from '../../../common/enums/payroll.enum';

export class SalaryComponentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;
}

export class UpsertSalaryStructureDto {
  @IsMongoId()
  employeeId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  basic: number;

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
