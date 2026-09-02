import { IsEnum, IsMongoId, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApprovalEntityType } from '../../../common/enums/governance.enum';

export class CreateApprovalDto {
  @IsEnum(ApprovalEntityType)
  entityType: ApprovalEntityType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @MaxLength(500)
  summary: string;

  @IsOptional()
  @IsMongoId()
  projectId?: string;

  /** Opaque payload for the intended action (journal lines, transfer ids, etc.) */
  @IsObject()
  payload: Record<string, unknown>;
}

export class DecideApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ExecuteApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resultRef?: string;
}

export class OcrScanDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  textHint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  imageName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  imageBase64?: string;
}
