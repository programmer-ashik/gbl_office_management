import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
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

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

export class JournalLineDto {
  @IsString()
  @MinLength(3)
  @MaxLength(12)
  accountCode: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  projectId?: string;
}

export class PostJournalDto {
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
  @Transform(emptyToUndefined)
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  approvalId?: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'A journal entry needs at least two lines' })
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
