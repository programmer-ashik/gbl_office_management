import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Opening balance for an existing business (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeId: string;
  let customerId: string;
  let supplierId: string;
  let cashTreasuryId: string;
  let openingJournalId: string;

  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'ob.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'OB',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'ob.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'OB',
        lastName: 'Worker',
      })
      .expect(201);
    employeeId = employee.body.data.user.id as string;

    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth())
      .send({ name: 'Legacy Client Ltd' })
      .expect(201);
    customerId = customer.body.data.id as string;

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set(auth())
      .send({ name: 'Legacy Cement Co', paymentTermsDays: 30 })
      .expect(201);
    supplierId = supplier.body.data.id as string;

    const treasury = await request(app)
      .get('/api/v1/treasury')
      .set(auth())
      .expect(200);
    cashTreasuryId = (
      treasury.body.data as Array<{ id: string; glAccountCode: string }>
    ).find((row) => row.glAccountCode === '1111')!.id;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('posts one opening journal with party dues and no project on advances', async () => {
    const res = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: '2026-08-31',
        memo: 'Opening balance as of 2026-08-31',
        reference: 'OPENING',
        journalType: 'opening_balance',
        intent: 'post',
        lines: [
          { accountCode: '1111', debit: 50_000 },
          {
            accountCode: '1151',
            debit: 30_000,
            entityType: 'customer',
            entityId: customerId,
          },
          {
            accountCode: '1161',
            debit: 5_000,
            entityType: 'employee',
            entityId: employeeId,
          },
          {
            accountCode: '2111',
            credit: 20_000,
            entityType: 'supplier',
            entityId: supplierId,
          },
          { accountCode: '3200', credit: 65_000 },
        ],
      })
      .expect(201);
    openingJournalId = res.body.data.id as string;

    const invoices = await request(app)
      .get('/api/v1/receivables')
      .set(auth())
      .expect(200);
    expect(invoices.body.data).toHaveLength(0);
  });

  it('lists the customer opening due and receives part of it', async () => {
    const dues = await request(app)
      .get('/api/v1/receivables/opening-dues')
      .set(auth())
      .expect(200);
    expect(dues.body.data).toEqual([
      expect.objectContaining({
        customerId,
        openingAmount: 30_000,
        receivedAmount: 0,
        openAmount: 30_000,
      }),
    ]);

    const received = await request(app)
      .post(`/api/v1/receivables/opening-dues/${customerId}/receive`)
      .set(auth())
      .send({ amount: 12_000, treasuryId: cashTreasuryId, date: '2026-09-05' })
      .expect(201);
    expect(received.body.data.openAmount).toBe(18_000);

    await request(app)
      .post(`/api/v1/receivables/opening-dues/${customerId}/receive`)
      .set(auth())
      .send({ amount: 20_000, treasuryId: cashTreasuryId, date: '2026-09-06' })
      .expect(400);

    const aging = await request(app)
      .get('/api/v1/receivables/aging?asOf=2026-09-30')
      .set(auth())
      .expect(200);
    expect(aging.body.data.total).toBe(18_000);
  });

  it('counts the supplier opening due as payable outstanding', async () => {
    const ledger = await request(app)
      .get(`/api/v1/suppliers/${supplierId}/ledger`)
      .set(auth())
      .expect(200);
    expect(ledger.body.data.opening).toBe(20_000);
    expect(ledger.body.data.outstanding).toBe(20_000);
    expect(ledger.body.data.entries[0].type).toBe('opening');

    const apAging = await request(app)
      .get('/api/v1/payables/aging?asOf=2026-09-30')
      .set(auth())
      .expect(200);
    expect(apAging.body.data.total).toBe(20_000);

    await request(app)
      .post('/api/v1/payables/payments')
      .set(auth())
      .send({ supplierId, amount: 25_000, treasuryId: cashTreasuryId })
      .expect(400);

    await request(app)
      .post('/api/v1/payables/payments')
      .set(auth())
      .send({ supplierId, amount: 20_000, treasuryId: cashTreasuryId })
      .expect(201);
  });

  it('blocks reversing the opening journal once a receipt exists', async () => {
    const res = await request(app)
      .post(`/api/v1/journals/${openingJournalId}/reverse`)
      .set(auth())
      .expect(400);
    expect(res.body.message).toContain('opening receipt');
  });
});
