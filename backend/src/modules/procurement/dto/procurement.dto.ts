import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
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
import { PurchaseDestination } from '../../../common/enums/procurement.enum';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  sku: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(24)
  unit: string;
}

export class PurchaseOrderLineDto {
  @IsMongoId()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @IsMongoId()
  supplierId: string;

  @IsEnum(PurchaseDestination)
  destination: PurchaseDestination;

  @IsDateString()
  date: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines: PurchaseOrderLineDto[];
}

export class ReceiveLineDto {
  @IsMongoId()
  lineId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;
}

export class ReceiveGoodsDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsIn(['due', 'cash', 'bank'])
  paymentMethod?: 'due' | 'cash' | 'bank';

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  treasuryId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}

export class ReturnGoodsDto {
  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}

export class IssueStockLineDto {
  @IsMongoId()
  itemId: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;
}

export class IssueStockDto {
  @IsMongoId()
  warehouseId: string;

  @IsMongoId()
  projectId: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IssueStockLineDto)
  lines: IssueStockLineDto[];
}
