import 'dotenv/config';
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { Role } from '../common/enums/role.enum';
import { loadConfig } from '../config';
import {
  connectDatabase,
  disconnectDatabase,
} from '../database/connection';
import { AccountsService } from '../modules/accounting/accounts.service';
import { JournalService } from '../modules/accounting/journal.service';
import { JournalEntryModel } from '../modules/accounting/journal-entry.model';
import { LedgerLineModel } from '../modules/accounting/ledger.model';
import { LedgerService } from '../modules/accounting/ledger.service';
import { SystemAccountCode } from '../modules/accounting/system-account-codes';
import { BankingService } from '../modules/banking/banking.service';
import { FundTransferModel } from '../modules/banking/fund-transfer.model';
import { parseStatementPdfDetailed } from '../modules/banking/pdf-statement';
import { ReconciliationModel } from '../modules/banking/reconciliation.model';
import { UserModel } from '../modules/users/user.model';

/**
 * Reset journal/ledger/recon data and post books that mirror the City Bank PDF
 * so bank reconciliation can be tested end-to-end.
 *
 * Usage:
 *   npx tsx src/scripts/seed-recon-from-statement-pdf.ts
 *   npx tsx src/scripts/seed-recon-from-statement-pdf.ts --pdf /path/to/file.pdf
 *
 * Does NOT delete CoA, users, projects, customers, or inventory.
 */
async function main(): Promise<void> {
  loadConfig();
  await connectDatabase();

  const pdfArgIdx = process.argv.indexOf('--pdf');
  const pdfPath =
    pdfArgIdx >= 0 && process.argv[pdfArgIdx + 1]
      ? path.resolve(process.argv[pdfArgIdx + 1])
      : path.resolve(process.cwd(), '..', 'A5608144766a1e.pdf');

  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const admin =
    (await UserModel.findOne({ role: Role.ADMIN }).exec()) ??
    (await UserModel.findOne().exec());
  if (!admin) {
    throw new Error('No user found to post journals (need an admin)');
  }
  const userId = admin._id.toString();

  console.log('Clearing journals, ledger lines, reconciliations, transfers…');
  const [jDel, lDel, rDel, tDel] = await Promise.all([
    JournalEntryModel.deleteMany({}).exec(),
    LedgerLineModel.deleteMany({}).exec(),
    ReconciliationModel.deleteMany({}).exec(),
    FundTransferModel.deleteMany({}).exec(),
  ]);
  console.log(
    `Deleted journals=${jDel.deletedCount} ledger=${lDel.deletedCount} recon=${rDel.deletedCount} transfers=${tDel.deletedCount}`,
  );

  const accountsService = new AccountsService();
  const journalService = new JournalService(accountsService);
  const ledgerService = new LedgerService();
  const bankingService = new BankingService(
    accountsService,
    journalService,
    ledgerService,
  );
  await bankingService.seedDefaults();

  const treasury = await bankingService.list();
  const bank = treasury.find(
    (row) => row.glAccountCode === SystemAccountCode.BANK,
  );
  if (!bank) {
    throw new Error('Bank treasury account (1112) missing');
  }

  console.log(`Parsing ${pdfPath}…`);
  const parsed = await parseStatementPdfDetailed(fs.readFileSync(pdfPath));
  console.log(
    `Parsed lines=${parsed.lines.length} opening=${parsed.openingBalance} closing=${parsed.closingBalance} asOf=${parsed.asOf}`,
  );

  if (!parsed.lines.length) {
    throw new Error('No statement lines parsed from PDF');
  }
  if (parsed.openingBalance == null || parsed.closingBalance == null) {
    throw new Error('Opening/closing balance not detected on PDF');
  }

  const bankCode = SystemAccountCode.BANK;
  const incomeCode = SystemAccountCode.OTHER_INCOME;
  const expenseCode = SystemAccountCode.BANK_CHARGES;
  const capitalCode = SystemAccountCode.OWNER_CAPITAL;

  // Opening book balance = statement opening (day before period).
  await journalService.post(
    {
      date: '2026-01-31',
      memo: 'City Bank statement opening balance (recon test)',
      journalType: 'opening_balance',
      reference: 'RECON-OB',
      lines: [
        { accountCode: bankCode, debit: parsed.openingBalance },
        { accountCode: capitalCode, credit: parsed.openingBalance },
      ],
    },
    userId,
    'system',
  );
  console.log(`Posted opening balance ${parsed.openingBalance} to ${bankCode}`);

  let posted = 0;
  for (const line of parsed.lines) {
    const date = line.date.slice(0, 10);
    const amount = Math.abs(line.amount);
    if (amount < 0.005) continue;

    const isDeposit = line.amount > 0;
    const memo = line.description.slice(0, 200);
    const reference = line.reference?.slice(0, 80);

    if (isDeposit) {
      await journalService.post(
        {
          date,
          memo,
          reference,
          journalType: 'general',
          lines: [
            { accountCode: bankCode, debit: amount, description: memo },
            { accountCode: incomeCode, credit: amount, description: memo },
          ],
        },
        userId,
        'system',
      );
    } else {
      await journalService.post(
        {
          date,
          memo,
          reference,
          journalType: 'general',
          lines: [
            { accountCode: expenseCode, debit: amount, description: memo },
            { accountCode: bankCode, credit: amount, description: memo },
          ],
        },
        userId,
        'system',
      );
    }
    posted += 1;
    if (posted % 25 === 0) {
      console.log(`Posted ${posted}/${parsed.lines.length}…`);
    }
  }

  const book = await bankingService.getById(bank.id);
  console.log('---');
  console.log(`Treasury: ${bank.name} (${bank.id}) GL ${bankCode}`);
  console.log(`Posted statement lines: ${posted}`);
  console.log(`Book balance now: ${book.bookBalance}`);
  console.log(`Statement closing (target): ${parsed.closingBalance}`);
  console.log(`Statement as of: ${parsed.asOf}`);
  console.log(
    `Open /banking/${bank.id} → upload A5608144766a1e.pdf → Auto-match`,
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
