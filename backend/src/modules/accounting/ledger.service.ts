import { Types } from 'mongoose';
import { AccountType, normalBalanceOf } from '../../common/enums/account-type.enum';
import { notFound } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { SupplierBillModel } from '../ar-ap/supplier-bill.model';
import { SupplierPaymentModel } from '../ar-ap/supplier-payment.model';
import { GoodsMovementModel } from '../procurement/goods-movement.model';
import { AccountModel } from './account.model';
import { JournalEntityType } from './journal.enums';
import { JournalEntryModel } from './journal-entry.model';
import { LedgerLineModel } from './ledger.model';
import { SystemAccountCode } from './system-account-codes';

export type LedgerEntry = {
  id: string;
  date: string;
  entryNumber: string;
  journalEntryId: string;
  memo: string;
  description: string;
  reference: string | null;
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
    options: {
      asOf?: Date;
      fromDate?: Date;
      toDate?: Date;
      entity?: { entityType?: string; entityId?: string };
    } = {},
  ): Promise<{
    account: AccountBalance;
    openingBalance: number;
    closingBalance: number;
    periodDebit: number;
    periodCredit: number;
    fromDate: string | null;
    toDate: string | null;
    entries: Array<
      LedgerEntry & {
        entityType: string | null;
        entityId: string | null;
        entityName: string | null;
        projectId: string | null;
        runningBalance: number;
      }
    >;
  }> {
    const entity = options.entity;
    let fromDate = options.fromDate;
    let toDate = options.toDate ?? options.asOf;
    if (fromDate && Number.isNaN(fromDate.getTime())) fromDate = undefined;
    if (toDate && Number.isNaN(toDate.getTime())) toDate = undefined;

    const account = await AccountModel.findOne({
      code: accountCode.trim().toUpperCase(),
    }).exec();
    if (!account) {
      throw notFound(`Account ${accountCode} not found`);
    }

    const accountMatch = {
      $or: [{ accountId: account._id }, { accountCode: account.code }],
    };
    const andClauses: Record<string, unknown>[] = [accountMatch];
    if (toDate) {
      const end = new Date(toDate);
      end.setUTCHours(23, 59, 59, 999);
      andClauses.push({ date: { $lte: end } });
    }

    let supplierMetaByJournal = new Map<
      string,
      { entityId: string; entityName: string }
    >();

    if (entity?.entityId && Types.ObjectId.isValid(entity.entityId)) {
      const entityOid = new Types.ObjectId(entity.entityId);
      const isSupplierControl =
        account.code === SystemAccountCode.ACCOUNTS_PAYABLE ||
        account.code === SystemAccountCode.SUBCONTRACTOR_PAYABLE;

      if (isSupplierControl) {
        const supplierFilter = {
          $or: [
            { supplierId: entityOid },
            { supplierId: entity.entityId },
          ],
        };
        const [bills, payments, movements] = await Promise.all([
          SupplierBillModel.find(supplierFilter)
            .select({ journalId: 1, supplierId: 1, supplierName: 1 })
            .exec(),
          SupplierPaymentModel.find(supplierFilter)
            .select({ journalId: 1, supplierId: 1, supplierName: 1 })
            .exec(),
          GoodsMovementModel.find(supplierFilter)
            .select({ journalId: 1 })
            .exec(),
        ]);

        const journalIds = [
          ...bills.map((row) => row.journalId),
          ...payments.map((row) => row.journalId).filter(Boolean),
          ...movements.map((row) => row.journalId),
        ].filter(Boolean);

        for (const bill of bills) {
          if (!bill.journalId) continue;
          supplierMetaByJournal.set(bill.journalId.toString(), {
            entityId: bill.supplierId.toString(),
            entityName: bill.supplierName,
          });
        }
        for (const payment of payments) {
          if (!payment.journalId) continue;
          supplierMetaByJournal.set(payment.journalId.toString(), {
            entityId: payment.supplierId.toString(),
            entityName: payment.supplierName,
          });
        }

        andClauses.push({
          $or: [
            {
              entityType: entity.entityType || JournalEntityType.SUPPLIER,
              entityId: entityOid,
            },
            ...(journalIds.length
              ? [{ journalEntryId: { $in: journalIds } }]
              : []),
          ],
        });
      } else {
        if (entity.entityType) {
          andClauses.push({ entityType: entity.entityType });
        }
        andClauses.push({ entityId: entityOid });
      }
    } else if (entity?.entityType) {
      andClauses.push({ entityType: entity.entityType });
    }

    const query =
      andClauses.length === 1 ? andClauses[0]! : { $and: andClauses };

    const lines = await LedgerLineModel.find(query)
      .sort({ date: 1, journalEntryNumber: 1, createdAt: 1 })
      .exec();

    const isSupplierControl =
      account.code === SystemAccountCode.ACCOUNTS_PAYABLE ||
      account.code === SystemAccountCode.SUBCONTRACTOR_PAYABLE;

    // Resolve supplier from bills / payments / GRNs for older AP lines that
    // were posted without entity tags (so supplier filter + GL names work).
    if (isSupplierControl && lines.length > 0) {
      const missingJournalIds = [
        ...new Set(
          lines
            .filter((line) => !line.entityId)
            .map((line) => line.journalEntryId.toString()),
        ),
      ].filter((id) => !supplierMetaByJournal.has(id));

      if (missingJournalIds.length > 0) {
        const journalObjectIds = missingJournalIds.map(
          (id) => new Types.ObjectId(id),
        );
        const [bills, payments, movements] = await Promise.all([
          SupplierBillModel.find({ journalId: { $in: journalObjectIds } })
            .select({ journalId: 1, supplierId: 1, supplierName: 1 })
            .exec(),
          SupplierPaymentModel.find({ journalId: { $in: journalObjectIds } })
            .select({ journalId: 1, supplierId: 1, supplierName: 1 })
            .exec(),
          GoodsMovementModel.find({ journalId: { $in: journalObjectIds } })
            .select({ journalId: 1, supplierId: 1, supplierName: 1 })
            .exec(),
        ]);
        for (const bill of bills) {
          if (!bill.journalId) continue;
          supplierMetaByJournal.set(bill.journalId.toString(), {
            entityId: bill.supplierId.toString(),
            entityName: bill.supplierName,
          });
        }
        for (const payment of payments) {
          if (!payment.journalId) continue;
          supplierMetaByJournal.set(payment.journalId.toString(), {
            entityId: payment.supplierId.toString(),
            entityName: payment.supplierName,
          });
        }
        for (const movement of movements) {
          if (!movement.journalId || !movement.supplierId) continue;
          supplierMetaByJournal.set(movement.journalId.toString(), {
            entityId: movement.supplierId.toString(),
            entityName: movement.supplierName || 'Supplier',
          });
        }
      }

      // Persist missing tags so future supplier filters hit entityId directly.
      const backfills = lines.filter(
        (line) =>
          !line.entityId &&
          supplierMetaByJournal.has(line.journalEntryId.toString()),
      );
      if (backfills.length > 0) {
        await Promise.all(
          backfills.map(async (line) => {
            const meta = supplierMetaByJournal.get(
              line.journalEntryId.toString(),
            )!;
            const entityOid = new Types.ObjectId(meta.entityId);
            line.entityType = JournalEntityType.SUPPLIER;
            line.entityId = entityOid;
            line.entityName = meta.entityName;
            await LedgerLineModel.updateOne(
              { _id: line._id },
              {
                $set: {
                  entityType: JournalEntityType.SUPPLIER,
                  entityId: entityOid,
                  entityName: meta.entityName,
                },
              },
            ).exec();
            await JournalEntryModel.updateOne(
              { _id: line.journalEntryId },
              {
                $set: {
                  'lines.$[ap].entityType': JournalEntityType.SUPPLIER,
                  'lines.$[ap].entityId': entityOid,
                  'lines.$[ap].entityName': meta.entityName,
                },
              },
              {
                arrayFilters: [
                  {
                    'ap.accountCode': account.code,
                    $or: [
                      { 'ap.entityId': { $exists: false } },
                      { 'ap.entityId': null },
                    ],
                  },
                ],
              },
            ).exec();
          }),
        );
      }
    }

    // Hydrate older ledger rows that only stored a single memo blob.
    const needsHydration = lines.some(
      (line) =>
        !line.description || !line.reference || line.memo === line.description,
    );
    let journalById = new Map<
      string,
      { memo: string; reference?: string }
    >();
    if (needsHydration) {
      const journalIds = [
        ...new Set(lines.map((line) => line.journalEntryId.toString())),
      ];
      const journals = await JournalEntryModel.find({
        _id: { $in: journalIds.map((id) => new Types.ObjectId(id)) },
      })
        .select({ memo: 1, reference: 1 })
        .exec();
      journalById = new Map(
        journals.map((row) => [
          row._id.toString(),
          { memo: row.memo, reference: row.reference },
        ]),
      );
    }

    const rangeStart = fromDate
      ? (() => {
          const d = new Date(fromDate);
          d.setUTCHours(0, 0, 0, 0);
          return d;
        })()
      : null;

    const openingLines = rangeStart
      ? lines.filter((line) => line.date.getTime() < rangeStart.getTime())
      : [];
    const periodLines = rangeStart
      ? lines.filter((line) => line.date.getTime() >= rangeStart.getTime())
      : lines;

    const openingDebitMinor = openingLines.reduce(
      (sum, line) => sum + line.debitMinor,
      0,
    );
    const openingCreditMinor = openingLines.reduce(
      (sum, line) => sum + line.creditMinor,
      0,
    );
    const periodDebitMinor = periodLines.reduce(
      (sum, line) => sum + line.debitMinor,
      0,
    );
    const periodCreditMinor = periodLines.reduce(
      (sum, line) => sum + line.creditMinor,
      0,
    );
    const allDebitMinor = openingDebitMinor + periodDebitMinor;
    const allCreditMinor = openingCreditMinor + periodCreditMinor;

    const openingBalance = fromMinorUnits(
      netBalanceMinor(account.type, openingDebitMinor, openingCreditMinor),
    );
    const closingBalance = fromMinorUnits(
      netBalanceMinor(account.type, allDebitMinor, allCreditMinor),
    );

    const creditNormal = normalBalanceOf(account.type) === 'credit';
    let running = openingBalance;
    const chronoEntries = periodLines.map((line) => {
      const journal = journalById.get(line.journalEntryId.toString());
      const supplierMeta = supplierMetaByJournal.get(
        line.journalEntryId.toString(),
      );
      const memo = journal?.memo || line.memo;
      const description =
        line.description?.trim() ||
        (line.memo !== memo ? line.memo : undefined) ||
        memo;
      const debit = fromMinorUnits(line.debitMinor);
      const credit = fromMinorUnits(line.creditMinor);
      running += creditNormal ? credit - debit : debit - credit;
      return {
        id: line._id.toString(),
        date: line.date.toISOString(),
        entryNumber: line.journalEntryNumber,
        journalEntryId: line.journalEntryId.toString(),
        memo,
        description,
        reference: line.reference ?? journal?.reference ?? null,
        debit,
        credit,
        entityType:
          line.entityType ??
          (supplierMeta ? JournalEntityType.SUPPLIER : null),
        entityId: line.entityId
          ? line.entityId.toString()
          : (supplierMeta?.entityId ?? null),
        entityName: line.entityName ?? supplierMeta?.entityName ?? null,
        projectId: line.projectId ? line.projectId.toString() : null,
        runningBalance: Number(running.toFixed(2)),
      };
    });

    return {
      account: {
        accountId: account._id.toString(),
        accountCode: account.code,
        accountName: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        debitTotal: fromMinorUnits(allDebitMinor),
        creditTotal: fromMinorUnits(allCreditMinor),
        balance: closingBalance,
      },
      openingBalance,
      closingBalance,
      periodDebit: fromMinorUnits(periodDebitMinor),
      periodCredit: fromMinorUnits(periodCreditMinor),
      fromDate: rangeStart ? rangeStart.toISOString().slice(0, 10) : null,
      toDate: toDate ? new Date(toDate).toISOString().slice(0, 10) : null,
      // Newest first so page 1 shows the latest activity.
      entries: [...chronoEntries].reverse(),
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
    const totalCredit = round2(
      rows.reduce((sum, row) => sum + row.creditColumn, 0),
    );

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
