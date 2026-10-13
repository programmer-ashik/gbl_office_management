import type { Express } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus } from '../src/common/enums/advance-status.enum';
import { disconnectDatabase } from '../src/database/connection';
import { JournalEntryModel } from '../src/modules/accounting/journal-entry.model';
import { AdvanceModel } from '../src/modules/advances/advance.model';

jest.setTimeout(180000);

describe('Advance journals read with the employee purpose (e2e)', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const advanceNumber = 'ADV-2026-09901';
  const purpose = 'Advance for Gazipur site slab casting labour and transport';

  type Line = { accountCode: string; description: string | null };
  type Journal = { id: string; reference: string | null; lines: Line[] };

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'purpose.admin@gblenterprise.com', password: 'Admin123!', firstName: 'Purpose', lastName: 'Admin' })
      .expect(201);
    token = admin.body.data.tokens.accessToken as string;

    await AdvanceModel.create({
      advanceNumber,
      status: AdvanceStatus.DISBURSED,
      employeeId: new Types.ObjectId(),
      employeeName: 'Rahim Uddin',
      requestedMinor: 500000,
      purpose,
      requestedAt: new Date('2026-09-01'),
    });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  function post(reference: string, lines: Array<Record<string, unknown>>) {
    return request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: '2026-09-02', memo: `Advance ${reference} disbursed`, reference, intent: 'post', lines })
      .expect(201);
  }

  it('shows the purpose instead of generated wording, without changing the stored journal', async () => {
    const posted = await post(advanceNumber, [
      { accountCode: '5210', debit: 5000, description: 'Advance to Rahim Uddin' },
      { accountCode: '1111', credit: 5000, description: `Disburse ${advanceNumber}` },
    ]);
    const id = posted.body.data.id as string;

    const list = await request(app).get('/api/v1/journals').set(auth()).expect(200);
    const fromList = (list.body.data as Journal[]).find((row) => row.id === id)!;
    expect(fromList.lines.map((line) => line.description)).toEqual([purpose, purpose]);

    const single = await request(app).get(`/api/v1/journals/${id}`).set(auth()).expect(200);
    expect((single.body.data as Journal).lines.map((line) => line.description)).toEqual([purpose, purpose]);

    const ledger = await request(app).get('/api/v1/ledgers/1111').set(auth()).expect(200);
    const entry = (ledger.body.data.entries as Array<{ journalEntryId: string; description: string }>)
      .find((row) => row.journalEntryId === id)!;
    expect(entry.description).toBe(purpose);

    const stored = await JournalEntryModel.findById(id).lean().exec();
    expect(stored!.lines.map((line) => line.description)).toEqual([
      'Advance to Rahim Uddin',
      `Disburse ${advanceNumber}`,
    ]);
  });

  it('keeps text typed by a user on an advance journal', async () => {
    const posted = await post(advanceNumber, [
      { accountCode: '5210', debit: 300, description: 'Cement 10 bags' },
      { accountCode: '1111', credit: 300, description: `Disburse ${advanceNumber}` },
    ]);
    const single = await request(app)
      .get(`/api/v1/journals/${posted.body.data.id as string}`)
      .set(auth())
      .expect(200);
    expect((single.body.data as Journal).lines.map((line) => line.description)).toEqual([
      'Cement 10 bags',
      purpose,
    ]);
  });

  it('leaves journals for unknown advance numbers alone', async () => {
    const posted = await post('ADV-2026-09999', [
      { accountCode: '5210', debit: 100, description: 'Advance to Someone' },
      { accountCode: '1111', credit: 100, description: 'Disburse ADV-2026-09999' },
    ]);
    const single = await request(app)
      .get(`/api/v1/journals/${posted.body.data.id as string}`)
      .set(auth())
      .expect(200);
    expect((single.body.data as Journal).lines.map((line) => line.description)).toEqual([
      'Advance to Someone',
      'Disburse ADV-2026-09999',
    ]);
  });
});
