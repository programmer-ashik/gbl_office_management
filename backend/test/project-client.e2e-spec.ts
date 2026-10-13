import type { Express } from 'express';
import { Types } from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';
import { LedgerLineModel } from '../src/modules/accounting/ledger.model';

jest.setTimeout(180000);

type Project = {
  id: string;
  code: string;
  customerId: string | null;
  client: { name: string; email: string | null; phone: string | null; address: string | null };
};

describe('Projects under a client + AR/AP project tagging (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let customerId: string;
  let supplierId: string;
  let project: Project;
  const today = new Date().toISOString().slice(0, 10);
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  function projectBody(extra: Record<string, unknown>) {
    return {
      name: 'Tower fit-out',
      client: { name: 'Typed name is ignored' },
      startDate: today,
      contractValue: 100_000,
      totalBudget: 80_000,
      ...extra,
    };
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'project.client.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Project',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth())
      .send({
        name: 'Skyline Holdings',
        email: 'ap@skyline.test',
        phone: '01700000000',
        address: 'Road 1, Gulshan, Dhaka',
      })
      .expect(201);
    customerId = customer.body.data.id as string;

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set(auth())
      .send({ name: 'Delta Steel', paymentTermsDays: 30 })
      .expect(201);
    supplierId = supplier.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('creates a project under an existing client and copies its details', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send(projectBody({ customerId }))
      .expect(201);
    project = res.body.data as Project;
    expect(project.customerId).toBe(customerId);
    expect(project.client.name).toBe('Skyline Holdings');
    expect(project.client.email).toBe('ap@skyline.test');
    expect(project.client.address).toBe('Road 1, Gulshan, Dhaka');

    const list = await request(app).get('/api/v1/projects').set(auth()).expect(200);
    const row = (list.body.data as Project[]).find((p) => p.id === project.id);
    expect(row?.customerId).toBe(customerId);
  });

  it('rejects an unknown client id', async () => {
    await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send(projectBody({ customerId: '64b000000000000000000000' }))
      .expect(400);
  });

  it('still accepts a project without a client link', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send(projectBody({ client: { name: 'Walk-in client' } }))
      .expect(201);
    expect(res.body.data.customerId).toBeNull();
    expect(res.body.data.client.name).toBe('Walk-in client');
  });

  it('posts a receivable line tagged with the client project', async () => {
    const res = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: today,
        intent: 'post',
        memo: 'Bill Skyline for fit-out',
        lines: [
          { accountCode: '1151', debit: 5_000, entityType: 'customer', entityId: customerId, projectId: project.id },
          { accountCode: '4200', credit: 5_000 },
        ],
      })
      .expect(201);
    const arLine = (res.body.data.lines as Array<{ accountCode: string; projectId: string | null }>).find(
      (line) => line.accountCode === '1151',
    );
    expect(arLine?.projectId).toBe(project.id);
  });

  it('filters the receivable ledger by customer + project, opening balance included', async () => {
    const other = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send(projectBody({ name: 'Lobby works', customerId }))
      .expect(201);
    const otherId = other.body.data.id as string;
    const earlier = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: earlier,
        intent: 'post',
        memo: 'Bill Skyline for lobby',
        lines: [
          { accountCode: '1151', debit: 3_000, entityType: 'customer', entityId: customerId, projectId: otherId },
          { accountCode: '4200', credit: 3_000 },
        ],
      })
      .expect(201);

    type Ledger = {
      openingBalance: number;
      closingBalance: number;
      periodDebit: number;
      entries: Array<{ projectId: string | null; runningBalance: number }>;
    };
    const ledger = async (query: Record<string, string>) =>
      (
        await request(app)
          .get('/api/v1/ledgers/1151')
          .query({ entityType: 'customer', entityId: customerId, fromDate: today, ...query })
          .set(auth())
          .expect(200)
      ).body.data as Ledger;

    const all = await ledger({});
    expect(all.openingBalance).toBe(3_000);
    expect(all.closingBalance).toBe(8_000);

    const fitOut = await ledger({ projectId: project.id });
    expect(fitOut.openingBalance).toBe(0);
    expect(fitOut.closingBalance).toBe(5_000);
    expect(fitOut.periodDebit).toBe(5_000);
    expect(fitOut.entries.every((row) => row.projectId === project.id)).toBe(true);
    expect(fitOut.entries[0]?.runningBalance).toBe(5_000);

    const lobby = await ledger({ projectId: otherId });
    expect(lobby.openingBalance).toBe(3_000);
    expect(lobby.entries.length).toBe(0);
    expect(lobby.closingBalance).toBe(3_000);

    await request(app)
      .get('/api/v1/ledgers/1151')
      .query({ projectId: 'not-an-id' })
      .set(auth())
      .expect(400);
  });

  it('tags invoices / collections with the project customer so the customer filter finds them', async () => {
    const treasury = await request(app).get('/api/v1/treasury').set(auth()).expect(200);
    const bankId = (treasury.body.data as Array<{ id: string; kind: string }>).find(
      (row) => row.kind === 'commercial_bank',
    )!.id;
    const invoice = await request(app)
      .post('/api/v1/receivables')
      .set(auth())
      .send({
        projectId: project.id,
        type: 'lump_sum',
        date: today,
        dueDate: today,
        amount: 1_000,
        description: 'Fit-out final bill',
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/receivables/${invoice.body.data.id}/collect`)
      .set(auth())
      .send({ amount: 400, treasuryId: bankId, date: today })
      .expect(200);

    type Row = { entryNumber: string; debit: number; credit: number; entityId: string | null; entityName: string | null };
    const rows = async () =>
      (
        await request(app)
          .get('/api/v1/ledgers/1151')
          .query({ entityType: 'customer', entityId: customerId, projectId: project.id })
          .set(auth())
          .expect(200)
      ).body.data.entries as Row[];

    const tagged = await rows();
    const invoiceRow = tagged.find((row) => row.debit === 1_000);
    const collectionRow = tagged.find((row) => row.credit === 400);
    expect(invoiceRow?.entityId).toBe(customerId);
    expect(collectionRow?.entityId).toBe(customerId);

    // Lines posted before this fix carry no customer: still found through the project.
    await LedgerLineModel.updateMany(
      { accountCode: '1151', entityId: new Types.ObjectId(customerId), journalEntryNumber: { $in: [invoiceRow!.entryNumber, collectionRow!.entryNumber] } },
      { $unset: { entityId: 1, entityType: 1, entityName: 1 } },
    );
    const legacy = await rows();
    const legacyInvoice = legacy.find((row) => row.entryNumber === invoiceRow!.entryNumber);
    expect(legacyInvoice?.entityName).toBe('Skyline Holdings');
    expect(legacy.some((row) => row.entryNumber === collectionRow!.entryNumber)).toBe(true);
  });

  it('keeps requiring a project on a receivable debit (it creates a client invoice)', async () => {
    await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: today,
        intent: 'post',
        memo: 'Bill Skyline without project',
        lines: [
          { accountCode: '1151', debit: 1_000, entityType: 'customer', entityId: customerId },
          { accountCode: '4200', credit: 1_000 },
        ],
      })
      .expect(400);
  });

  it('posts a payable line with a project, and with none', async () => {
    for (const projectId of [project.id, undefined]) {
      const res = await request(app)
        .post('/api/v1/journals')
        .set(auth())
        .send({
          date: today,
          intent: 'post',
          memo: `Steel bill ${projectId ? 'for project' : 'no project'}`,
          lines: [
            { accountCode: '5210', debit: 2_000 },
            { accountCode: '2111', credit: 2_000, entityType: 'supplier', entityId: supplierId, projectId },
          ],
        })
        .expect(201);
      const apLine = (res.body.data.lines as Array<{ accountCode: string; projectId: string | null }>).find(
        (line) => line.accountCode === '2111',
      );
      expect(apLine?.projectId ?? null).toBe(projectId ?? null);
    }
  });
});
