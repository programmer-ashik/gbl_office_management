import { AccountType, normalBalanceOf } from '../../common/enums/account-type.enum';
import { notFound } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { AccountModel } from './account.model';
import { LedgerLineModel } from './ledger.model';

export type LedgerEntry = {
  id: string;
  date: string;
  entryNumber: string;
  memo: string;
  debit: number;
  credit: number;
};

export type AccountBalance = {
  accountId: string;
  accountCode: string;
  accountName: string;
  type: AccountType;
  normalBalance: 'debit' | 'credit';
  debitTotal: number;
  creditTotal: number;
  balance: number;
};

export type TrialBalanceRow = AccountBalance & {
  debitColumn: number;
  creditColumn: number;
};

export type TrialBalance = {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
};

export class LedgerService {
  async listForAccount(
    accountCode: string,
    asOf?: Date,
  ): Promise<{ account: AccountBalance; entries: LedgerEntry[] }> {
    const account = await AccountModel.findOne({
      code: accountCode.trim().toUpperCase(),
    }).exec();
    if (!account) {
      throw notFound(`Account ${accountCode} not found`);
    }

    const dateFilter = asOf ? { date: { $lte: asOf } } : {};
    const lines = await LedgerLineModel.find({
      accountId: account._id,
      ...dateFilter,
    })
      .sort({ date: 1, journalEntryNumber: 1 })
      .exec();

    const debitMinor = lines.reduce((sum, line) => sum + line.debitMinor, 0);
    const creditMinor = lines.reduce((sum, line) => sum + line.creditMinor, 0);

    return {
      account: {
        accountId: account._id.toString(),
        accountCode: account.code,
        accountName: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        debitTotal: fromMinorUnits(debitMinor),
        creditTotal: fromMinorUnits(creditMinor),
        balance: fromMinorUnits(netBalanceMinor(account.type, debitMinor, creditMinor)),
      },
      entries: lines.map((line) => ({
        id: line._id.toString(),
        date: line.date.toISOString(),
        entryNumber: line.journalEntryNumber,
        memo: line.memo,
        debit: fromMinorUnits(line.debitMinor),
        credit: fromMinorUnits(line.creditMinor),
      })),
    };
  }

  async trialBalance(asOf = new Date()): Promise<TrialBalance> {
    const lines = await LedgerLineModel.aggregate<{
      _id: string;
      debitMinor: number;
      creditMinor: number;
    }>([
      { $match: { date: { $lte: asOf } } },
      {
        $group: {
          _id: '$accountCode',
          debitMinor: { $sum: '$debitMinor' },
          creditMinor: { $sum: '$creditMinor' },
        },
      },
    ]);

    const accounts = await AccountModel.find({ isActive: true })
      .sort({ code: 1 })
      .exec();
    const totals = new Map(lines.map((line) => [line._id, line]));

    const rows: TrialBalanceRow[] = accounts.map((account) => {
      const totalsForAccount = totals.get(account.code) ?? {
        debitMinor: 0,
        creditMinor: 0,
      };
      const debitTotal = fromMinorUnits(totalsForAccount.debitMinor);
      const creditTotal = fromMinorUnits(totalsForAccount.creditMinor);
      const balanceMinor = netBalanceMinor(
        account.type,
        totalsForAccount.debitMinor,
        totalsForAccount.creditMinor,
      );
      const { debitColumn, creditColumn } = trialBalanceColumns(
        account.type,
        balanceMinor,
      );

      return {
        accountId: account._id.toString(),
        accountCode: account.code,
        accountName: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        debitTotal,
        creditTotal,
        balance: fromMinorUnits(balanceMinor),
        debitColumn,
        creditColumn,
      };
    });

    const totalDebit = round2(rows.reduce((sum, row) => sum + row.debitColumn, 0));
    const totalCredit = round2(rows.reduce((sum, row) => sum + row.creditColumn, 0));

    return {
      asOf: asOf.toISOString(),
      rows,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit === totalCredit,
    };
  }
}

function netBalanceMinor(
  type: AccountType,
  debitMinor: number,
  creditMinor: number,
): number {
  const raw = debitMinor - creditMinor;
  return type === AccountType.ASSET || type === AccountType.EXPENSE
    ? raw
    : -raw;
}

function trialBalanceColumns(
  type: AccountType,
  balanceMinor: number,
): { debitColumn: number; creditColumn: number } {
  const side = normalBalanceOf(type);
  if (balanceMinor >= 0) {
    return side === 'debit'
      ? { debitColumn: fromMinorUnits(balanceMinor), creditColumn: 0 }
      : { debitColumn: 0, creditColumn: fromMinorUnits(balanceMinor) };
  }

  const opposite = fromMinorUnits(-balanceMinor);
  return side === 'debit'
    ? { debitColumn: 0, creditColumn: opposite }
    : { debitColumn: opposite, creditColumn: 0 };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}
