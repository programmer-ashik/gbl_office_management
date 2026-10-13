import '../load-env';
import 'reflect-metadata';
import { Role } from '../common/enums/role.enum';
import { loadConfig } from '../config';
import { connectDatabase, disconnectDatabase } from '../database/connection';
import { AccountsService } from '../modules/accounting/accounts.service';
import { JournalService } from '../modules/accounting/journal.service';
import {
  applyUtilitySplit,
  planUtilitySplit,
  UTILITY_HEADER_CODE,
  UTILITY_LEGACY_CODE,
  UTILITY_SUB_LEDGERS,
} from '../modules/accounting/utility-subledgers';
import type { AccountSplitPlan } from '../modules/accounting/account-split';
import { AuditService } from '../modules/governance/audit.service';
import { ProjectsService } from '../modules/projects/projects.service';
import { UserModel } from '../modules/users/user.model';

/**
 * Splits 5220 Utility Bills into a header with postable sub-ledgers
 * (5221 Electricity, 5222 Water, 5223 Internet, 5224 Gas, 5229 Other).
 *
 * Posted journals are not edited. Whatever each one left on 5220 is moved to
 * 5229 by a system reclassification journal on the same date, then 5220 is
 * made a header so new postings must pick a sub-ledger. Re-runnable.
 *
 * Usage:
 *   npm run migrate:utility-subledgers            # dry run, prints the plan
 *   npm run migrate:utility-subledgers -- --apply # performs it
 *   ... -- --apply --user=admin@example.com       # post as this admin
 */
function printPlan(plan: AccountSplitPlan): void {
  console.log(
    `${UTILITY_HEADER_CODE} is currently ${plan.alreadyHeader ? 'a HEADER' : 'POSTABLE'}`,
  );
  console.log(
    `Sub-ledgers: ${UTILITY_SUB_LEDGERS.map((row) => `${row.code} ${row.name}`).join(', ')}`,
  );
  console.log(
    `To create: ${plan.childrenToCreate.length ? plan.childrenToCreate.join(', ') : 'none'}`,
  );
  if (plan.reclasses.length === 0) {
    console.log('Reclassifications: none');
  } else {
    console.log(
      `Reclassifications (${UTILITY_HEADER_CODE} → ${UTILITY_LEGACY_CODE}, one system journal each):`,
    );
    for (const row of plan.reclasses) {
      console.log(
        `  ${row.date}  ${row.entryNumber}  ${row.amount.toFixed(2)}${row.projectId ? `  project ${row.projectId}` : ''}  ref ${row.reference}`,
      );
    }
  }
  if (plan.unpostedJournals.length > 0) {
    console.log(
      `Unposted journals still on ${UTILITY_HEADER_CODE} (switch their line to a sub-ledger before posting):`,
    );
    for (const row of plan.unpostedJournals) {
      console.log(`  ${row.entryNumber} (${row.status})`);
    }
  }
  for (const warning of plan.warnings) {
    console.log(`NOTE: ${warning}`);
  }
  for (const error of plan.errors) {
    console.log(`CONFLICT: ${error}`);
  }
}

async function resolveUserId(email?: string): Promise<string> {
  const user = email
    ? await UserModel.findOne({ email: email.trim().toLowerCase() }).exec()
    : await UserModel.findOne({ role: Role.ADMIN, isActive: true })
        .sort({ createdAt: 1 })
        .exec();
  if (!user) {
    throw new Error(email ? `User ${email} not found` : 'No active admin user found');
  }
  if (user.role !== Role.ADMIN) {
    throw new Error(`${user.email} is not an admin`);
  }
  return user._id.toString();
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const email = process.argv
    .find((arg) => arg.startsWith('--user='))
    ?.slice('--user='.length);

  loadConfig();
  await connectDatabase();

  const plan = await planUtilitySplit();
  printPlan(plan);

  if (plan.errors.length > 0) {
    console.log('Nothing changed. Resolve the conflicts above first.');
  } else if (plan.alreadyDone) {
    console.log('Already migrated. Nothing to do.');
  } else if (!apply) {
    console.log('Dry run only. Re-run with --apply to perform these changes.');
  } else {
    const userId = await resolveUserId(email);
    const accountsService = new AccountsService();
    const journalService = new JournalService(
      accountsService,
      new ProjectsService(),
      new AuditService(),
    );
    const result = await applyUtilitySplit(journalService, userId);
    for (const row of result.postedReclasses) {
      console.log(`Posted ${row.entryNumber} (${row.reference})`);
    }
    console.log(
      `Done. ${UTILITY_HEADER_CODE} is now a header; its own balance is ${result.headerOwnBalanceAfter.toFixed(2)}.`,
    );
  }

  await disconnectDatabase();
}

main().catch(async (err: unknown) => {
  console.error(err);
  console.error(
    'The migration keeps report totals intact at every step; fix the error and re-run it.',
  );
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
