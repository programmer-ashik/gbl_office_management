import '../load-env';
import 'reflect-metadata';
import { loadConfig } from '../config';
import { connectDatabase, disconnectDatabase } from '../database/connection';
import { repairCashBankChart } from '../modules/accounting/cash-bank-repair';
import { AccountsService } from '../modules/accounting/accounts.service';

/**
 * One-time cleanup for the Cash & Bank chart.
 * Moves Client Receivables to 1151 and Advance to Staff to 1161,
 * then rebuilds 1120–1132 as the cash, bank, and mobile hierarchy.
 *
 * Usage: npm run repair:cash-bank
 */
async function main(): Promise<void> {
  loadConfig();
  await connectDatabase();
  const repair = await repairCashBankChart();
  const accounts = new AccountsService();
  const seeded = await accounts.seedFromChartOfAccountsJson({ forceUpdate: false });
  console.log(
    `Repair operations=${repair.operations}; chart created=${seeded.created}, updated=${seeded.updated}, skipped=${seeded.skipped}`,
  );
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
