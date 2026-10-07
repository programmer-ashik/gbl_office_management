import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { SettlementCase } from '../src/common/enums/advance-status.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

type Line = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
  entityName: string | null;
};

describe('Advance settlement journal keeps every bill (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let cashId: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    app = await createApp();
    const adminRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'voucher.admin@gblenterprise.com', password: 'Admin123!', firstName: 'Voucher', lastName: 'Admin' })
      .expect(201);
    adminToken = adminRes.body.data.tokens.accessToken as string;
    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'voucher.worker@gblenterprise.com', password: 'Worker123!', firstName: 'Rahim', lastName: 'Uddin' })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;

    const treasury = await request(app).get('/api/v1/treasury').set(admin()).expect(200);
    cashId = (treasury.body.data as Array<{ id: string; glAccountCode: string }>).find(
      (row) => row.glAccountCode === '1111',
    )!.id;
    await request(app)
      .post('/api/v1/journals')
      .set(admin())
      .send({
        date: '2026-10-01',
        memo: 'Opening cash',
        lines: [
          { accountCode: '1111', debit: 10000 },
          { accountCode: '3100', credit: 10000 },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('settles 100 with a 50 breakfast bill, a 40 lunch bill and 10 returned', async () => {
    const created = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ amount: 100, purpose: 'Site visit meals' })
      .expect(201);
    const id = created.body.data.id as string;
    await request(app).post(`/api/v1/advances/${id}/approve`).set(admin()).expect(200);
    await request(app)
      .post(`/api/v1/advances/${id}/disburse`)
      .set(admin())
      .send({ treasuryId: cashId, date: '2026-10-02' })
      .expect(201);
    await request(app)
      .post(`/api/v1/advances/${id}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        lines: [
          { accountCode: '5240', amount: 50, description: 'Breakfast bill' },
          { accountCode: '5240', amount: 40, description: 'Lunch bill' },
        ],
      })
      .expect(200);
    const settled = await request(app)
      .post(`/api/v1/advances/${id}/confirm`)
      .set(admin())
      .send({ returnTreasuryId: cashId, date: '2026-10-03' })
      .expect(201);
    expect(settled.body.data.settlementCase).toBe(SettlementCase.LESS);

    const journals = await request(app)
      .get('/api/v1/journals')
      .set(admin())
      .expect(200);
    const summary = (journals.body.data as Array<{ id: string; journalType: string; reference: string | null }>)
      .find((row) => row.journalType === 'employee_settlement')!;
    const journal = await request(app)
      .get(`/api/v1/journals/${summary.id}`)
      .set(admin())
      .expect(200);
    const lines = journal.body.data.lines as Line[];

    expect(lines.map((line) => [line.accountCode, line.debit, line.credit, line.description])).toEqual([
      ['5240', 50, 0, 'Breakfast bill'],
      ['5240', 40, 0, 'Lunch bill'],
      ['1111', 10, 0, 'Site visit meals'],
      ['1161', 0, 100, 'Site visit meals'],
    ]);
    expect(lines[3].entityName).toBe('Rahim Uddin');
  });
});
