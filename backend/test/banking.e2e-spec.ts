import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { Role } from '../src/common/enums/role.enum';
import { TransferKind } from '../src/common/enums/transfer-kind.enum';
import { TreasuryKind } from '../src/common/enums/treasury-kind.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 4 banking, cash and petty cash (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let cashId: string;
  let bankId: string;
  let childBankId: string;
  let childBankCode: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'bank.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Bank',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'bank.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Bank',
        lastName: 'Worker',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;
    expect(employee.body.data.user.role).toBe(Role.EMPLOYEE);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('seeds cash, bank and mobile treasury accounts on the CoA', async () => {
    const res = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = res.body.data as Array<{
      id: string;
      kind: string;
      glAccountCode: string;
      bookBalance: number;
    }>;
    const byKind = new Map(rows.map((row) => [row.kind, row]));
    expect(byKind.get(TreasuryKind.CASH)?.glAccountCode).toBe('1111');
    expect(byKind.get(TreasuryKind.COMMERCIAL_BANK)?.glAccountCode).toBe('1112');
    expect(byKind.get(TreasuryKind.MOBILE_BANKING)?.glAccountCode).toBe('1020');
    cashId = byKind.get(TreasuryKind.CASH)!.id;
    bankId = byKind.get(TreasuryKind.COMMERCIAL_BANK)!.id;
  });

  it('creates a child bank account under 1010', async () => {
    const res = await request(app)
      .post('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Dutch-Bangla Bank',
        kind: TreasuryKind.COMMERCIAL_BANK,
        institution: 'DBBL',
        accountNumber: '101-234567-00',
      })
      .expect(201);

    expect(res.body.data.glAccountCode).toMatch(/^1010-/);
    expect(res.body.data.bookBalance).toBe(0);
    childBankId = res.body.data.id as string;
    childBankCode = res.body.data.glAccountCode as string;
  });

  it('blocks employees from transferring funds', async () => {
    await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        fromTreasuryId: cashId,
        toTreasuryId: bankId,
        amount: 100,
        date: '2026-09-02',
        memo: 'Unauthorized',
      })
      .expect(403);
  });

  it('posts a cash-to-bank deposit journal and updates both balances', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: '2026-09-01',
        memo: 'Opening cash',
        lines: [
          { accountCode: '1111', debit: 50000 },
          { accountCode: '3100', credit: 50000 },
        ],
      })
      .expect(201);

    const transfer = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromTreasuryId: cashId,
        toTreasuryId: childBankId,
        amount: 15000,
        date: '2026-09-02',
        memo: 'Cash deposited to DBBL',
      })
      .expect(201);

    expect(transfer.body.data.kind).toBe(TransferKind.DEPOSIT);
    expect(transfer.body.data.journalEntryNumber).toMatch(/^JE-/);
    expect(transfer.body.data.amount).toBe(15000);

    const accounts = await request(app)
      .get('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const byId = new Map(
      (accounts.body.data as Array<{ id: string; bookBalance: number }>).map(
        (row) => [row.id, row.bookBalance],
      ),
    );
    expect(byId.get(cashId)).toBe(35000);
    expect(byId.get(childBankId)).toBe(15000);

    const trial = await request(app)
      .get('/api/v1/reports/trial-balance')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(trial.body.data.isBalanced).toBe(true);
  });

  it('withdraws from bank to petty cash', async () => {
    const petty = await request(app)
      .post('/api/v1/treasury')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Office petty cash',
        kind: TreasuryKind.PETTY_CASH,
      })
      .expect(201);

    const transfer = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromTreasuryId: childBankId,
        toTreasuryId: petty.body.data.id,
        amount: 2000,
        date: '2026-09-03',
        memo: 'Petty cash float',
        kind: TransferKind.WITHDRAWAL,
      })
      .expect(201);

    expect(transfer.body.data.kind).toBe(TransferKind.WITHDRAWAL);

    const bank = await request(app)
      .get(`/api/v1/treasury/${childBankId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(bank.body.data.bookBalance).toBe(13000);
  });

  it('auto-matches an imported bank statement and completes reconciliation', async () => {
    const csv = [
      'date,description,amount,reference',
      '2026-09-02,Cash deposited to DBBL,15000,TRF',
      '2026-09-03,Petty cash float,-2000,WD',
    ].join('\n');

    const imported = await request(app)
      .post(`/api/v1/treasury/${childBankId}/reconciliations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        asOf: '2026-09-03',
        statementBalance: 13000,
        csv,
      })
      .expect(201);

    expect(imported.body.data.glAccountCode).toBe(childBankCode);
    expect(imported.body.data.bookBalance).toBe(13000);
    expect(imported.body.data.statementBalance).toBe(13000);
    expect(imported.body.data.matchedCount).toBe(2);
    expect(imported.body.data.unmatchedStatementCount).toBe(0);
    expect(imported.body.data.isReconciled).toBe(true);
    expect(imported.body.data.difference).toBe(0);

    const completed = await request(app)
      .post(`/api/v1/reconciliations/${imported.body.data.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(completed.body.data.status).toBe('completed');
  });

  it('rejects a transfer onto the same account', async () => {
    await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromTreasuryId: cashId,
        toTreasuryId: cashId,
        amount: 10,
        date: '2026-09-04',
        memo: 'Same account',
      })
      .expect(400);
  });
});
