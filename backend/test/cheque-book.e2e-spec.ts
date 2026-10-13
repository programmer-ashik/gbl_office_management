import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';
import { JournalEntryModel } from '../src/modules/accounting/journal-entry.model';
import { todayIsoDate } from '../src/modules/accounting/pdc';

jest.setTimeout(180000);

type Treasury = { id: string; kind: string; glAccountCode: string; name: string };
type Book = {
  id: string;
  bookName: string;
  startNumber: string;
  endNumber: string;
  availableCount: number;
  issuedCount: number;
  cancelledCount: number;
  nextAvailable: string | null;
};
type Leaf = {
  id: string;
  chequeNumber: string;
  status: string;
  journalId: string | null;
  journalNumber: string | null;
  journalStatus: string | null;
  pdcStatus: string | null;
  amount: number | null;
  payeeName: string | null;
};
type Journal = {
  id: string;
  entryNumber: string;
  chequeNumber: string | null;
  isPdc: boolean;
  pdcStatus: string;
};

const BANK = '1122';
const OTHER_BANK = '1121';

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe('Company chequebooks (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let bank: Treasury;
  let cash: Treasury;
  let book: Book;
  let leaves: Leaf[];
  const today = todayIsoDate();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function postJournal(body: Record<string, unknown>, status = 201) {
    const res = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: today, intent: 'post', ...body })
      .expect(status);
    return res.body.data as Journal;
  }

  function rentCheque(extra: Record<string, unknown>, amount = 5_000, bankCode = BANK) {
    return {
      memo: `Rent by cheque ${amount}`,
      lines: [
        { accountCode: '5210', debit: amount, description: 'Office rent' },
        { accountCode: bankCode, credit: amount },
      ],
      ...extra,
    };
  }

  async function leafById(id: string): Promise<Leaf> {
    const res = await request(app)
      .get('/api/v1/cheque-books/leaves')
      .query({ bookId: book.id })
      .set(auth())
      .expect(200);
    const row = (res.body.data as Leaf[]).find((leaf) => leaf.id === id);
    if (!row) throw new Error(`leaf ${id} missing`);
    return row;
  }

  async function available(): Promise<Leaf[]> {
    const res = await request(app)
      .get('/api/v1/cheque-books/leaves/available')
      .query({ treasuryId: bank.id })
      .set(auth())
      .expect(200);
    return res.body.data as Leaf[];
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'chequebook.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Cheque',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const treasury = await request(app).get('/api/v1/treasury').set(auth()).expect(200);
    const rows = treasury.body.data as Treasury[];
    bank = rows.find((row) => row.glAccountCode === BANK)!;
    cash = rows.find((row) => row.kind === 'cash')!;
    expect(bank).toBeDefined();
    expect(cash).toBeDefined();

    await postJournal({
      memo: 'Owner capital into banks',
      lines: [
        { accountCode: BANK, debit: 500_000 },
        { accountCode: OTHER_BANK, debit: 100_000 },
        { accountCode: '3100', credit: 600_000 },
      ],
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('registers a chequebook and generates zero-padded leaves', async () => {
    const res = await request(app)
      .post('/api/v1/cheque-books')
      .set(auth())
      .send({ treasuryId: bank.id, startNumber: '000101', leafCount: 5 })
      .expect(201);
    book = res.body.data as Book;
    expect(book.startNumber).toBe('000101');
    expect(book.endNumber).toBe('000105');
    expect(book.bookName).toBe('000101 – 000105');
    expect(book.availableCount).toBe(5);
    expect(book.nextAvailable).toBe('000101');

    leaves = await available();
    expect(leaves.map((leaf) => leaf.chequeNumber)).toEqual([
      '000101',
      '000102',
      '000103',
      '000104',
      '000105',
    ]);
  });

  it('rejects overlapping ranges and non-bank accounts', async () => {
    const overlap = await request(app)
      .post('/api/v1/cheque-books')
      .set(auth())
      .send({ treasuryId: bank.id, startNumber: '000104', leafCount: 3 })
      .expect(409);
    expect(overlap.body.message).toContain('000104');

    await request(app)
      .post('/api/v1/cheque-books')
      .set(auth())
      .send({ treasuryId: cash.id, startNumber: '1', leafCount: 3 })
      .expect(400);

    await request(app)
      .post('/api/v1/cheque-books')
      .set(auth())
      .send({ treasuryId: bank.id, startNumber: 'AB12', leafCount: 3 })
      .expect(400);
  });

  it('issuing a cheque with a leaf marks it used and links the journal', async () => {
    const journal = await postJournal(
      rentCheque({ chequeLeafId: leaves[0].id, chequeNumber: 'typed-wrong' }),
    );
    expect(journal.chequeNumber).toBe('000101');

    const leaf = await leafById(leaves[0].id);
    expect(leaf.status).toBe('issued');
    expect(leaf.journalId).toBe(journal.id);
    expect(leaf.journalNumber).toBe(journal.entryNumber);
    expect(leaf.amount).toBe(5_000);
    expect(leaf.journalStatus).toBe('posted');

    const next = await available();
    expect(next[0].chequeNumber).toBe('000102');
    expect(next).toHaveLength(4);
  });

  it('never issues the same leaf twice', async () => {
    const before = await JournalEntryModel.countDocuments();
    await postJournal(rentCheque({ chequeLeafId: leaves[0].id }), 409);
    expect(await JournalEntryModel.countDocuments()).toBe(before);
  });

  it('a leaf must be issued from its own bank account', async () => {
    await postJournal(rentCheque({ chequeLeafId: leaves[1].id }, 1_000, OTHER_BANK), 400);
    expect((await leafById(leaves[1].id)).status).toBe('available');
  });

  it('typing a registered cheque number links the leaf automatically', async () => {
    const journal = await postJournal(rentCheque({ chequeNumber: '000102' }, 2_500));
    const leaf = await leafById(leaves[1].id);
    expect(leaf.status).toBe('issued');
    expect(leaf.journalId).toBe(journal.id);

    await postJournal(rentCheque({ chequeNumber: '000101' }, 2_500), 409);
  });

  it('releases the leaf when the journal fails to post', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: today,
        intent: 'post',
        memo: 'Unbalanced cheque',
        chequeLeafId: leaves[2].id,
        lines: [
          { accountCode: '5210', debit: 900 },
          { accountCode: BANK, credit: 800 },
        ],
      })
      .expect(400);
    const leaf = await leafById(leaves[2].id);
    expect(leaf.status).toBe('available');
    expect(leaf.journalId).toBeNull();
  });

  it('drafts and received cheques do not consume leaves', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: today, ...rentCheque({ chequeLeafId: leaves[2].id }), intent: 'draft' })
      .expect(201);
    expect((await leafById(leaves[2].id)).status).toBe('available');

    await postJournal({
      memo: 'Received cheque with a clashing number',
      chequeNumber: '000103',
      lines: [
        { accountCode: BANK, debit: 700 },
        { accountCode: '4200', credit: 700 },
      ],
    });
    expect((await leafById(leaves[2].id)).status).toBe('available');
  });

  it('cancel and restore spoiled leaves', async () => {
    const cancelled = await request(app)
      .post(`/api/v1/cheque-books/leaves/${leaves[4].id}/cancel`)
      .set(auth())
      .send({ reason: 'Spoiled while writing' })
      .expect(200);
    expect((cancelled.body.data as Leaf).status).toBe('cancelled');
    await postJournal(rentCheque({ chequeLeafId: leaves[4].id }), 409);

    await request(app)
      .post(`/api/v1/cheque-books/leaves/${leaves[0].id}/cancel`)
      .set(auth())
      .send({ reason: 'Cannot cancel issued' })
      .expect(400);

    const restored = await request(app)
      .post(`/api/v1/cheque-books/leaves/${leaves[4].id}/restore`)
      .set(auth())
      .expect(200);
    expect((restored.body.data as Leaf).status).toBe('available');
  });

  it('post-dated issued cheque keeps the leaf used after it bounces', async () => {
    const pdc = await postJournal(
      rentCheque({ chequeLeafId: leaves[3].id, chequeDate: addDays(today, 20) }, 3_000),
    );
    expect(pdc.isPdc).toBe(true);
    expect(pdc.chequeNumber).toBe('000104');

    await request(app)
      .post(`/api/v1/transactions/${pdc.id}/bounce-pdc`)
      .set(auth())
      .send({ reason: 'Stopped' })
      .expect(201);
    const leaf = await leafById(leaves[3].id);
    expect(leaf.status).toBe('issued');
    expect(leaf.pdcStatus).toBe('Bounced');
  });

  it('book counts reflect usage; only unused books can be deleted', async () => {
    const list = await request(app).get('/api/v1/cheque-books').set(auth()).expect(200);
    const row = (list.body.data as Book[]).find((b) => b.id === book.id)!;
    expect(row.issuedCount).toBe(3);
    expect(row.availableCount).toBe(2);
    expect(row.nextAvailable).toBe('000103');

    await request(app).delete(`/api/v1/cheque-books/${book.id}`).set(auth()).expect(400);

    const spare = await request(app)
      .post('/api/v1/cheque-books')
      .set(auth())
      .send({ treasuryId: bank.id, bookName: 'Spare', prefix: 'sp', startNumber: '1', leafCount: 3 })
      .expect(201);
    expect((spare.body.data as Book).startNumber).toBe('SP1');
    const removed = await request(app)
      .delete(`/api/v1/cheque-books/${(spare.body.data as Book).id}`)
      .set(auth())
      .expect(200);
    expect(removed.body.data.deletedLeaves).toBe(3);
  });
});
