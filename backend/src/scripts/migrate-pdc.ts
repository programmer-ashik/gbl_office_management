import '../load-env';
import 'reflect-metadata';
import { loadConfig } from '../config';
import {
  connectDatabase,
  disconnectDatabase,
} from '../database/connection';
import { JournalEntryModel } from '../modules/accounting/journal-entry.model';
import { PdcStatus } from '../modules/accounting/pdc';
import { ensurePdcAccounts } from '../modules/accounting/pdc-accounts';

/**
 * Post-dated cheque (PDC) migration. Additive and safe to re-run:
 * - creates PDC Receivable (1152, asset) and PDC Payable (2112, liability)
 *   when missing; never renames or deletes an existing account
 * - sets isPdc=false / pdcStatus='None' only on journals missing those fields
 *   (no lines, amounts or ledger rows are touched)
 * - builds the PDC register index
 *
 * Usage:
 *   npm run migrate:pdc
 *   npm run migrate:pdc -- --dry-run
 */
async function main(): Promise<void> {
  loadConfig();
  const dryRun = process.argv.includes('--dry-run');
  await connectDatabase();

  const missingFlag = { isPdc: { $exists: false } };
  const missingStatus = { pdcStatus: { $exists: false } };

  if (dryRun) {
    const [flagCount, statusCount] = await Promise.all([
      JournalEntryModel.countDocuments(missingFlag).exec(),
      JournalEntryModel.countDocuments(missingStatus).exec(),
    ]);
    console.log(
      `[dry-run] journals needing isPdc=${flagCount}, pdcStatus=${statusCount}; accounts not changed`,
    );
    await disconnectDatabase();
    return;
  }

  const accounts = await ensurePdcAccounts();
  console.log(
    `PDC accounts: created=[${accounts.created.join(', ')}] existing=[${accounts.existing.join(', ')}]`,
  );
  for (const conflict of accounts.conflicts) {
    console.warn(`CONFLICT: ${conflict}`);
  }

  const flag = await JournalEntryModel.updateMany(missingFlag, {
    $set: { isPdc: false },
  }).exec();
  const status = await JournalEntryModel.updateMany(missingStatus, {
    $set: { pdcStatus: PdcStatus.NONE },
  }).exec();
  console.log(
    `Journals backfilled: isPdc=${flag.modifiedCount}, pdcStatus=${status.modifiedCount}`,
  );

  // createIndexes only adds; syncIndexes would drop indexes not in the schema.
  await JournalEntryModel.createIndexes();
  console.log('Journal indexes ensured (PDC register index)');

  await disconnectDatabase();
  if (accounts.conflicts.length > 0) {
    process.exitCode = 2;
  }
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
