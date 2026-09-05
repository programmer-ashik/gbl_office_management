import 'dotenv/config';
import 'reflect-metadata';
import { loadConfig } from '../config';
import {
  connectDatabase,
  disconnectDatabase,
} from '../database/connection';
import { AccountsService } from '../modules/accounting/accounts.service';

/**
 * Upsert Chart of Accounts from chart_of_accounts.json.
 * Safe to re-run: never deletes accounts; skips duplicates by unique code.
 *
 * Usage:
 *   npm run seed:coa
 *   npm run seed:coa -- --force   # update unused existing codes to match JSON
 */
async function main(): Promise<void> {
  loadConfig();
  const forceUpdate = process.argv.includes('--force');
  await connectDatabase();
  const accountsService = new AccountsService();
  const result = await accountsService.seedFromChartOfAccountsJson({
    forceUpdate,
  });
  console.log(
    `Chart of Accounts seed complete (force=${forceUpdate}): created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, total=${result.total}`,
  );
  console.log(`Source: ${result.path}`);
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
