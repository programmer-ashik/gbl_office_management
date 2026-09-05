import {
  buildCashBillJournalLines,
  buildCollectionJournalLines,
  buildCreditBillJournalLines,
  buildInvoiceJournalLines,
  buildSupplierPaymentJournalLines,
} from './journals';

describe('ar-ap journal builders', () => {
  it('recognises revenue on client invoice', () => {
    const lines = buildInvoiceJournalLines({
      amountMinor: 50_000,
      projectId: 'proj-1',
      description: 'Milestone 1',
    });
    expect(lines).toEqual([
      expect.objectContaining({
        accountCode: '1121',
        debit: 500,
        projectId: 'proj-1',
      }),
      expect.objectContaining({
        accountCode: '4110',
        credit: 500,
        projectId: 'proj-1',
      }),
    ]);
  });

  it('records collection against AR', () => {
    const lines = buildCollectionJournalLines({
      amountMinor: 25_000,
      treasuryAccountCode: '1112',
      projectId: 'proj-1',
      description: 'Partial collection',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '1112', debit: 250 }),
      expect.objectContaining({ accountCode: '1121', credit: 250 }),
    ]);
  });

  it('accrues AP on a credit supplier bill', () => {
    const lines = buildCreditBillJournalLines({
      amountMinor: 12_000,
      expenseAccountCode: '5240',
      description: 'Consultancy',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '5240', debit: 120 }),
      expect.objectContaining({ accountCode: '2111', credit: 120 }),
    ]);
  });

  it('pays a cash supplier bill immediately', () => {
    const lines = buildCashBillJournalLines({
      amountMinor: 8_000,
      expenseAccountCode: '5240',
      treasuryAccountCode: '1111',
      description: 'Stationery',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '5240', debit: 80 }),
      expect.objectContaining({ accountCode: '1111', credit: 80 }),
    ]);
  });

  it('clears AP on supplier payment', () => {
    const lines = buildSupplierPaymentJournalLines({
      amountMinor: 30_000,
      treasuryAccountCode: '1112',
      description: 'Vendor settlement',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '2111', debit: 300 }),
      expect.objectContaining({ accountCode: '1112', credit: 300 }),
    ]);
  });
});
