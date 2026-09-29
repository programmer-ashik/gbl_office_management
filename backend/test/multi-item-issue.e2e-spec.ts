import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { PurchaseDestination } from '../src/common/enums/procurement.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

type StockRow = { itemId: string; sku: string; quantity: number; value: number };

describe('Issue several items to a project in one issue (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let projectId: string;
  let warehouseId: string;
  let cementId: string;
  let rodId: string;
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function stockFor(sku: string): Promise<StockRow | undefined> {
    const res = await request(app).get('/api/v1/inventory').set(auth()).expect(200);
    return (res.body.data as StockRow[]).find(
      (row) => row.sku === sku && (row as { warehouseId?: string }).warehouseId === warehouseId,
    );
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'multi.issue.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Multi',
        lastName: 'Issue',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send({
        name: 'Warehouse fit-out',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 500000,
        totalBudget: 200000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    const warehouses = await request(app).get('/api/v1/warehouses').set(auth()).expect(200);
    warehouseId = (warehouses.body.data as Array<{ id: string; isDefault: boolean }>).find(
      (row) => row.isDefault,
    )!.id;

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set(auth())
      .send({ name: 'Bengal Supplies', paymentTermsDays: 30 })
      .expect(201);

    const cement = await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ sku: 'MI-CEM', name: 'Cement bag', unit: 'bag' })
      .expect(201);
    cementId = cement.body.data.id as string;
    const rod = await request(app)
      .post('/api/v1/items')
      .set(auth())
      .send({ sku: 'MI-ROD', name: 'Steel rod', unit: 'pcs' })
      .expect(201);
    rodId = rod.body.data.id as string;

    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set(auth())
      .send({
        supplierId: supplier.body.data.id,
        destination: PurchaseDestination.WAREHOUSE,
        date: '2026-09-02',
        warehouseId,
        lines: [
          { itemId: cementId, quantity: 10, unitCost: 500 },
          { itemId: rodId, quantity: 5, unitCost: 1000 },
        ],
      })
      .expect(201);
    const lines = po.body.data.lines as Array<{ id: string; itemId: string }>;
    await request(app)
      .post(`/api/v1/purchase-orders/${po.body.data.id}/receive`)
      .set(auth())
      .send({
        date: '2026-09-03',
        lines: lines.map((line) => ({
          lineId: line.id,
          quantity: line.itemId === cementId ? 10 : 5,
        })),
      })
      .expect(201);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('issues two items as one issue with one journal', async () => {
    const issued = await request(app)
      .post('/api/v1/inventory/issues')
      .set(auth())
      .send({
        warehouseId,
        projectId,
        date: '2026-09-05',
        lines: [
          { itemId: cementId, quantity: 4 },
          { itemId: rodId, quantity: 2 },
        ],
      })
      .expect(201);
    expect(issued.body.data.amount).toBe(4000);

    const list = await request(app).get('/api/v1/inventory/issues').set(auth()).expect(200);
    const row = (
      list.body.data as Array<{ issueNumber: string; lines: Array<{ sku: string; quantity: number }> }>
    ).find((issue) => issue.issueNumber === issued.body.data.issueNumber)!;
    expect(row.lines).toHaveLength(2);
    expect(row.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'MI-CEM', quantity: 4 }),
        expect.objectContaining({ sku: 'MI-ROD', quantity: 2 }),
      ]),
    );

    expect((await stockFor('MI-CEM'))!.quantity).toBe(6);
    expect((await stockFor('MI-ROD'))!.quantity).toBe(3);
  });

  it('rejects the whole issue when one item is short, deducting nothing', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/issues')
      .set(auth())
      .send({
        warehouseId,
        projectId,
        date: '2026-09-06',
        lines: [
          { itemId: cementId, quantity: 2 },
          { itemId: rodId, quantity: 99 },
        ],
      })
      .expect(400);
    expect(String(res.body.message ?? res.body.error?.message ?? JSON.stringify(res.body))).toMatch(
      /MI-ROD/,
    );

    expect((await stockFor('MI-CEM'))!.quantity).toBe(6);
    expect((await stockFor('MI-ROD'))!.quantity).toBe(3);
  });
});
