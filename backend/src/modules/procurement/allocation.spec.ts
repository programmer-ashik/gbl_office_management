import { toMinorUnits } from '../../common/utils/money';
import { lineAmountMinor, toMilliQty } from '../../common/utils/quantity';
import { PurchaseDestination } from '../../common/enums/procurement.enum';
import {
  AP_CODE,
  INVENTORY_CODE,
  MATERIALS_CODE,
  buildIssueJournalLines,
  buildReceiptJournalLines,
  buildReturnJournalLines,
} from './allocation';

describe('procurement allocation journals', () => {
  it('debits project materials immediately for direct-to-site receipts', () => {
    const lines = buildReceiptJournalLines({
      destination: PurchaseDestination.DIRECT_TO_SITE,
      amountMinor: toMinorUnits(8000),
      projectId: 'proj-1',
      description: 'Site cement',
    });
    expect(lines).toEqual([
      expect.objectContaining({
        accountCode: MATERIALS_CODE,
        debit: 8000,
        projectId: 'proj-1',
      }),
      expect.objectContaining({ accountCode: AP_CODE, credit: 8000 }),
    ]);
  });

  it('debits inventory instead of expense for warehouse receipts', () => {
    const lines = buildReceiptJournalLines({
      destination: PurchaseDestination.WAREHOUSE,
      amountMinor: toMinorUnits(8000),
      description: 'Warehouse cement',
    });
    expect(lines[0]).toMatchObject({ accountCode: INVENTORY_CODE, debit: 8000 });
    expect(lines.some((line) => line.accountCode === MATERIALS_CODE)).toBe(false);
  });

  it('moves inventory to project cost when stock is issued', () => {
    const lines = buildIssueJournalLines({
      amountMinor: toMinorUnits(5000),
      projectId: 'proj-1',
      description: 'Issue cement',
    });
    expect(lines).toEqual([
      expect.objectContaining({
        accountCode: MATERIALS_CODE,
        debit: 5000,
        projectId: 'proj-1',
      }),
      expect.objectContaining({ accountCode: INVENTORY_CODE, credit: 5000 }),
    ]);
  });

  it('reverses site cost on a vendor return from a project', () => {
    const lines = buildReturnJournalLines({
      destination: PurchaseDestination.DIRECT_TO_SITE,
      amountMinor: toMinorUnits(1000),
      projectId: 'proj-1',
      description: 'Return cement',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: AP_CODE, debit: 1000 }),
      expect.objectContaining({
        accountCode: MATERIALS_CODE,
        credit: 1000,
        projectId: 'proj-1',
      }),
    ]);
  });
});

describe('quantity line amount', () => {
  it('multiplies milli-qty by unit cost without floating error', () => {
    expect(lineAmountMinor(toMilliQty(2.5), toMinorUnits(100))).toBe(
      toMinorUnits(250),
    );
  });
});
