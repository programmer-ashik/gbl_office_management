import { Transform } from 'class-transformer';
import {
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class PartyOpeningBalanceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(12)
  accountCode: string;

  @IsIn(['customer', 'supplier', 'employee'])
  entityType: 'customer' | 'supplier' | 'employee';

  @IsMongoId()
  entityId: string;

  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') {
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsString()
  date?: string;
}
