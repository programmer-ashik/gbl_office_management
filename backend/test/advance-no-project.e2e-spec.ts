import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus, SettlementCase } from '../src/common/enums/advance-status.enum';
import { disconnectDatabase } from '../src/database/connection';
import { JournalEntryModel } from '../src/modules/accounting/journal-entry.model';

jest.setTimeout(180000);

describe('Advance requisition without a project (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let cashId: string;
  let advanceId: string;

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'noproj.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'NoProj',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'noproj.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Office',
        lastName: 'Staff',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;

    const treasury = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    cashId = (treasury.body.data as Array<{ id: string; glAccountCode: string }>).find(
      (row) => row.glAccountCode === '1111',
    )!.id;

    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-01',
        memo: 'Opening cash',
        lines: [
          { accountCode: '1111', debit: 50000 },
          { accountCode: '3100', credit: 50000 },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('accepts a requisition with no project (omitted or empty)', async () => {
    const created = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ amount: 3000, purpose: 'Office stationery and tea' })
      .expect(201);
    expect(created.body.data).toMatchObject({
      status: AdvanceStatus.PENDING,
      projectId: null,
      projectCode: null,
      projectName: null,
    });
    advanceId = created.body.data.id as string;

    await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ projectId: '', amount: 100, purpose: 'Empty project id is None' })
      .expect(201);

    await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ projectId: 'not-an-id', amount: 100, purpose: 'Bad project id' })
      .expect(400);
  });

  it('disburses without a project and still tags the employee', async () => {
    await request(app)
      .post(`/api/v1/advances/${advanceId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const paid = await request(app)
      .post(`/api/v1/advances/${advanceId}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ treasuryId: cashId, date: '2026-09-02' })
      .expect(201);
    expect(paid.body.data.status).toBe(AdvanceStatus.DISBURSED);

    const journal = await JournalEntryModel.findOne({
      entryNumber: paid.body.data.disbursementJournalNumber,
    }).exec();
    const advanceLine = journal!.lines.find((line) => line.accountCode === '1161');
    expect(advanceLine?.projectId).toBeUndefined();
    expect(advanceLine?.entityType).toBe('employee');
  });

  it('hides and rejects project cost heads on the settlement', async () => {
    const options = await request(app)
      .get('/api/v1/advances/expense-accounts')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const byCode = new Map(
      (options.body.data as Array<{ code: string; projectOnly: boolean }>).map((row) => [
        row.code,
        row.projectOnly,
      ]),
    );
    expect(byCode.get('5110')).toBe(true);
    expect(byCode.get('5210')).toBe(false);

    const blocked = await request(app)
      .post(`/api/v1/advances/${advanceId}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ lines: [{ accountCode: '5110', amount: 3000, description: 'Cement' }] })
      .expect(400);
    expect(JSON.stringify(blocked.body)).toMatch(/no project/);
  });

  it('settles against an office expense head', async () => {
    await request(app)
      .post(`/api/v1/advances/${advanceId}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ lines: [{ accountCode: '5240', amount: 3000, description: 'Stationery' }] })
      .expect(200);
    const settled = await request(app)
      .post(`/api/v1/advances/${advanceId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    expect(settled.body.data.status).toBe(AdvanceStatus.SETTLED);
    expect(settled.body.data.settlementCase).toBe(SettlementCase.EQUAL);

    const pdf = await request(app)
      .get(`/api/v1/advances/${advanceId}/pdf`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
  });
});
