import { Types } from 'mongoose';
import { ReportTemplateModel } from './report-template.model';
import {
  REPORT_TYPE_BALANCE_SHEET,
  REPORT_TYPE_JOURNAL_VOUCHER,
  defaultBalanceSheetTemplate,
  defaultJournalVoucherTemplate,
  hydrateTemplate,
  normalizeLayout,
  type PublicReportTemplate,
  type ReportTypeValue,
  type TemplateBlock,
} from './report-template.types';
import type { SaveReportTemplateDto } from './dto/report-template.dto';

function toPublic(doc: {
  _id: Types.ObjectId;
  templateName: string;
  reportType: string;
  companyLogoUrl?: string;
  headerConfig: PublicReportTemplate['headerConfig'];
  layoutStructure: TemplateBlock[];
  footerConfig: PublicReportTemplate['footerConfig'];
  isDefault: boolean;
  updatedBy?: Types.ObjectId;
  updatedAt?: Date;
}): PublicReportTemplate {
  const reportType = doc.reportType as ReportTypeValue;
  const fallback =
    reportType === REPORT_TYPE_JOURNAL_VOUCHER
      ? defaultJournalVoucherTemplate()
      : defaultBalanceSheetTemplate();

  return hydrateTemplate(
    {
      id: doc._id.toString(),
      templateName: doc.templateName,
      reportType,
      companyLogoUrl: doc.companyLogoUrl || null,
      headerConfig: doc.headerConfig,
      layoutStructure: normalizeLayout(doc.layoutStructure ?? []),
      footerConfig: doc.footerConfig,
      isDefault: doc.isDefault,
      updatedBy: doc.updatedBy?.toString() ?? null,
      updatedAt: doc.updatedAt?.toISOString() ?? null,
    },
    fallback,
  );
}

export class ReportTemplatesService {
  async getTemplate(reportType: ReportTypeValue): Promise<PublicReportTemplate> {
    const fallback =
      reportType === REPORT_TYPE_JOURNAL_VOUCHER
        ? defaultJournalVoucherTemplate()
        : defaultBalanceSheetTemplate();

    const doc = await ReportTemplateModel.findOne({
      reportType,
      isDefault: true,
    })
      .sort({ updatedAt: -1 })
      .lean()
      .exec();

    if (!doc) return fallback;
    return toPublic(doc as typeof doc & { _id: Types.ObjectId });
  }

  async getBalanceSheetTemplate(): Promise<PublicReportTemplate> {
    return this.getTemplate(REPORT_TYPE_BALANCE_SHEET);
  }

  async getJournalVoucherTemplate(): Promise<PublicReportTemplate> {
    return this.getTemplate(REPORT_TYPE_JOURNAL_VOUCHER);
  }

  async saveTemplate(
    reportType: ReportTypeValue,
    dto: SaveReportTemplateDto,
    userId: string,
  ): Promise<PublicReportTemplate> {
    const fallback =
      reportType === REPORT_TYPE_JOURNAL_VOUCHER
        ? defaultJournalVoucherTemplate()
        : defaultBalanceSheetTemplate();

    const hydrated = hydrateTemplate(
      {
        templateName: dto.templateName,
        companyLogoUrl: dto.companyLogoUrl || null,
        headerConfig: dto.headerConfig as PublicReportTemplate['headerConfig'],
        layoutStructure: normalizeLayout(
          dto.layoutStructure.map((block) => ({
            id: block.id,
            type: block.type as TemplateBlock['type'],
            position: block.position,
            visible: block.visible !== false,
            styles: {
              logoAlign: block.styles?.logoAlign,
              showAccountCodes: block.styles?.showAccountCodes,
            },
          })),
        ),
        footerConfig: dto.footerConfig as PublicReportTemplate['footerConfig'],
      },
      fallback,
    );

    const payload = {
      templateName: hydrated.templateName,
      reportType,
      companyLogoUrl: hydrated.companyLogoUrl || undefined,
      headerConfig: hydrated.headerConfig,
      footerConfig: hydrated.footerConfig,
      layoutStructure: hydrated.layoutStructure,
      isDefault: true,
      updatedBy: new Types.ObjectId(userId),
    };

    const existing = await ReportTemplateModel.findOne({
      reportType,
      isDefault: true,
    }).exec();

    if (existing) {
      existing.templateName = payload.templateName;
      existing.headerConfig = payload.headerConfig;
      existing.footerConfig = payload.footerConfig;
      existing.layoutStructure = payload.layoutStructure;
      existing.isDefault = true;
      existing.updatedBy = payload.updatedBy;
      if (payload.companyLogoUrl) {
        existing.companyLogoUrl = payload.companyLogoUrl;
      } else {
        existing.companyLogoUrl = undefined;
        existing.set('companyLogoUrl', undefined);
      }
      existing.markModified('headerConfig');
      existing.markModified('footerConfig');
      existing.markModified('layoutStructure');
      await existing.save();
      return toPublic(existing);
    }

    const created = await ReportTemplateModel.create(payload);
    return toPublic(created);
  }

  async saveBalanceSheetTemplate(
    dto: SaveReportTemplateDto,
    userId: string,
  ): Promise<PublicReportTemplate> {
    return this.saveTemplate(REPORT_TYPE_BALANCE_SHEET, dto, userId);
  }

  async saveJournalVoucherTemplate(
    dto: SaveReportTemplateDto,
    userId: string,
  ): Promise<PublicReportTemplate> {
    return this.saveTemplate(REPORT_TYPE_JOURNAL_VOUCHER, dto, userId);
  }
}
