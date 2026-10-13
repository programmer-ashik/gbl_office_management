import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';
import { AccountModel } from '../src/modules/accounting/account.model';
import { LedgerLineModel } from '../src/modules/accounting/ledger.model';
import { todayIsoDate } from '../src/modules/accounting/pdc';

jest.setTimeout(180000);

type Line = {
  accountCode: string;
  debit: number;
  credit: number;
  entityType: string | null;
  entityId: string | null;
};

type Journal = {
  id: string;
  entryNumber: string;
  status: string;
  reference: string | null;
  isPdc: boolean;
  pdcStatus: string;
  chequeNumber: string | null;
  chequeDate: string | null;
  intendedBankAccountId: string | null;
  intendedBankAccountCode: string | null;
  pdcDirection: string | null;
  pdcClearingEntryId: string | null;
  pdcClearsEntryId: string | null;
  lines: Line[];
};

const BANK = '1122';
const PDC_RECEIVABLE = '1152';
const PDC_PAYABLE = '2112';

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function balance(accountCode: string): Promise<number> {
  const [row] = await LedgerLineModel.aggregate<{ debit: number; credit: number }>([
    { $match: { accountCode } },
    {
      $group: {
        _id: null,
        debit: { $sum: '$debitMinor' },
        credit: { $sum: '$creditMinor' },
      },
    },
  ]);
  return ((row?.debit ?? 0) - (row?.credit ?? 0)) / 100;
}

function line(journal: Journal, accountCode: string): Line | undefined {
  return journal.lines.find((row) => row.accountCode === accountCode);
}

