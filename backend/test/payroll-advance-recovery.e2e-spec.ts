import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus, SettlementCase } from '../src/common/enums/advance-status.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Manual advance recovery on payroll (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;
  let cashId: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function disbursedAdvance(amount: number, purpose: string): Promise<string> {
    const created = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ amount, purpose })
      .expect(201);
    const id = created.body.data.id as string;
    await request(app).post(`/api/v1/advances/${id}/approve`).set(admin()).expect(200);
    await request(app)
      .post(`/api/v1/advances/${id}/disburse`)
      .set(admin())
      .send({ treasuryId: cashId, date: '2026-10-02' })
      .expect(201);
    return id;
  }

  beforeAll(async () => {
    app = await createApp();
    const adminRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'recovery.admin@gblenterprise.com', password: 'Admin123!', firstName: 'Recovery', lastName: 'Admin' })
      .expect(201);
    adminToken = adminRes.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'recovery.worker@gblenterprise.com', password: 'Worker123!', firstName: 'Field', lastName: 'Officer' })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    employeeId = employee.body.data.user.id as string;

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
          { accountCode: '1111', debit: 100000 },
          { accountCode: '3100', credit: 100000 },
        ],
      })
      .expect(201);

    await request(app)
      .put('/api/v1/payroll/salary-structures')
      .set(admin())
      .send({ employeeId, basic: 30000, allowances: [], deductions: [] })
      .expect(200);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('recovers part of an advance from salary and settles the rest by vouchers', async () => {
    const advanceId = await disbursedAdvance(10000, 'Field visit fuel and food');

    const run = await request(app)
      .post('/api/v1/payroll/runs')
      .set(admin())
      .send({ periodYear: 2026, periodMonth: 10 })
      .expect(201);
    const runId = run.body.data.id as string;
    expect(run.body.data.lines[0].totalAdvanceDeductions).toBe(0);
    expect(run.body.data.lines[0].netPay).toBe(30000);

    await request(app)
      .put(`/api/v1/payroll/runs/${runId}/advance-deductions`)
      .set(admin())
      .send({ employeeId, deductions: [{ advanceId, amount: 4000 }] })
      .expect(200);

    await request(app)
      .post(`/api/v1/payroll/runs/${runId}/post`)
      .set(admin())
      .send({ salaryExpenseAccountCode: '5230' })
      .expect(200);

    await request(app)
      .put(`/api/v1/payroll/runs/${runId}/advance-deductions`)
      .set(admin())
      .send({ employeeId, deductions: [] })
      .expect(400);

    const afterPayroll = await request(app).get(`/api/v1/advances/${advanceId}`).set(admin()).expect(200);
    expect(afterPayroll.body.data).toMatchObject({
      status: AdvanceStatus.DISBURSED,
      payrollRecovered: 4000,
      balanceToSettle: 6000,
    });

    await request(app)
      .post(`/api/v1/advances/${advanceId}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ lines: [{ accountCode: '5240', amount: 6000, description: 'Fuel' }] })
      .expect(200);
    const settled = await request(app)
      .post(`/api/v1/advances/${advanceId}/confirm`)
      .set(admin())
      .send({})
      .expect(201);
    expect(settled.body.data.settlementCase).toBe(SettlementCase.EQUAL);

    const ledger = await request(app)
      .get(`/api/v1/ledgers/1161?entityType=employee&entityId=${employeeId}`)
      .set(admin())
      .expect(200);
    expect(ledger.body.data.closingBalance).toBe(0);
  });

  it('refuses to post a draft whose advance was settled in the meantime', async () => {
    const advanceId = await disbursedAdvance(2000, 'Courier charges');

    const run = await request(app)
      .post('/api/v1/payroll/runs')
      .set(admin())
      .send({ periodYear: 2026, periodMonth: 11 })
      .expect(201);
    const runId = run.body.data.id as string;

    await request(app)
      .put(`/api/v1/payroll/runs/${runId}/advance-deductions`)
      .set(admin())
      .send({ employeeId, deductions: [{ advanceId, amount: 2000 }] })
      .expect(200);

    await request(app)
      .post(`/api/v1/advances/${advanceId}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ lines: [{ accountCode: '5240', amount: 2000, description: 'Courier' }] })
      .expect(200);
    await request(app).post(`/api/v1/advances/${advanceId}/confirm`).set(admin()).send({}).expect(201);

    const blocked = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/post`)
      .set(admin())
      .send({ salaryExpenseAccountCode: '5230' })
      .expect(400);
    expect(JSON.stringify(blocked.body)).toMatch(/no longer open/);

    const cleared = await request(app)
      .put(`/api/v1/payroll/runs/${runId}/advance-deductions`)
      .set(admin())
      .send({ employeeId, deductions: [] })
      .expect(200);
    expect(cleared.body.data.lines[0].netPay).toBe(30000);
    await request(app)
      .post(`/api/v1/payroll/runs/${runId}/post`)
      .set(admin())
      .send({ salaryExpenseAccountCode: '5230' })
      .expect(200);
  });
});
