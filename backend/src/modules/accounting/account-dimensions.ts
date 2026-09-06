import { badRequest } from '../../common/errors/app-error';
import {
  JournalEntityType,
  type JournalEntityType as EntityType,
} from './journal.enums';
import { SystemAccountCode } from './system-account-codes';

export type DimensionRule = {
  entityType: EntityType | null;
  entityRequired: boolean;
  projectRequired: boolean;
  label: string;
};

/** Control-account rules for manual journals. System journals skip these. */
const RULES_BY_CODE: Record<string, DimensionRule> = {
  [SystemAccountCode.ACCOUNTS_RECEIVABLE]: {
    entityType: JournalEntityType.CUSTOMER,
    entityRequired: true,
    projectRequired: false,
    label: 'Accounts Receivable',
  },
  [SystemAccountCode.ACCOUNTS_PAYABLE]: {
    entityType: JournalEntityType.SUPPLIER,
    entityRequired: true,
    projectRequired: false,
    label: 'Accounts Payable',
  },
  [SystemAccountCode.SUBCONTRACTOR_PAYABLE]: {
    entityType: JournalEntityType.SUPPLIER,
    entityRequired: true,
    projectRequired: false,
    label: 'Subcontractor Payables',
  },
  [SystemAccountCode.EMPLOYEE_ADVANCES]: {
    entityType: JournalEntityType.EMPLOYEE,
    entityRequired: true,
    projectRequired: true,
    label: 'Employee Advances',
  },
  [SystemAccountCode.EMPLOYEE_PAYABLES]: {
    entityType: JournalEntityType.EMPLOYEE,
    entityRequired: true,
    projectRequired: false,
    label: 'Employee Payables',
  },
  [SystemAccountCode.PROJECT_MATERIALS]: {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Raw Material Expenses',
  },
  [SystemAccountCode.PROJECT_LABOR]: {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Project Labor',
  },
  [SystemAccountCode.EQUIPMENT_RENTAL]: {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Equipment Rental',
  },
  [SystemAccountCode.SITE_TRANSPORT]: {
    entityType: null,
    entityRequired: false,
    projectRequired: true,
    label: 'Site Transport',
  },
  [SystemAccountCode.CASH]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Petty Cash',
  },
  [SystemAccountCode.BANK]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'BRAC Bank',
  },
  [SystemAccountCode.BANK_ALT]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'DBBL Bank',
  },
  [SystemAccountCode.MOBILE_BANKING]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Mobile Banking',
  },
};

export function dimensionRuleForAccount(accountCode: string): DimensionRule {
  const code = accountCode.trim().toUpperCase();
  return (
    RULES_BY_CODE[code] ?? {
      entityType: null,
      entityRequired: false,
      projectRequired: false,
      label: code,
    }
  );
}

export function assertManualLineDimensions(input: {
  accountCode: string;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  headerProjectId?: string | null;
}): void {
  const rule = dimensionRuleForAccount(input.accountCode);
  const projectId = input.projectId || input.headerProjectId || null;

  if (rule.entityRequired) {
    if (!input.entityId) {
      throw badRequest(
        `${rule.label} (${input.accountCode}) requires a ${rule.entityType} entity`,
      );
    }
    if (rule.entityType && input.entityType && input.entityType !== rule.entityType) {
      throw badRequest(
        `${rule.label} expects entity type ${rule.entityType}, got ${input.entityType}`,
      );
    }
  }

  if (rule.projectRequired && !projectId) {
    throw badRequest(`${rule.label} (${input.accountCode}) requires a project`);
  }
}

export function suggestedEntityType(accountCode: string): EntityType | null {
  return dimensionRuleForAccount(accountCode).entityType;
}
