import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { PurchaseDestination, PurchaseOrderStatus } from '../src/common/enums/procurement.enum';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 6 procurement, supplier and inventory (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let projectId: string;
  let warehouseId: string;
  let supplierId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'procure.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Procure',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'procure.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Site',
        lastName: 'Store',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tower fit-out',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 500000,
        totalBudget: 200000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    const warehouses = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    warehouseId = (warehouses.body.data as Array<{ id: string; isDefault: boolean }>).find(
      (row) => row.isDefault,
    )!.id;

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Bengal Cement Ltd',
        contactName: 'Rafiq',
        paymentTermsDays: 30,
      })
      .expect(201);
    supplierId = supplier.body.data.id as string;

    const item = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'CEM-50', name: 'OPC Cement 50kg', unit: 'bag' })
      .expect(201);
    itemId = item.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('blocks employees from creating purchase orders', async () => {
    await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        supplierId,
        destination: PurchaseDestination.WAREHOUSE,
        date: '2026-09-02',
        warehouseId,
        lines: [{ itemId, quantity: 10, unitCost: 500 }],
      })
      .expect(403);
  });

  it('costs a project immediately when goods are delivered to site', async () => {
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        destination: PurchaseDestination.DIRECT_TO_SITE,
        date: '2026-09-02',
        projectId,
        lines: [{ itemId, quantity: 10, unitCost: 500 }],
      })
      .expect(201);
    expect(po.body.data.status).toBe(PurchaseOrderStatus.ISSUED);
    expect(po.body.data.orderedAmount).toBe(5000);

    const lineId = po.body.data.lines[0].id as string;
    const received = await request(app)
      .post(`/api/v1/purchase-orders/${po.body.data.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-03',
        lines: [{ lineId, quantity: 10 }],
      })
      .expect(201);
    expect(received.body.data.status).toBe(PurchaseOrderStatus.RECEIVED);

    const beforeIssue = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(beforeIssue.body.data).toEqual([]);

    const project = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(project.body.data.financials.directCost).toBe(5000);
    expect(project.body.data.financials.totalCost).toBe(5000);

    const ap = await request(app)
      .get('/api/v1/ledgers/2000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(ap.body.data.account.balance).toBe(5000);
  });

  it('holds warehouse receipts as inventory until issued to a project', async () => {
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        destination: PurchaseDestination.WAREHOUSE,
        date: '2026-09-04',
        warehouseId,
        lines: [{ itemId, quantity: 8, unitCost: 500 }],
      })
      .expect(201);

    const lineId = po.body.data.lines[0].id as string;
    await request(app)
      .post(`/api/v1/purchase-orders/${po.body.data.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-04',
        lines: [{ lineId, quantity: 8 }],
      })
      .expect(201);

    const stock = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const cement = (
      stock.body.data as Array<{ sku: string; quantity: number; value: number }>
    ).find((row) => row.sku === 'CEM-50')!;
    expect(cement.quantity).toBe(8);
    expect(cement.value).toBe(4000);

    const afterReceive = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(afterReceive.body.data.financials.totalCost).toBe(5000);

    const issued = await request(app)
      .post('/api/v1/inventory/issues')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        warehouseId,
        projectId,
        date: '2026-09-05',
        lines: [{ itemId, quantity: 6 }],
      })
      .expect(201);
    expect(issued.body.data.amount).toBe(3000);

    const remaining = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const leftover = (
      remaining.body.data as Array<{ sku: string; quantity: number; value: number }>
    ).find((row) => row.sku === 'CEM-50')!;
    expect(leftover.quantity).toBe(2);
    expect(leftover.value).toBe(1000);

    const costing = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(costing.body.data.financials.totalCost).toBe(8000);

    await request(app)
      .post(`/api/v1/purchase-orders/${po.body.data.id}/returns`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-06',
        lines: [{ lineId, quantity: 2 }],
      })
      .expect(201);

    const empty = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (empty.body.data as Array<{ sku: string }>).filter((row) => row.sku === 'CEM-50'),
    ).toEqual([]);

    const ledger = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/ledger`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(ledger.body.data.purchased).toBe(9000);
    expect(ledger.body.data.returned).toBe(1000);
    expect(ledger.body.data.outstanding).toBe(8000);

    const trial = await request(app)
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(trial.body.data.isBalanced).toBe(true);

    const inventoryGl = await request(app)
      .get('/api/v1/ledgers/1200')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(inventoryGl.body.data.account.balance).toBe(0);
  });
});
