import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  REPORT_TYPE_BALANCE_SHEET,
  REPORT_TYPE_JOURNAL_VOUCHER,
  type FooterConfig,
  type HeaderConfig,
  type TemplateBlock,
} from './report-template.types';

export interface IReportTemplate {
  templateName: string;
  reportType: string;
  companyLogoUrl?: string;
  headerConfig: HeaderConfig;
  layoutStructure: TemplateBlock[];
  footerConfig: FooterConfig;
  isDefault: boolean;
  updatedBy?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ReportTemplateDocument = HydratedDocument<IReportTemplate>;

const stylesSchema = new Schema(
  {
    logoAlign: {
      type: String,
      enum: ['left', 'center', 'right'],
    },
    showAccountCodes: { type: Boolean },
  },
  { _id: false },
);

const blockSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'LOGO',
        'COMPANY_HEADER',
        'METRIC_TILES',
        'ASSETS_SECTION',
        'LIABILITIES_SECTION',
        'EQUITY_SECTION',
        'VOUCHER_META',
        'LINES_TABLE',
        'FOOTER_SIGNATURES',
      ],
    },
    position: { type: Number, required: true },
    visible: { type: Boolean, required: true, default: true },
    styles: { type: stylesSchema, default: () => ({}) },
  },
  { _id: false },
);

const headerSchema = new Schema(
  {
    companyName: { type: String, required: true, maxlength: 160 },
    reportTitle: { type: String, required: true, maxlength: 200 },
    address: { type: String, default: '', maxlength: 400 },
    taxId: { type: String, default: '', maxlength: 80 },
    showDate: { type: Boolean, default: true },
    showStatusBadge: { type: Boolean, default: true },
  },
  { _id: false },
);

const footerSchema = new Schema(
  {
    preparedByLabel: { type: String, default: 'Prepared by', maxlength: 80 },
    checkedByLabel: { type: String, default: 'Checked by', maxlength: 80 },
    authorizedLabel: {
      type: String,
      default: 'Authorized signature',
      maxlength: 80,
    },
    showManagingDirector: { type: Boolean, default: true },
    showAuditor: { type: Boolean, default: false },
    managingDirectorLabel: {
      type: String,
      default: 'Managing Director',
      maxlength: 80,
    },
    auditorLabel: { type: String, default: 'Auditor', maxlength: 80 },
  },
  { _id: false },
);

const reportTemplateSchema = new Schema<IReportTemplate>(
  {
    templateName: { type: String, required: true, trim: true, maxlength: 160 },
    reportType: {
      type: String,
      required: true,
      enum: [REPORT_TYPE_BALANCE_SHEET, REPORT_TYPE_JOURNAL_VOUCHER],
      index: true,
    },
    companyLogoUrl: { type: String, trim: true, maxlength: 500 },
    headerConfig: { type: headerSchema, required: true },
    layoutStructure: { type: [blockSchema], required: true },
    footerConfig: { type: footerSchema, required: true },
    isDefault: { type: Boolean, required: true, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'report_templates' },
);

reportTemplateSchema.index({ reportType: 1, isDefault: 1 });

export const ReportTemplateModel =
  (models.ReportTemplate as Model<IReportTemplate> | undefined) ??
  model<IReportTemplate>('ReportTemplate', reportTemplateSchema);
