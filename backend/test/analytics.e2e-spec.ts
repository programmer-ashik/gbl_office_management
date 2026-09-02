import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { AdvanceStatus } from '../src/common/enums/advance-status.enum';
import { InvoiceType } from '../src/common/enums/ar-ap.enum';
import { PurchaseDestination } from '../src/common/enums/procurement.enum';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 10 analytics and end-to-end integration (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let projectId: string;
  let supplierId: string;
  let itemId: string;
  let cashId: string;
  let bankId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'analytics.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Analytics',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'analytics.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Field',
        lastName: 'Worker',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Integration tower',
        client: {
          name: 'Northbridge Corp',
          email: 'ap@northbridge.test',
        },
        startDate: '2026-08-01',
        contractValue: 800_000,
        totalBudget: 250_000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    const treasury = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const channels = treasury.body.data as Array<{
      id: string;
      kind: string;
      glAccountCode: string;
    }>;
    cashId = channels.find((row) => row.glAccountCode === '1000')!.id;
    bankId = channels.find((row) => row.kind === 'commercial_bank')!.id;

    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-08-01',
        memo: 'Opening capital',
        lines: [
          { accountCode: '1000', debit: 100_000 },
          { accountCode: '1010', debit: 400_000 },
          { accountCode: '3000', credit: 500_000 },
        ],
      })
      .expect(201);

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Prime Materials', paymentTermsDays: 21 })
      .expect(201);
    supplierId = supplier.body.data.id as string;

    const item = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'CEM-40', name: 'Cement bags', unit: 'bag' })
      .expect(201);
    itemId = item.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('runs project → PO → advance → expense → invoice → settlement → statements', async () => {
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        destination: PurchaseDestination.DIRECT_TO_SITE,
        date: '2026-08-05',
        projectId,
        lines: [{ itemId, quantity: 10, unitCost: 1_200 }],
      })
      .expect(201);
    const poId = po.body.data.id as string;
    const lineId = po.body.data.lines[0].id as string;

    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-08-05',
        lines: [{ lineId, quantity: 10 }],
      })
      .expect(201);

    const advance = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        projectId,
        amount: 8_000,
        purpose: 'Site tools and consumables',
      })
      .expect(201);
    const advanceId = advance.body.data.id as string;

    await request(app)
      .post(`/api/v1/advances/${advanceId}/disburse`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ treasuryId: cashId, date: '2026-08-06' })
      .expect(201);

    await request(app)
      .post(`/api/v1/advances/${advanceId}/settlement`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        lines: [
          {
            accountCode: '5000',
            amount: 8_000,
            description: 'Tools charged to project',
          },
        ],
      })
      .expect(200);

    const settled = await request(app)
      .post(`/api/v1/advances/${advanceId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);
    expect(settled.body.data.status).toBe(AdvanceStatus.SETTLED);

    const invoice = await request(app)
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId,
        type: InvoiceType.MILESTONE,
        date: '2026-08-10',
        dueDate: '2026-09-20',
        amount: 150_000,
        description: 'Structure package',
        milestoneLabel: 'Phase A',
      })
      .expect(201);
    const invoiceId = invoice.body.data.id as string;

    await request(app)
      .post(`/api/v1/receivables/${invoiceId}/collect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 60_000,
        treasuryId: bankId,
        date: '2026-08-15',
      })
      .expect(200);

    const project = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(project.body.data.financials.totalCost).toBeGreaterThan(0);
    expect(project.body.data.financials.recognizedRevenue).toBeGreaterThanOrEqual(
      150_000,
    );

    const statements = await request(app)
      .get('/api/v1/analytics/statements')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(statements.body.data.profitAndLoss.revenue).toBeGreaterThanOrEqual(150_000);
    expect(statements.body.data.profitAndLoss.expenses).toBeGreaterThan(0);
    expect(statements.body.data.balanceSheet.assets).toBeGreaterThan(0);
  });

  it('returns cash-flow forecast with open AR and weekly buckets', async () => {
    const forbidden = await request(app)
      .get('/api/v1/analytics/cash-flow')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    expect(forbidden.body.success).toBe(false);

    const report = await request(app)
      .get('/api/v1/analytics/cash-flow')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(report.body.data.weeks).toHaveLength(8);
    expect(report.body.data.openingCash).toEqual(expect.any(Number));
    expect(report.body.data.sources.openReceivables).toBeGreaterThanOrEqual(90_000);
    expect(report.body.data.totalInflow).toBeGreaterThanOrEqual(90_000);
  });

  it('calculates project burn rates', async () => {
    const rows = await request(app)
      .get('/api/v1/analytics/burn-rate')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const match = (
      rows.body.data as Array<{
        projectId: string;
        dailyBurn: number;
        weeklyBurn: number;
        totalCost: number;
      }>
    ).find((row) => row.projectId === projectId);

    expect(match).toBeDefined();
    expect(match!.totalCost).toBeGreaterThan(0);
    expect(match!.dailyBurn).toBeGreaterThan(0);
    expect(match!.weeklyBurn).toBeCloseTo(match!.dailyBurn * 7, 1);
  });
});
