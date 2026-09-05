import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TemplateBlockStylesDto {
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  logoAlign?: 'left' | 'center' | 'right';

  @IsOptional()
  @IsBoolean()
  showAccountCodes?: boolean;
}

class TemplateBlockDto {
  @IsString()
  @MaxLength(80)
  id!: string;

  @IsIn([
    'LOGO',
    'COMPANY_HEADER',
    'METRIC_TILES',
    'ASSETS_SECTION',
    'LIABILITIES_SECTION',
    'EQUITY_SECTION',
    'VOUCHER_META',
    'LINES_TABLE',
    'FOOTER_SIGNATURES',
  ])
  type!: string;

  @IsNumber()
  @Min(0)
  position!: number;

  @IsBoolean()
  visible!: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TemplateBlockStylesDto)
  styles?: TemplateBlockStylesDto;
}

class HeaderConfigDto {
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @IsString()
  @MaxLength(200)
  reportTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsBoolean()
  showDate!: boolean;

  @IsBoolean()
  showStatusBadge!: boolean;
}

class FooterConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  preparedByLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  checkedByLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  authorizedLabel?: string;

  @IsBoolean()
  showManagingDirector!: boolean;

  @IsBoolean()
  showAuditor!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  managingDirectorLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  auditorLabel?: string;
}

export class SaveReportTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  templateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyLogoUrl?: string;

  @ValidateNested()
  @Type(() => HeaderConfigDto)
  headerConfig!: HeaderConfigDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateBlockDto)
  layoutStructure!: TemplateBlockDto[];

  @ValidateNested()
  @Type(() => FooterConfigDto)
  footerConfig!: FooterConfigDto;
}

/** @deprecated alias */
export class SaveBalanceSheetTemplateDto extends SaveReportTemplateDto {}
