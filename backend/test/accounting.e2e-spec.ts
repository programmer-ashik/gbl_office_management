import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 2 double-entry engine (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'ledger.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Ledger',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'ledger.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Ledger',
        lastName: 'Worker',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('seeds a five-type chart of accounts', async () => {
    const res = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const codes = (res.body.data as Array<{ code: string; type: string }>).map(
      (row) => row.code,
    );
    expect(codes).toEqual(expect.arrayContaining(['1000', '2000', '3000', '4000', '5000']));
    const types = new Set(
      (res.body.data as Array<{ type: string }>).map((row) => row.type),
    );
    expect(types).toEqual(
      new Set(['asset', 'liability', 'equity', 'revenue', 'expense']),
    );
  });

  it('rejects an unbalanced journal', async () => {
    const res = await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-02',
        memo: 'Unbalanced opening',
        lines: [
          { accountCode: '1000', debit: 1000 },
          { accountCode: '3000', credit: 900 },
        ],
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(String(res.body.message)).toMatch(/not balanced/i);
  });

  it('posts a balanced journal and writes ledger lines', async () => {
    const res = await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-02',
        memo: 'Owner capital introduced',
        reference: 'OPEN-1',
        lines: [
          { accountCode: '1000', debit: 50000 },
          { accountCode: '3000', credit: 50000 },
        ],
      })
      .expect(201);

    expect(res.body.data.totalDebit).toBe(50000);
    expect(res.body.data.totalCredit).toBe(50000);
    expect(res.body.data.status).toBe('posted');
    expect(res.body.data.entryNumber).toMatch(/^JE-/);

    const ledger = await request(app)
      .get('/api/v1/ledgers/1000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(ledger.body.data.account.balance).toBe(50000);
    expect(ledger.body.data.entries).toHaveLength(1);
  });

  it('returns a balanced trial balance', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-02',
        memo: 'Office supplies from cash',
        lines: [
          { accountCode: '5200', debit: 2500.5 },
          { accountCode: '1000', credit: 2500.5 },
        ],
      })
      .expect(201);

    const res = await request(app)
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.isBalanced).toBe(true);
    expect(res.body.data.totalDebit).toBe(res.body.data.totalCredit);
    expect(res.body.data.totalDebit).toBeGreaterThan(0);
  });

  it('blocks employees from posting journals', async () => {
    const res = await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        date: '2026-09-02',
        memo: 'Unauthorized',
        lines: [
          { accountCode: '1000', debit: 10 },
          { accountCode: '3000', credit: 10 },
        ],
      })
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('filters journals by date and supports edit/delete', async () => {
    const created = await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-08-15',
        memo: 'gbl-2026-08-15-Cash in Hand-Owner Equity-',
        lines: [
          { accountCode: '1000', debit: 1_000 },
          { accountCode: '3000', credit: 1_000 },
        ],
      })
      .expect(201);

    const journalId = created.body.data.id as string;

    const filtered = await request(app)
      .get('/api/v1/journals?fromDate=2026-08-01&toDate=2026-08-31')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (filtered.body.data as Array<{ id: string }>).some((row) => row.id === journalId),
    ).toBe(true);

    const outside = await request(app)
      .get('/api/v1/journals?fromDate=2026-09-01&toDate=2026-09-30')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      (outside.body.data as Array<{ id: string }>).some((row) => row.id === journalId),
    ).toBe(false);

    const updated = await request(app)
      .patch(`/api/v1/journals/${journalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-08-16',
        memo: 'gbl-2026-08-16-Cash in Hand-Owner Equity-',
        lines: [
          { accountCode: '1000', debit: 1_500 },
          { accountCode: '3000', credit: 1_500 },
        ],
      })
      .expect(200);
    expect(updated.body.data.totalDebit).toBe(1_500);

    await request(app)
      .delete(`/api/v1/journals/${journalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(app)
      .get(`/api/v1/journals/${journalId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
