import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  JOURNAL_ENTITY_TYPE_VALUES,
  JOURNAL_TYPE_VALUES,
} from '../journal.enums';

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

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(JOURNAL_ENTITY_TYPE_VALUES)
  entityType?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsMongoId()
  entityId?: string;
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
  @IsIn(JOURNAL_TYPE_VALUES)
  journalType?: string;

  /** draft = save without posting; post = immediate post (default). */
  @IsOptional()
  @IsIn(['draft', 'post'])
  intent?: 'draft' | 'post';

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