describe('Post-dated cheques (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let customerId: string;
  const today = todayIsoDate();
  const future = addDays(today, 30);
  const yesterday = addDays(today, -1);
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function postJournal(body: Record<string, unknown>, status = 201) {
    const res = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: today, intent: 'post', ...body })
      .expect(status);
    return res.body.data as Journal;
  }

  function customerReceipt(amount: number, extra: Record<string, unknown> = {}) {
    return postJournal({
      memo: `Customer cheque ${amount}`,
      lines: [
        { accountCode: BANK, debit: amount, description: 'Cheque deposit' },
        {
          accountCode: '1151',
          credit: amount,
          entityType: 'customer',
          entityId: customerId,
          description: 'Collection',
        },
      ],
      ...extra,
    });
  }

  function clearPdc(id: string, status = 201, body: Record<string, unknown> = {}) {
    return request(app)
      .post(`/api/v1/transactions/${id}/clear-pdc`)
      .set(auth())
      .send(body)
      .expect(status);
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'pdc.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'PDC',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth())
      .send({ name: 'Cheque Client Ltd' })
      .expect(201);
    customerId = customer.body.data.id as string;

    // Fund the bank so payment cheques have something to draw on.
    await postJournal({
      memo: 'Owner capital into bank',
      lines: [
        { accountCode: BANK, debit: 1_000_000 },
        { accountCode: '3100', credit: 1_000_000 },
      ],
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('seeds PDC Receivable (asset) and PDC Payable (liability) as postable accounts', async () => {
    const receivable = await AccountModel.findOne({ code: PDC_RECEIVABLE }).lean();
    const payable = await AccountModel.findOne({ code: PDC_PAYABLE }).lean();
    expect(receivable).toMatchObject({ name: 'PDC Receivable', type: 'asset', isPostable: true });
    expect(payable).toMatchObject({ name: 'PDC Payable', type: 'liability', isPostable: true });
  });

  describe('Test 1: standard transaction (backwards compatibility)', () => {
    it('posts straight to the bank when there is no cheque date', async () => {
      const before = await balance(BANK);
      const journal = await customerReceipt(10_000);
      expect(journal.isPdc).toBe(false);
      expect(journal.pdcStatus).toBe('None');
      expect(journal.intendedBankAccountId).toBeNull();
      expect(line(journal, BANK)?.debit).toBe(10_000);
      expect(line(journal, PDC_RECEIVABLE)).toBeUndefined();
      expect(await balance(BANK)).toBe(before + 10_000);
    });

    it.each([
      ['today', () => today],
      ['yesterday', () => yesterday],
    ])('posts straight to the bank when the cheque is dated %s', async (_label, day) => {
      const before = await balance(BANK);
      const journal = await customerReceipt(20_000, {
        chequeNumber: 'CHQ-100',
        chequeDate: day(),
      });
      expect(journal.isPdc).toBe(false);
      expect(journal.pdcStatus).toBe('None');
      expect(journal.chequeNumber).toBe('CHQ-100');
      expect(journal.chequeDate).toBe(day());
      expect(line(journal, BANK)?.debit).toBe(20_000);
      expect(await balance(BANK)).toBe(before + 20_000);
    });
  });

  describe('Test 2: PDC receipt creation', () => {
    it('parks a future-dated customer cheque in PDC Receivable without touching the bank', async () => {
      const bankBefore = await balance(BANK);
      const arBefore = await balance('1151');
      const journal = await customerReceipt(75_000, {
        chequeNumber: 'CHQ-778899',
        chequeDate: future,
      });

      expect(journal.isPdc).toBe(true);
      expect(journal.pdcStatus).toBe('Pending');
      expect(journal.pdcDirection).toBe('receipt');
      expect(journal.chequeDate).toBe(future);
      expect(journal.intendedBankAccountCode).toBe(BANK);
      const bank = await AccountModel.findOne({ code: BANK }).lean();
      expect(journal.intendedBankAccountId).toBe(bank!._id.toString());

      expect(line(journal, BANK)).toBeUndefined();
      expect(line(journal, PDC_RECEIVABLE)).toMatchObject({
        debit: 75_000,
        entityType: 'customer',
        entityId: customerId,
      });
      expect(line(journal, '1151')?.credit).toBe(75_000);

      expect(await balance(BANK)).toBe(bankBefore);
      expect(await balance(PDC_RECEIVABLE)).toBe(75_000);
      expect(await balance('1151')).toBe(arBefore - 75_000);
    });

    it('parks a future-dated payment cheque in PDC Payable', async () => {
      const bankBefore = await balance(BANK);
      const journal = await postJournal({
        memo: 'Office rent by cheque',
        chequeNumber: 'OUT-001',
        chequeDate: future,
        lines: [
          { accountCode: '5210', debit: 30_000, description: 'October rent' },
          { accountCode: BANK, credit: 30_000 },
        ],
      });
      expect(journal.isPdc).toBe(true);
      expect(journal.pdcStatus).toBe('Pending');
      expect(journal.pdcDirection).toBe('payment');
      expect(line(journal, BANK)).toBeUndefined();
      expect(line(journal, PDC_PAYABLE)?.credit).toBe(30_000);
      expect(line(journal, '5210')?.debit).toBe(30_000);
      expect(await balance(BANK)).toBe(bankBefore);
    });

    it('rejects a future cheque with no bank line', async () => {
      await postJournal(
        {
          memo: 'Cash is not a cheque',
          chequeDate: future,
          lines: [
            { accountCode: '5240', debit: 500 },
            { accountCode: '1111', credit: 500 },
          ],
        },
        400,
      );
    });

    it('keeps drafts unswapped and applies the PDC rule when the draft is posted', async () => {
      const draft = await postJournal({
        intent: 'draft',
        memo: 'Draft cheque receipt',
        chequeNumber: 'CHQ-DRAFT',
        chequeDate: future,
        lines: [
          { accountCode: BANK, debit: 5_000 },
          { accountCode: '1151', credit: 5_000, entityType: 'customer', entityId: customerId },
        ],
      });
      expect(draft.isPdc).toBe(false);
      expect(line(draft, BANK)?.debit).toBe(5_000);

      const posted = await request(app)
        .post(`/api/v1/journals/${draft.id}/post`)
        .set(auth())
        .send({})
        .expect(200);
      const journal = posted.body.data as Journal;
      expect(journal.isPdc).toBe(true);
      expect(journal.pdcStatus).toBe('Pending');
      expect(line(journal, PDC_RECEIVABLE)?.debit).toBe(5_000);
      expect(line(journal, BANK)).toBeUndefined();
    });
  });

  describe('Test 3: PDC clearing', () => {
    it('posts Dr bank / Cr PDC Receivable and marks the receipt Cleared', async () => {
      const pdc = await customerReceipt(40_000, {
        chequeNumber: 'CHQ-3001',
        chequeDate: future,
      });
      const bankBefore = await balance(BANK);
      const heldBefore = await balance(PDC_RECEIVABLE);

      const res = await clearPdc(pdc.id);
      const cleared = res.body.data.pdc as Journal;
      const clearing = res.body.data.clearingJournal as Journal;

      expect(cleared.pdcStatus).toBe('Cleared');
      expect(cleared.status).toBe('posted');
      expect(cleared.pdcClearingEntryId).toBe(clearing.id);

      expect(clearing.id).not.toBe(pdc.id);
      expect(clearing.status).toBe('posted');
      expect(clearing.reference).toBe(pdc.entryNumber);
      expect(clearing.pdcClearsEntryId).toBe(pdc.id);
      expect(clearing.isPdc).toBe(false);
      expect(clearing.lines).toHaveLength(2);
      expect(line(clearing, BANK)).toMatchObject({ debit: 40_000, credit: 0 });
      expect(line(clearing, PDC_RECEIVABLE)).toMatchObject({ debit: 0, credit: 40_000 });

      expect(await balance(BANK)).toBe(bankBefore + 40_000);
      expect(await balance(PDC_RECEIVABLE)).toBe(heldBefore - 40_000);
    });

    it('posts Dr PDC Payable / Cr bank for a payment cheque', async () => {
      const pdc = await postJournal({
        memo: 'Utility bill by cheque',
        chequeNumber: 'OUT-3002',
        chequeDate: future,
        lines: [
          { accountCode: '5221', debit: 12_000 },
          { accountCode: BANK, credit: 12_000 },
        ],
      });
      const bankBefore = await balance(BANK);

      const res = await clearPdc(pdc.id, 201, { date: today });
      const clearing = res.body.data.clearingJournal as Journal;
      expect(res.body.data.pdc.pdcStatus).toBe('Cleared');
      expect(line(clearing, PDC_PAYABLE)).toMatchObject({ debit: 12_000, credit: 0 });
      expect(line(clearing, BANK)).toMatchObject({ debit: 0, credit: 12_000 });
      expect(await balance(BANK)).toBe(bankBefore - 12_000);
    });

    it('returns a cheque to Pending when its clearing journal is reversed', async () => {
      const pdc = await customerReceipt(9_000, { chequeDate: future });
      const res = await clearPdc(pdc.id);
      const clearingId = res.body.data.clearingJournal.id as string;

      await request(app)
        .post(`/api/v1/journals/${clearingId}/reverse`)
        .set(auth())
        .expect(201);
      const reloaded = await request(app)
        .get(`/api/v1/journals/${pdc.id}`)
        .set(auth())
        .expect(200);
      expect(reloaded.body.data.pdcStatus).toBe('Pending');
      expect(reloaded.body.data.pdcClearingEntryId).toBeNull();

      await clearPdc(pdc.id);
    });
  });

  describe('Test 4: validation', () => {
    it('cannot clear a PDC that is already Cleared', async () => {
      const pdc = await customerReceipt(8_000, { chequeDate: future });
      await clearPdc(pdc.id);
      const bankBefore = await balance(BANK);

      const again = await clearPdc(pdc.id, 409);
      expect(again.body.success).toBe(false);
      expect(await balance(BANK)).toBe(bankBefore);

      await request(app)
        .post(`/api/v1/transactions/${pdc.id}/bounce-pdc`)
        .set(auth())
        .send({})
        .expect(409);
      await request(app)
        .post(`/api/v1/journals/${pdc.id}/reverse`)
        .set(auth())
        .expect(400);
    });

    it('cannot clear a PDC that has Bounced', async () => {
      const pdc = await customerReceipt(6_000, { chequeNumber: 'CHQ-BAD', chequeDate: future });
      const arBefore = await balance('1151');

      const bounced = await request(app)
        .post(`/api/v1/transactions/${pdc.id}/bounce-pdc`)
        .set(auth())
        .send({ reason: 'Insufficient funds' })
        .expect(201);
      expect(bounced.body.data.pdc.pdcStatus).toBe('Bounced');
      expect(bounced.body.data.pdc.status).toBe('reversed');
      expect(bounced.body.data.pdc.pdcBounceReason).toBe('Insufficient funds');
      expect(await balance('1151')).toBe(arBefore + 6_000);

      const bankBefore = await balance(BANK);
      await clearPdc(pdc.id, 409);
      expect(await balance(BANK)).toBe(bankBefore);
    });

    it('cannot clear a journal that is not a PDC', async () => {
      const normal = await customerReceipt(1_000);
      await clearPdc(normal.id, 400);
    });

    it('bounces a current-dated cheque that already hit the bank', async () => {
      const cheque = await customerReceipt(4_000, { chequeNumber: 'CUR-1', chequeDate: today });
      const bankBefore = await balance(BANK);
      const res = await request(app)
        .post(`/api/v1/transactions/${cheque.id}/bounce-pdc`)
        .set(auth())
        .send({ reason: 'Signature mismatch' })
        .expect(201);
      expect(res.body.data.pdc.pdcStatus).toBe('Bounced');
      expect(res.body.data.pdc.status).toBe('reversed');
      expect(await balance(BANK)).toBe(bankBefore - 4_000);
      await request(app)
        .post(`/api/v1/transactions/${cheque.id}/bounce-pdc`)
        .set(auth())
        .send({})
        .expect(409);
    });

    it('lists the PDC register by status', async () => {
      const res = await request(app)
        .get('/api/v1/transactions/pdc?status=Pending')
        .set(auth())
        .expect(200);
      const rows = res.body.data as Journal[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.isPdc && row.pdcStatus === 'Pending')).toBe(true);
    });
  });

  describe('Cheque register & entry page flows', () => {
    type RegisterRow = Journal & {
      chequeAmount: number;
      direction: string | null;
      bankAccountCode: string | null;
      bankAccountName: string | null;
      partyName: string | null;
      clearingEntryNumber: string | null;
    };

    async function register(query = '') {
      const res = await request(app)
        .get(`/api/v1/transactions/cheques${query}`)
        .set(auth())
        .expect(200);
      return res.body.data as RegisterRow[];
    }

    it('accepts the cheque entry page payload (treasury entity on the bank line)', async () => {
      const treasury = await request(app).get('/api/v1/treasury').set(auth()).expect(200);
      const bank = (treasury.body.data as Array<{ id: string; glAccountCode: string }>).find(
        (row) => row.glAccountCode === BANK,
      )!;
      const journal = await postJournal({
        memo: 'Cheque UI-1 received from Cheque Client Ltd',
        reference: 'CHQ-UI-1',
        journalType: 'customer_receipt',
        chequeNumber: 'UI-1',
        chequeDate: future,
        lines: [
          { accountCode: BANK, debit: 15_000, entityType: 'treasury', entityId: bank.id },
          { accountCode: '1151', credit: 15_000, entityType: 'customer', entityId: customerId },
        ],
      });
      expect(journal.isPdc).toBe(true);
      expect(line(journal, PDC_RECEIVABLE)).toMatchObject({
        debit: 15_000,
        entityType: 'customer',
        entityId: customerId,
      });

      const rows = await register('?search=UI-1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        chequeNumber: 'UI-1',
        chequeAmount: 15_000,
        direction: 'receipt',
        bankAccountCode: BANK,
        partyName: 'Cheque Client Ltd',
        pdcStatus: 'Pending',
      });
    });

    it('lists current cheques, PDCs and bounced cheques but not clearing or reversal journals', async () => {
      const rows = await register();
      const numbers = rows.map((row) => row.chequeNumber);
      expect(numbers).toEqual(expect.arrayContaining(['CHQ-100', 'CHQ-778899', 'CUR-1', 'CHQ-BAD']));
      expect(rows.some((row) => row.pdcClearsEntryId)).toBe(false);
      const cleared = rows.find((row) => row.chequeNumber === 'CHQ-3001')!;
      expect(cleared.pdcStatus).toBe('Cleared');
      expect(cleared.clearingEntryNumber).toMatch(/^JE-/);
      const issued = rows.find((row) => row.chequeNumber === 'OUT-001')!;
      expect(issued.direction).toBe('payment');
      expect(issued.chequeAmount).toBe(30_000);

      const payments = await register('?direction=payment');
      expect(payments.every((row) => row.direction === 'payment')).toBe(true);
    });

    it('undoes a clearing through the register action', async () => {
      const pdc = await customerReceipt(3_000, { chequeNumber: 'UNDO-1', chequeDate: future });
      await clearPdc(pdc.id);
      const bankBefore = await balance(BANK);
      const res = await request(app)
        .post(`/api/v1/transactions/${pdc.id}/undo-clear-pdc`)
        .set(auth())
        .expect(201);
      expect(res.body.data.pdc.pdcStatus).toBe('Pending');
      expect(await balance(BANK)).toBe(bankBefore - 3_000);
      await request(app)
        .post(`/api/v1/transactions/${pdc.id}/undo-clear-pdc`)
        .set(auth())
        .expect(409);
    });

    it('issues a supplier cheque as a PDC and records the payment against the intended bank', async () => {
      const supplier = await request(app)
        .post('/api/v1/suppliers')
        .set(auth())
        .send({ name: 'Cheque Cement Co', paymentTermsDays: 30 })
        .expect(201);
      const supplierId = supplier.body.data.id as string;
      const journal = await postJournal({
        memo: 'Cheque OUT-SUP to Cheque Cement Co',
        chequeNumber: 'OUT-SUP',
        chequeDate: future,
        overrideSupplierPayable: true,
        overrideReason: 'Advance payment by cheque',
        lines: [
          { accountCode: '2111', debit: 7_000, entityType: 'supplier', entityId: supplierId },
          { accountCode: BANK, credit: 7_000 },
        ],
      });
      expect(journal.pdcDirection).toBe('payment');
      expect(line(journal, PDC_PAYABLE)).toMatchObject({
        credit: 7_000,
        entityType: 'supplier',
        entityId: supplierId,
      });
      const rows = await register('?search=OUT-SUP');
      expect(rows[0]).toMatchObject({ partyName: 'Cheque Cement Co', direction: 'payment' });
    });
  });
});
