import { Types } from 'mongoose';
import { fromMinorUnits } from '../../common/utils/money';
import {
  AccountModel,
  EmployeeExpenseKind,
} from '../accounting/account.model';
import { JournalEntityType } from '../accounting/journal.enums';
import { LedgerLineModel } from '../accounting/ledger.model';

export interface EmployeeExpenseAccountTotal {
  accountCode: string;
  accountName: string;
  kind: EmployeeExpenseKind;
  amount: number;
}

export interface EmployeeExpenseSummary {
  /** Net debit on salary heads (e.g. 5230) tagged to this employee. */
  salary: number;
  /** Net debit on conveyance heads (e.g. 5141) tagged to this employee. */
  conveyance: number;
  total: number;
  byAccount: EmployeeExpenseAccountTotal[];
}

export function emptyEmployeeExpenseSummary(): EmployeeExpenseSummary {
  return { salary: 0, conveyance: 0, total: 0, byAccount: [] };
}

/**
 * Posted salary / conveyance drawn per employee, from ledger lines tagged
 * with the employee on accounts flagged `employeeExpenseKind`.
 * Reversals post opposite ledger lines, so they net out.
 */
export async function employeeExpenseSummaries(
  employeeIds: Array<string | Types.ObjectId>,
): Promise<Map<string, EmployeeExpenseSummary>> {
  const out = new Map<string, EmployeeExpenseSummary>();
  const ids = employeeIds
    .map((id) => String(id))
    .filter((id) => Types.ObjectId.isValid(id));
  if (ids.length === 0) return out;

  const heads = await AccountModel.find(
    { employeeExpenseKind: { $exists: true, $ne: null } },
    { code: 1, name: 1, employeeExpenseKind: 1 },
  )
    .lean()
    .exec();
  if (heads.length === 0) return out;
  const headByCode = new Map(heads.map((head) => [head.code, head]));

  const rows = await LedgerLineModel.aggregate<{
    _id: { entityId: Types.ObjectId; accountCode: string };
    debitMinor: number;
    creditMinor: number;
  }>([
    {
      $match: {
        entityType: JournalEntityType.EMPLOYEE,
        entityId: { $in: ids.map((id) => new Types.ObjectId(id)) },
        accountCode: { $in: [...headByCode.keys()] },
      },
    },
    {
      $group: {
        _id: { entityId: '$entityId', accountCode: '$accountCode' },
        debitMinor: { $sum: '$debitMinor' },
        creditMinor: { $sum: '$creditMinor' },
      },
    },
  ]);

  const minors = new Map<string, { salary: number; conveyance: number }>();
  for (const row of rows) {
    const head = headByCode.get(row._id.accountCode);
    if (!head?.employeeExpenseKind) continue;
    const key = row._id.entityId.toString();
    const netMinor = row.debitMinor - row.creditMinor;
    const summary = out.get(key) ?? emptyEmployeeExpenseSummary();
    const minor = minors.get(key) ?? { salary: 0, conveyance: 0 };
    summary.byAccount.push({
      accountCode: head.code,
      accountName: head.name,
      kind: head.employeeExpenseKind,
      amount: fromMinorUnits(netMinor),
    });
    if (head.employeeExpenseKind === EmployeeExpenseKind.SALARY) {
      minor.salary += netMinor;
    } else {
      minor.conveyance += netMinor;
    }
    out.set(key, summary);
    minors.set(key, minor);
  }

  for (const [key, summary] of out) {
    const minor = minors.get(key)!;
    summary.salary = fromMinorUnits(minor.salary);
    summary.conveyance = fromMinorUnits(minor.conveyance);
    summary.total = fromMinorUnits(minor.salary + minor.conveyance);
    summary.byAccount.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }
  return out;
}
