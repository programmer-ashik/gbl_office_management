import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { BillPaymentType } from '../src/common/enums/ar-ap.enum';
import { InvoiceType } from '../src/common/enums/ar-ap.enum';
import { PurchaseDestination } from '../src/common/enums/procurement.enum';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 7 accounts payable and receivable (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let projectId: string;
  let supplierId: string;
  let itemId: string;
  let warehouseId: string;
  let treasuryId: string;
  let invoiceId: string;
  let paymentId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'arap.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'ARAP',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'arap.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'ARAP',
        lastName: 'Worker',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Client tower',
        client: {
          name: 'Skyline Holdings',
          email: 'billing@skyline.test',
        },
        startDate: '2026-09-01',
        contractValue: 1_000_000,
        totalBudget: 400_000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    const treasury = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    treasuryId = (treasury.body.data as Array<{ id: string; kind: string }>).find(
      (row) => row.kind === 'commercial_bank',
    )!.id;

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Metro Supplies',
        paymentTermsDays: 30,
      })
      .expect(201);
    supplierId = supplier.body.data.id as string;

    const item = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'STL-01', name: 'Structural steel', unit: 'ton' })
      .expect(201);
    itemId = item.body.data.id as string;

    const warehouses = await request(app)
      .get('/api/v1/warehouses')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    warehouseId = (warehouses.body.data as Array<{ id: string; isDefault: boolean }>).find(
      (row) => row.isDefault,
    )!.id;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('blocks employees from creating invoices', async () => {
    await request(app)
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        projectId,
        type: InvoiceType.LUMP_SUM,
        date: '2026-09-02',
        dueDate: '2026-10-02',
        amount: 100_000,
        description: 'Mobilisation',
      })
      .expect(403);
  });

  it('issues a client invoice and posts AR / revenue', async () => {
    const invoice = await request(app)
      .post('/api/v1/receivables')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        projectId,
        type: InvoiceType.MILESTONE,
        date: '2026-08-01',
        dueDate: '2026-08-15',
        amount: 200_000,
        description: 'Foundation complete',
        milestoneLabel: 'Milestone 1',
      })
      .expect(201);

    invoiceId = invoice.body.data.id as string;
    expect(invoice.body.data.invoiceNumber).toMatch(/^INV-/);
    expect(invoice.body.data.isOverdue).toBe(true);
    expect(invoice.body.data.openAmount).toBe(200_000);

    const arLedger = await request(app)
      .get('/api/v1/ledgers/1121')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(arLedger.body.data.account.balance).toBe(200_000);
  });

  it('collects partial payment against an invoice', async () => {
    const collected = await request(app)
      .post(`/api/v1/receivables/${invoiceId}/collect`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amount: 80_000,
        treasuryId,
        date: '2026-09-03',
      })
      .expect(200);

    expect(collected.body.data.status).toBe('partial');
    expect(collected.body.data.paidAmount).toBe(80_000);
    expect(collected.body.data.openAmount).toBe(120_000);

    const arLedger = await request(app)
      .get('/api/v1/ledgers/1121')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(arLedger.body.data.account.balance).toBe(120_000);
  });

  it('lists overdue invoice notifications', async () => {
    const overdue = await request(app)
      .get('/api/v1/receivables/overdue')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = overdue.body.data as Array<{ invoiceId: string; clientEmail: string }>;
    expect(rows.some((row) => row.invoiceId === invoiceId)).toBe(true);
    expect(rows.find((row) => row.invoiceId === invoiceId)?.clientEmail).toBe(
      'billing@skyline.test',
    );
  });

  it('accrues AP on goods receipt and pays the supplier', async () => {
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        destination: PurchaseDestination.DIRECT_TO_SITE,
        date: '2026-09-02',
        projectId,
        lines: [{ itemId, quantity: 2, unitCost: 15_000 }],
      })
      .expect(201);

    const poId = po.body.data.id as string;
    const lineId = po.body.data.lines[0].id as string;

    await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-02',
        lines: [{ lineId, quantity: 2 }],
      })
      .expect(201);

    const apBefore = await request(app)
      .get('/api/v1/ledgers/2111')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(apBefore.body.data.account.balance).toBe(30_000);

    const scheduled = await request(app)
      .post('/api/v1/payables/payments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        amount: 30_000,
        treasuryId,
        scheduledDate: '2026-09-05',
        memo: 'Steel settlement',
      })
      .expect(201);
    paymentId = scheduled.body.data.id as string;
    expect(scheduled.body.data.status).toBe('scheduled');

    const executed = await request(app)
      .post(`/api/v1/payables/payments/${paymentId}/execute`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: '2026-09-05' })
      .expect(200);
    expect(executed.body.data.status).toBe('executed');

    const apAfter = await request(app)
      .get('/api/v1/ledgers/2111')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(apAfter.body.data.account.balance).toBe(0);

    const ledger = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/ledger`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(ledger.body.data.outstanding).toBe(0);
    expect(
      ledger.body.data.entries.some(
        (entry: { type: string }) => entry.type === 'payment',
      ),
    ).toBe(true);
  });

  it('records a cash supplier bill through AP then clears it', async () => {
    const before = await request(app)
      .get('/api/v1/ledgers/2111')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const bill = await request(app)
      .post('/api/v1/payables/bills')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        paymentType: BillPaymentType.CASH,
        date: '2026-09-06',
        amount: 5_000,
        description: 'Courier charges',
        treasuryId,
      })
      .expect(201);

    expect(bill.body.data.status).toBe('paid');

    const after = await request(app)
      .get(`/api/v1/ledgers/2111?entityType=supplier&entityId=${supplierId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Net AP balance unchanged (Cr then Dr), but both AP legs are visible.
    expect(after.body.data.account.balance).toBe(before.body.data.account.balance);
    const billLines = after.body.data.entries.filter(
      (row: { reference?: string | null; credit: number; debit: number }) =>
        row.reference === bill.body.data.billNumber,
    );
    expect(billLines.some((row: { credit: number }) => row.credit === 5_000)).toBe(
      true,
    );
    expect(billLines.some((row: { debit: number }) => row.debit === 5_000)).toBe(
      true,
    );
  });

  it('generates AR and AP aging buckets', async () => {
    const arAging = await request(app)
      .get('/api/v1/receivables/aging?asOf=2026-09-30')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(arAging.body.data.total).toBeGreaterThan(0);
    expect(arAging.body.data.buckets).toHaveLength(5);

    const apAging = await request(app)
      .get('/api/v1/payables/aging?asOf=2026-09-30')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(apAging.body.data.buckets).toHaveLength(5);
  });
});
