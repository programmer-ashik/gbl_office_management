import { badRequest } from '../../common/errors/app-error';
import {
  JournalEntityType,
  type JournalEntityType as EntityType,
} from './journal.enums';
import { AccountModel } from './account.model';
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
    // Office / general staff advances are not tied to a project; tag one when relevant.
    projectRequired: false,
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
    label: 'Cash in Hand',
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
  [SystemAccountCode.CITY_BANK]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'City Bank',
  },
  [SystemAccountCode.MOBILE_BANKING]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'bKash',
  },
  [SystemAccountCode.NAGAD]: {
    entityType: JournalEntityType.TREASURY,
    entityRequired: false,
    projectRequired: false,
    label: 'Nagad',
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

/** Every head opened under this group is a direct project cost. */
export const PROJECT_COST_GROUP_CODE = SystemAccountCode.DIRECT_PROJECT_COST;

/** Codes whose parent chain reaches Direct Project Cost (COGS), at any depth. */
export async function codesUnderProjectCost(codes: string[]): Promise<Set<string>> {
  const wanted = new Set(codes.map((code) => code.trim().toUpperCase()));
  const out = new Set<string>();
  if (wanted.size === 0) return out;
  const rows = await AccountModel.find({}, { code: 1, parentCode: 1 }).lean().exec();
  const parentOf = new Map(rows.map((row) => [row.code, row.parentCode ?? null]));
  for (const code of wanted) {
    const seen = new Set<string>();
    let parent = parentOf.get(code) ?? null;
    while (parent && !seen.has(parent)) {
      if (parent === PROJECT_COST_GROUP_CODE) {
        out.add(code);
        break;
      }
      seen.add(parent);
      parent = parentOf.get(parent) ?? null;
    }
  }
  return out;
}

export function assertManualLineDimensions(input: {
  accountCode: string;
  entityType?: string | null;
  entityId?: string | null;
  projectId?: string | null;
  headerProjectId?: string | null;
  /** Opening balances carry old dues that are often not tied to a project. */
  skipProjectRequirement?: boolean;
  /** Head sits under 5100 Direct Project Cost (COGS). */
  isProjectCost?: boolean;
  accountName?: string;
}): void {
  const base = dimensionRuleForAccount(input.accountCode);
  const rule: DimensionRule =
    input.isProjectCost && !base.projectRequired
      ? {
          ...base,
          projectRequired: true,
          label: input.accountName || base.label,
        }
      : base;
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

  if (rule.projectRequired && !projectId && !input.skipProjectRequirement) {
    throw badRequest(`${rule.label} (${input.accountCode}) requires a project`);
  }
}

export function suggestedEntityType(accountCode: string): EntityType | null {
  return dimensionRuleForAccount(accountCode).entityType;
}
