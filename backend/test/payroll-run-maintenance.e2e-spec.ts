import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus } from '../src/common/enums/advance-status.enum';
import { disconnectDatabase } from '../src/database/connection';
import { JournalEntryModel } from '../src/modules/accounting/journal-entry.model';

jest.setTimeout(180000);

describe('Update and delete payroll runs (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let firstToken: string;
  let firstId: string;
  let secondId: string;
  let cashId: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  async function signup(email: string, firstName: string) {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'Worker123!', firstName, lastName: 'Staff' })
      .expect(201);
    return { token: res.body.data.tokens.accessToken as string, id: res.body.data.user.id as string };
  }

  function structure(employeeId: string, basic: number) {
    return request(app)
      .put('/api/v1/payroll/salary-structures')
      .set(admin())
      .send({ employeeId, basic, allowances: [], deductions: [] })
      .expect(200);
  }

  beforeAll(async () => {
    app = await createApp();
    const adminRes = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'runs.admin@gblenterprise.com', password: 'Admin123!', firstName: 'Runs', lastName: 'Admin' })
      .expect(201);
    adminToken = adminRes.body.data.tokens.accessToken as string;
    ({ token: firstToken, id: firstId } = await signup('runs.first@gblenterprise.com', 'First'));
    ({ id: secondId } = await signup('runs.second@gblenterprise.com', 'Second'));

    const treasury = await request(app).get('/api/v1/treasury').set(admin()).expect(200);
    cashId = (treasury.body.data as Array<{ id: string; glAccountCode: string }>).find(
      (row) => row.glAccountCode === '1111',
    )!.id;
    await request(app)
      .post('/api/v1/journals')
      .set(admin())
      .send({
        date: '2026-08-01',
        memo: 'Opening cash',
        lines: [
          { accountCode: '1111', debit: 200000 },
          { accountCode: '3100', credit: 200000 },
        ],
      })
      .expect(201);

    await structure(firstId, 20000);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('refreshes a draft to pick up a newly added employee, and deletes a draft', async () => {
    const run = await request(app)
      .post('/api/v1/payroll/runs')
      .set(admin())
      .send({ periodYear: 2026, periodMonth: 8 })
      .expect(201);
    expect(run.body.data.lines).toHaveLength(1);

    await structure(secondId, 15000);
    const refreshed = await request(app)
      .post(`/api/v1/payroll/runs/${run.body.data.id as string}/regenerate`)
      .set(admin())
      .expect(200);
    expect(refreshed.body.data.lines).toHaveLength(2);
    expect(refreshed.body.data.totalGross).toBe(35000);
    expect(refreshed.body.data.sheetNumber).toBe(run.body.data.sheetNumber);

    await request(app).delete(`/api/v1/payroll/runs/${run.body.data.id as string}`).set(admin()).expect(200);
    await request(app)
      .post('/api/v1/payroll/runs')
      .set(admin())
      .send({ periodYear: 2026, periodMonth: 8 })
      .expect(201);
  });

  it('reopens a disbursed run: reverses both journals and puts the advance recovery back', async () => {
    const advance = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ amount: 3000, purpose: 'Site visit' })
      .expect(201);
    const advanceId = advance.body.data.id as string;
    await request(app).post(`/api/v1/advances/${advanceId}/approve`).set(admin()).expect(200);
    await request(app)
      .post(`/api/v1/advances/${advanceId}/disburse`)
      .set(admin())
      .send({ treasuryId: cashId, date: '2026-09-02' })
      .expect(201);

    const run = await request(app)
      .post('/api/v1/payroll/runs')
      .set(admin())
      .send({ periodYear: 2026, periodMonth: 9 })
      .expect(201);
    const runId = run.body.data.id as string;
    await request(app)
      .put(`/api/v1/payroll/runs/${runId}/advance-deductions`)
      .set(admin())
      .send({ employeeId: firstId, deductions: [{ advanceId, amount: 3000 }] })
      .expect(200);
    const posted = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/post`)
      .set(admin())
      .send({ salaryExpenseAccountCode: '5230' })
      .expect(200);
    const paid = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/disburse`)
      .set(admin())
      .send({ treasuryId: cashId, date: '2026-09-30' })
      .expect(200);
    const settled = await request(app).get(`/api/v1/advances/${advanceId}`).set(admin()).expect(200);
    expect(settled.body.data.status).toBe(AdvanceStatus.SETTLED);

    await request(app)
      .post(`/api/v1/payroll/runs/${runId}/regenerate`)
      .set(admin())
      .expect(400);

    const reopened = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/reopen`)
      .set(admin())
      .send({ reason: 'Missed an employee' })
      .expect(200);
    expect(reopened.body.data.status).toBe('draft');
    expect(reopened.body.data.accrualJournalNumber).toBeNull();
    expect(reopened.body.data.reopenHistory).toEqual([
      expect.objectContaining({
        fromStatus: 'disbursed',
        accrualJournalNumber: posted.body.data.accrualJournalNumber,
        journalNumber: paid.body.data.journalNumber,
        reason: 'Missed an employee',
      }),
    ]);
    expect(reopened.body.data.reopenHistory[0].reversalJournalNumbers).toHaveLength(2);

    const originals = await JournalEntryModel.find({
      entryNumber: { $in: [posted.body.data.accrualJournalNumber, paid.body.data.journalNumber] },
    }).lean().exec();
    expect(originals.map((row) => row.status)).toEqual(['reversed', 'reversed']);

    const advanceBack = await request(app).get(`/api/v1/advances/${advanceId}`).set(admin()).expect(200);
    expect(advanceBack.body.data).toMatchObject({
      status: AdvanceStatus.DISBURSED,
      payrollRecovered: 0,
      balanceToSettle: 3000,
    });

    const payable = await request(app).get('/api/v1/ledgers/2121').set(admin()).expect(200);
    expect(payable.body.data.closingBalance).toBe(0);
    const salary = await request(app).get('/api/v1/ledgers/5230').set(admin()).expect(200);
    expect(salary.body.data.closingBalance).toBe(0);

    const refreshed = await request(app)
      .post(`/api/v1/payroll/runs/${runId}/regenerate`)
      .set(admin())
      .expect(200);
    expect(refreshed.body.data.lines).toHaveLength(2);
    const first = (refreshed.body.data.lines as Array<{ employeeId: string; totalAdvanceDeductions: number }>)
      .find((line) => line.employeeId === firstId)!;
    expect(first.totalAdvanceDeductions).toBe(3000);

    await request(app)
      .post(`/api/v1/payroll/runs/${runId}/post`)
      .set(admin())
      .send({ salaryExpenseAccountCode: '5230' })
      .expect(200);
  });

  it('deletes a posted run by reversing its accrual, admin only', async () => {
    const runs = await request(app).get('/api/v1/payroll/runs').set(admin()).expect(200);
    const posted = (runs.body.data as Array<{ id: string; status: string; accrualJournalNumber: string }>)
      .find((row) => row.status === 'posted')!;

    await request(app)
      .delete(`/api/v1/payroll/runs/${posted.id}`)
      .set('Authorization', `Bearer ${firstToken}`)
      .expect(403);

    const deleted = await request(app)
      .delete(`/api/v1/payroll/runs/${posted.id}?reason=Wrong%20month`)
      .set(admin())
      .expect(200);
    expect(deleted.body.data.reversalJournalNumbers).toHaveLength(1);
    await request(app).get(`/api/v1/payroll/runs/${posted.id}`).set(admin()).expect(404);

    const accrual = await JournalEntryModel.findOne({ entryNumber: posted.accrualJournalNumber }).lean().exec();
    expect(accrual!.status).toBe('reversed');
    const salary = await request(app).get('/api/v1/ledgers/5230').set(admin()).expect(200);
    expect(salary.body.data.closingBalance).toBe(0);
  });
});
