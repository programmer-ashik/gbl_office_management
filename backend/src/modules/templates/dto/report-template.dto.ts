import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' || value === null ? undefined : value;

class TemplateBlockStylesDto {
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  logoAlign?: 'left' | 'center' | 'right';

  @IsOptional()
  @IsBoolean()
  showAccountCodes?: boolean;

  @IsOptional()
  @IsBoolean()
  showPartyBreakdown?: boolean;
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
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
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

class VoucherConfigDto {
  @IsOptional()
  @IsIn(['yellow', 'blue', 'emerald', 'crimson', 'charcoal'])
  theme?: 'yellow' | 'blue' | 'emerald' | 'crimson' | 'charcoal';

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(120)
  companySubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  currencyLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  majorUnitLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  minorUnitLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  amountInWordsLabel?: string;

  @IsOptional()
  @IsBoolean()
  showWatermark?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  signatoryTitles?: string[];
}

export class SaveReportTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  templateName?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
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

  @IsOptional()
  @ValidateNested()
  @Type(() => VoucherConfigDto)
  voucherConfig?: VoucherConfigDto;
}

/** @deprecated alias */
export class SaveBalanceSheetTemplateDto extends SaveReportTemplateDto {}
