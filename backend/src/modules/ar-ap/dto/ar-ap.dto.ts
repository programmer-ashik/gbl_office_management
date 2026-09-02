import { Transform } from 'class-transformer';
import {
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
} from 'class-validator';
import {
  BillPaymentType,
  InvoiceType,
} from '../../../common/enums/ar-ap.enum';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateInvoiceDto {
  @IsMongoId()
  projectId: string;

  @IsEnum(InvoiceType)
  type: InvoiceType;

  @IsDateString()
  date: string;

  @IsDateString()
  dueDate: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  milestoneLabel?: string;
}

export class CollectInvoiceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsMongoId()
  treasuryId: string;

  @IsDateString()
  date: string;
}

export class CreateSupplierBillDto {
  @IsMongoId()
  supplierId: string;

  @IsEnum(BillPaymentType)
  paymentType: BillPaymentType;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(2)
  @MaxLength(500)
  description: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  expenseAccountCode?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  treasuryId?: string;
}

export class CreateSupplierPaymentDto {
  @IsMongoId()
  supplierId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsMongoId()
  treasuryId: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class ExecuteSupplierPaymentDto {
  @IsDateString()
  date: string;
}

export class AgingQueryDto {
  @IsOptional()
  @IsDateString()
  asOf?: string;
}
