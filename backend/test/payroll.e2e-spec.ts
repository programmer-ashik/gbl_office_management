import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus } from '../src/common/enums/advance-status.enum';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 8 payroll and project cost allocation (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;
  let projectAId: string;
  let projectBId: string;
  let treasuryId: string;
  let payrollRunId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'payroll.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Payroll',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'payroll.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Site',
        lastName: 'Engineer',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    employeeId = employee.body.data.user.id as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);

    const projectA = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bridge span',
        client: { name: 'Infra Corp' },
        startDate: '2026-09-01',
        contractValue: 800_000,
        totalBudget: 300_000,
      })
      .expect(201);
    projectAId = projectA.body.data.id as string;

    const projectB = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Road resurfacing',
        client: { name: 'City Works' },
        startDate: '2026-09-01',
        contractValue: 400_000,
        totalBudget: 150_000,
      })
      .expect(201);
    projectBId = projectB.body.data.id as string;

    const treasury = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    treasuryId = (treasury.body.data as Array<{ id: string; kind: string }>).find(
      (row) => row.kind === 'commercial_bank',
    )!.id;

    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-01',
        memo: 'Opening cash',
        lines: [
          { accountCode: '1010', debit: 1_000_000 },
          { accountCode: '3000', credit: 1_000_000 },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('blocks employees from generating payroll', async () => {
    await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ periodYear: 2026, periodMonth: 9 })
      .expect(403);
  });

  it('creates salary structure and logs project time', async () => {
    await request(app)
      .put('/api/v1/payroll/salary-structures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        basic: 40_000,
        allowances: [{ name: 'Site allowance', amount: 5000 }],
        deductions: [{ name: 'Tax', amount: 2000 }],
      })
      .expect(200);

    await request(app)
      .post('/api/v1/payroll/time-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        projectId: projectAId,
        periodYear: 2026,
        periodMonth: 9,
        unit: 'days',
        quantity: 15,
      })
      .expect(201);

    await request(app)
      .post('/api/v1/payroll/time-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId,
        projectId: projectBId,
        periodYear: 2026,
        periodMonth: 9,
        unit: 'days',
        quantity: 5,
      })
      .expect(201);
  });

  it('generates payroll with advance auto-deduction and project allocation', async () => {
    const advance = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        projectId: projectAId,
        amount: 8000,
        purpose: 'Site petty cash',
      })
      .expect(201);

    await request(app)
      .post(`/api/v1/advances/${advance.body.data.id as string}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        treasuryId,
        date: '2026-09-05',
      })
      .expect(201);

    const run = await request(app)
      .post('/api/v1/payroll/runs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ periodYear: 2026, periodMonth: 9 })
      .expect(201);

    payrollRunId = run.body.data.id as string;
    const line = run.body.data.lines[0];
    expect(line.gross).toBe(45_000);
    expect(line.totalAdvanceDeductions).toBe(8000);
    expect(line.netPay).toBe(35_000);
    expect(line.allocations).toHaveLength(2);
    expect(line.allocations[0].amount).toBe(33_750);
    expect(line.allocations[1].amount).toBe(11_250);
  });

  it('disburses payroll and posts labor cost to projects', async () => {
    const disbursed = await request(app)
      .post(`/api/v1/payroll/runs/${payrollRunId}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        treasuryId,
        date: '2026-09-30',
      })
      .expect(200);

    expect(disbursed.body.data.status).toBe('disbursed');
    expect(disbursed.body.data.journalNumber).toMatch(/^JE-/);

    const projectA = await request(app)
      .get(`/api/v1/projects/${projectAId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(projectA.body.data.financials.directCost).toBe(33_750);

    const projectB = await request(app)
      .get(`/api/v1/projects/${projectBId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(projectB.body.data.financials.directCost).toBe(11_250);

    const advance = await request(app)
      .get('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const row = (advance.body.data as Array<{ status: string }>)[0];
    expect(row.status).toBe(AdvanceStatus.SETTLED);

    const laborLedger = await request(app)
      .get('/api/v1/ledgers/5100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(laborLedger.body.data.account.balance).toBe(45_000);
  });
});
