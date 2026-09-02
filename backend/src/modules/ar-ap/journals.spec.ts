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
        accountCode: '1100',
        debit: 500,
        projectId: 'proj-1',
      }),
      expect.objectContaining({
        accountCode: '4000',
        credit: 500,
        projectId: 'proj-1',
      }),
    ]);
  });

  it('records collection against AR', () => {
    const lines = buildCollectionJournalLines({
      amountMinor: 25_000,
      treasuryAccountCode: '1010',
      projectId: 'proj-1',
      description: 'Partial collection',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '1010', debit: 250 }),
      expect.objectContaining({ accountCode: '1100', credit: 250 }),
    ]);
  });

  it('accrues AP on a credit supplier bill', () => {
    const lines = buildCreditBillJournalLines({
      amountMinor: 12_000,
      expenseAccountCode: '5200',
      description: 'Consultancy',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '5200', debit: 120 }),
      expect.objectContaining({ accountCode: '2000', credit: 120 }),
    ]);
  });

  it('pays a cash supplier bill immediately', () => {
    const lines = buildCashBillJournalLines({
      amountMinor: 8_000,
      expenseAccountCode: '5200',
      treasuryAccountCode: '1000',
      description: 'Stationery',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '5200', debit: 80 }),
      expect.objectContaining({ accountCode: '1000', credit: 80 }),
    ]);
  });

  it('clears AP on supplier payment', () => {
    const lines = buildSupplierPaymentJournalLines({
      amountMinor: 30_000,
      treasuryAccountCode: '1010',
      description: 'Vendor settlement',
    });
    expect(lines).toEqual([
      expect.objectContaining({ accountCode: '2000', debit: 300 }),
      expect.objectContaining({ accountCode: '1010', credit: 300 }),
    ]);
  });
});
