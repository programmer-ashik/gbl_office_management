import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus, SettlementCase } from '../src/common/enums/advance-status.enum';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 5 advance and expense settlement (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let projectId: string;
  let cashId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'advance.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Advance',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'advance.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Site',
        lastName: 'Engineer',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Site mobilisation',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 200000,
        totalBudget: 80000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    const treasury = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    cashId = (
      treasury.body.data as Array<{ id: string; glAccountCode: string }>
    ).find((row) => row.glAccountCode === '1000')!.id;

    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-01',
        memo: 'Opening cash',
        lines: [
          { accountCode: '1000', debit: 100000 },
          { accountCode: '3000', credit: 100000 },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  async function requestAndDisburse(amount: number, purpose: string) {
    const created = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ projectId, amount, purpose })
      .expect(201);
    expect(created.body.data.status).toBe(AdvanceStatus.PENDING);

    const blocked = await request(app)
      .post(`/api/v1/advances/${created.body.data.id}/disburse`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ treasuryId: cashId, date: '2026-09-02' })
      .expect(403);
    expect(blocked.body.success).toBe(false);

    const paid = await request(app)
      .post(`/api/v1/advances/${created.body.data.id}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ treasuryId: cashId, date: '2026-09-02' })
      .expect(201);

    expect(paid.body.data.status).toBe(AdvanceStatus.DISBURSED);
    expect(paid.body.data.disbursementJournalNumber).toMatch(/^JE-/);
    return paid.body.data.id as string;
  }

  it('records disbursement as an employee advance asset, not a project expense', async () => {
    const id = await requestAndDisburse(10000, 'Materials float for mobilisation');

    const ledger = await request(app)
      .get('/api/v1/ledgers/1300')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(ledger.body.data.account.balance).toBe(10000);

    const project = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(project.body.data.financials.totalCost).toBe(0);
    expect(project.body.data.financials.netProfit).toBe(0);

    await request(app)
      .post(`/api/v1/advances/${id}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        lines: [{ accountCode: '5000', amount: 10000, description: 'Cement and sand' }],
      })
      .expect(200);

    const settled = await request(app)
      .post(`/api/v1/advances/${id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    expect(settled.body.data.status).toBe(AdvanceStatus.SETTLED);
    expect(settled.body.data.settlementCase).toBe(SettlementCase.EQUAL);

    const after = await request(app)
      .get('/api/v1/ledgers/1300')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.data.account.balance).toBe(0);

    const costing = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(costing.body.data.financials.directCost).toBe(10000);
    expect(costing.body.data.financials.totalCost).toBe(10000);
  });

  it('returns unspent cash and closes the advance when spend is less', async () => {
    const id = await requestAndDisburse(5000, 'Travel float');

    await request(app)
      .post(`/api/v1/advances/${id}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        lines: [{ accountCode: '5300', amount: 3000, description: 'Bus and meals' }],
      })
      .expect(200);

    const settled = await request(app)
      .post(`/api/v1/advances/${id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ returnTreasuryId: cashId })
      .expect(201);

    expect(settled.body.data.settlementCase).toBe(SettlementCase.LESS);
    expect(settled.body.data.spentAmount).toBe(3000);

    const advances = await request(app)
      .get('/api/v1/ledgers/1300')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(advances.body.data.account.balance).toBe(0);

    const cash = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const cashBalance = (
      cash.body.data as Array<{ glAccountCode: string; bookBalance: number }>
    ).find((row) => row.glAccountCode === '1000')!.bookBalance;
    expect(cashBalance).toBe(87000);
  });

  it('credits employee payable when spend exceeds the advance', async () => {
    const id = await requestAndDisburse(4000, 'Extra site materials');

    await request(app)
      .post(`/api/v1/advances/${id}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        lines: [{ accountCode: '5000', amount: 5500, description: 'Steel extras' }],
      })
      .expect(200);

    const settled = await request(app)
      .post(`/api/v1/advances/${id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    expect(settled.body.data.settlementCase).toBe(SettlementCase.MORE);
    expect(settled.body.data.spentAmount).toBe(5500);

    const payable = await request(app)
      .get('/api/v1/ledgers/2100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(payable.body.data.account.balance).toBe(1500);

    const trial = await request(app)
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(trial.body.data.isBalanced).toBe(true);

    const costing = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(costing.body.data.financials.totalCost).toBe(18500);
  });
});
