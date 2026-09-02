import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { ProjectStatus } from '../src/common/enums/project-status.enum';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 3 project management & budgeting (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let managerToken: string;
  let managerId: string;
  let projectId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'projects.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Project',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'projects.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Project',
        lastName: 'Worker',
      })
      .expect(201);
    const employeeId = employee.body.data.user.id as string;
    managerId = employeeId;

    await request(app)
      .patch(`/api/v1/users/${employeeId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.PROJECT_MANAGER })
      .expect(200);

    const manager = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'projects.worker@gblenterprise.com',
        password: 'Worker123!',
      })
      .expect(201);
    managerToken = manager.body.data.tokens.accessToken as string;

    const blocked = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'projects.employee@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Site',
        lastName: 'Hand',
      })
      .expect(201);
    employeeToken = blocked.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('creates a project with client, dates, contract value and budget', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gulshan Tower Fit-out',
        client: {
          name: 'GBL Properties Ltd',
          contactName: 'Karim Ali',
          email: 'karim@gblproperties.com',
          phone: '01700000000',
        },
        startDate: '2026-09-01',
        endDate: '2026-12-31',
        contractValue: 500000,
        totalBudget: 320000,
        managerId,
        description: 'Interior fit-out for Gulshan commercial floor',
      })
      .expect(201);

    expect(res.body.data.code).toMatch(/^PRJ-2026-/);
    expect(res.body.data.status).toBe(ProjectStatus.PLANNING);
    expect(res.body.data.client.name).toBe('GBL Properties Ltd');
    expect(res.body.data.contractValue).toBe(500000);
    expect(res.body.data.totalBudget).toBe(320000);
    expect(res.body.data.financials.isOverBudget).toBe(false);
    expect(res.body.data.financials.totalCost).toBe(0);
    projectId = res.body.data.id as string;
  });

  it('lets a project manager change status', async () => {
    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/status`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ status: ProjectStatus.ACTIVE })
      .expect(200);

    expect(res.body.data.status).toBe(ProjectStatus.ACTIVE);
  });

  it('rejects a budget of zero', async () => {
    await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No budget',
        client: { name: 'Test Client' },
        startDate: '2026-09-01',
        contractValue: 1000,
        totalBudget: 0,
      })
      .expect(400);
  });

  it('blocks employees from creating projects', async () => {
    await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        name: 'Unauthorized',
        client: { name: 'Nope' },
        startDate: '2026-09-01',
        contractValue: 1000,
        totalBudget: 500,
      })
      .expect(403);
  });

  it('aggregates tagged journals into gross and net profit', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-02',
        memo: 'Milestone invoice recognized',
        projectId,
        lines: [
          { accountCode: '1100', debit: 200000 },
          { accountCode: '4000', credit: 200000 },
        ],
      })
      .expect(201);

    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-03',
        memo: 'Site materials and travel',
        projectId,
        lines: [
          { accountCode: '5000', debit: 80000 },
          { accountCode: '5100', debit: 40000 },
          { accountCode: '5300', debit: 5000 },
          { accountCode: '1000', credit: 125000 },
        ],
      })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/profitability`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.financials.recognizedRevenue).toBe(200000);
    expect(res.body.data.financials.directCost).toBe(120000);
    expect(res.body.data.financials.otherExpense).toBe(5000);
    expect(res.body.data.financials.totalCost).toBe(125000);
    expect(res.body.data.financials.grossProfit).toBe(80000);
    expect(res.body.data.financials.netProfit).toBe(75000);
    expect(res.body.data.financials.isOverBudget).toBe(false);
    expect(res.body.data.financials.budgetRemaining).toBe(195000);
  });

  it('does not treat employee advances as project cost', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-04',
        memo: 'Advance to site engineer',
        projectId,
        lines: [
          { accountCode: '1300', debit: 10000 },
          { accountCode: '1000', credit: 10000 },
        ],
      })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.financials.totalCost).toBe(125000);
    expect(res.body.data.financials.netProfit).toBe(75000);
  });

  it('flags a project over budget when costs exceed the threshold', async () => {
    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tight budget site',
        client: { name: 'Threshold Client' },
        startDate: '2026-09-01',
        contractValue: 5000,
        totalBudget: 1000,
      })
      .expect(201);

    const tightId = created.body.data.id as string;

    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-05',
        memo: 'Materials over budget',
        projectId: tightId,
        lines: [
          { accountCode: '5000', debit: 1500 },
          { accountCode: '1000', credit: 1500 },
        ],
      })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/projects/${tightId}/profitability`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.financials.isOverBudget).toBe(true);
    expect(res.body.data.financials.totalCost).toBe(1500);
    expect(res.body.data.financials.budgetRemaining).toBe(-500);
  });

  it('refuses to delete a project that has ledger activity', async () => {
    await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });
});
