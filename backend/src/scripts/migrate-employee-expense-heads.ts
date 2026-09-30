import '../load-env';
import 'reflect-metadata';
import { AccountType } from '../common/enums/account-type.enum';
import { loadConfig } from '../config';
import { connectDatabase, disconnectDatabase } from '../database/connection';
import {
  AccountModel,
  EmployeeExpenseKind,
} from '../modules/accounting/account.model';

/**
 * Flags the salary and conveyance expense heads so journal lines on them show
 * an employee picker and roll up into the Employee Directory. Only sets the
 * optional `employeeExpenseKind` field; journals and ledger lines are untouched.
 *
 * Defaults: 5230 Office Employee Salary → salary, 5141 Convence Transport Bill → conveyance.
 *
 * Usage:
 *   npm run migrate:employee-expense-heads                     # dry run
 *   npm run migrate:employee-expense-heads -- --apply
 *   ... -- --apply --salary=5230 --conveyance=5141,5142       # other codes
 */
function codesArg(name: string, fallback: string[]): string[] {
  const raw = process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const targets: Array<{ code: string; kind: EmployeeExpenseKind }> = [
    ...codesArg('salary', ['5230']).map((code) => ({
      code,
      kind: EmployeeExpenseKind.SALARY,
    })),
    ...codesArg('conveyance', ['5141']).map((code) => ({
      code,
      kind: EmployeeExpenseKind.CONVEYANCE,
    })),
  ];

  loadConfig();
  await connectDatabase();

  let changes = 0;
  for (const target of targets) {
    const account = await AccountModel.findOne({ code: target.code }).exec();
    if (!account) {
      console.log(`SKIP ${target.code}: account not found`);
      continue;
    }
    const label = `${account.code} ${account.name}`;
    if (account.type !== AccountType.EXPENSE || !account.isPostable) {
      console.log(`SKIP ${label}: not a postable expense account`);
      continue;
    }
    if (account.employeeExpenseKind === target.kind) {
      console.log(`OK   ${label}: already ${target.kind}`);
      continue;
    }
    if (account.employeeExpenseKind) {
      console.log(
        `SKIP ${label}: already flagged ${account.employeeExpenseKind}; change it from Chart of Accounts`,
      );
      continue;
    }
    changes += 1;
    if (apply) {
      await AccountModel.updateOne(
        { _id: account._id },
        { $set: { employeeExpenseKind: target.kind } },
      ).exec();
      console.log(`SET  ${label} → ${target.kind}`);
    } else {
      console.log(`PLAN ${label} → ${target.kind}`);
    }
  }

  if (!apply && changes > 0) {
    console.log('Dry run only. Re-run with --apply to save.');
  }
  await disconnectDatabase();
}

main().catch(async (err: unknown) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
