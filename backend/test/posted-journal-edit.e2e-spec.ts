import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';
import { LedgerLineModel } from '../src/modules/accounting/ledger.model';

jest.setTimeout(180000);

type Journal = {
  id: string;
  entryNumber: string;
  date: string;
  memo: string;
  status: string;
  totalDebit: number;
  lines: Array<{ accountCode: string; debit: number; credit: number; description: string | null }>;
};

describe('Posted journal date / description edit (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let journal: Journal;
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function ledgerFor(id: string) {
    return LedgerLineModel.find({ journalEntryId: id }).sort({ _id: 1 }).lean();
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'pje.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'PJE',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const res = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: '2026-09-10',
        memo: 'gbl-260910-OfficeEx-HandCash',
        intent: 'post',
        lines: [
          { accountCode: '5240', debit: 100, description: 'Office tea' },
          { accountCode: '1111', credit: 100 },
        ],
      })
      .expect(201);
    journal = res.body.data as Journal;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('reports a manual posted journal as fully editable', async () => {
    const res = await request(app)
      .get(`/api/v1/journals/${journal.id}/editability`)
      .set(auth())
      .expect(200);
    expect(res.body.data).toEqual({ id: journal.id, editable: true, dateLockedReason: null });
  });

  it('changes date and descriptions on the journal and its ledger lines, not amounts', async () => {
    const res = await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({
        date: '2026-09-12',
        lines: [
          { index: 0, description: 'Office tea and snacks for site meeting' },
          { index: 1, description: 'Paid from petty cash' },
        ],
      })
      .expect(200);
    const updated = res.body.data as Journal;
    expect(updated.entryNumber).toBe(journal.entryNumber);
    expect(updated.status).toBe('posted');
    expect(updated.date.slice(0, 10)).toBe('2026-09-12');
    expect(updated.memo).toBe('gbl-260912-OfficeEx-HandCash');
    expect(updated.totalDebit).toBe(100);
    expect(updated.lines).toMatchObject([
      { accountCode: '5240', debit: 100, credit: 0, description: 'Office tea and snacks for site meeting' },
      { accountCode: '1111', debit: 0, credit: 100, description: 'Paid from petty cash' },
    ]);

    const ledger = await ledgerFor(journal.id);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((row) => row.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-12',
      '2026-09-12',
    ]);
    expect(ledger.map((row) => row.description)).toEqual([
      'Office tea and snacks for site meeting',
      'Paid from petty cash',
    ]);
    expect(ledger.map((row) => [row.debitMinor, row.creditMinor])).toEqual([
      [10000, 0],
      [0, 10000],
    ]);
    expect(ledger.map((row) => row.memo)).toEqual([
      'gbl-260912-OfficeEx-HandCash',
      'gbl-260912-OfficeEx-HandCash',
    ]);
  });

  it('clearing a description falls back to the memo in the ledger', async () => {
    await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 1, description: '' }] })
      .expect(200);
    const ledger = await ledgerFor(journal.id);
    expect(ledger[1].description).toBe('gbl-260912-OfficeEx-HandCash');
  });

  it('rejects amount/account fields and descriptions over 400 characters', async () => {
    await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 0, debit: 50 }] })
      .expect(400);
    await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 0, accountCode: '5250' }] })
      .expect(400);
    await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 0, description: 'x'.repeat(401) }] })
      .expect(400);
    await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 5, description: 'No such line' }] })
      .expect(400);
    await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: '2026-09-10',
        memo: 'Too long note',
        intent: 'post',
        lines: [
          { accountCode: '5240', debit: 10, description: 'y'.repeat(401) },
          { accountCode: '1111', credit: 10 },
        ],
      })
      .expect(400);
    const ok = await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 0, description: 'z'.repeat(400) }] })
      .expect(200);
    expect(ok.body.data.lines[0].description).toHaveLength(400);
  });

  it('locks the date (not descriptions) on system reversal journals; reversed originals are locked', async () => {
    const reversal = await request(app)
      .post(`/api/v1/journals/${journal.id}/reverse`)
      .set(auth())
      .expect(201);
    const reversingId = reversal.body.data.id as string;

    await request(app)
      .patch(`/api/v1/journals/${journal.id}/details`)
      .set(auth())
      .send({ lines: [{ index: 0, description: 'After reversal' }] })
      .expect(400);

    const editability = await request(app)
      .get(`/api/v1/journals/${reversingId}/editability`)
      .set(auth())
      .expect(200);
    expect(editability.body.data.editable).toBe(true);
    expect(editability.body.data.dateLockedReason).toMatch(/System-generated/);

    const moved = await request(app)
      .patch(`/api/v1/journals/${reversingId}/details`)
      .set(auth())
      .send({ date: '2026-01-01' })
      .expect(400);
    expect(moved.body.message).toMatch(/Date cannot change/);

    const noted = await request(app)
      .patch(`/api/v1/journals/${reversingId}/details`)
      .set(auth())
      .send({ lines: [{ index: 0, description: 'Reversed: wrong expense head' }] })
      .expect(200);
    expect(noted.body.data.lines[0].description).toBe('Reversed: wrong expense head');
    const ledger = await ledgerFor(reversingId);
    expect(ledger[0].description).toBe('Reversed: wrong expense head');
  });

  it('refuses drafts (they use the normal editor)', async () => {
    const draft = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: '2026-09-10',
        memo: 'Draft note',
        intent: 'draft',
        lines: [
          { accountCode: '5240', debit: 10 },
          { accountCode: '1111', credit: 10 },
        ],
      })
      .expect(201);
    await request(app)
      .patch(`/api/v1/journals/${draft.body.data.id}/details`)
      .set(auth())
      .send({ date: '2026-09-11' })
      .expect(400);
  });
});
