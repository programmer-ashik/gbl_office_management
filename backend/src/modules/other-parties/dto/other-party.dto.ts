import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OTHER_PARTY_KINDS, type OtherPartyKind } from '../other-party.model';

export class CreateOtherPartyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsIn(OTHER_PARTY_KINDS)
  kind: OtherPartyKind;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}

export class UpdateOtherPartyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
