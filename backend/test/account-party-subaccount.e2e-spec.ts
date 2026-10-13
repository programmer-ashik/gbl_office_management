import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';
import { AccountModel } from '../src/modules/accounting/account.model';

jest.setTimeout(180000);

describe('Sub-accounts: postable by default, with an optional party list (e2e)', () => {
  let app: Express;
  let token: string;
  let supplierId: string;
  let customerId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  function createAccount(body: Record<string, unknown>) {
    return request(app).post('/api/v1/accounts').set(auth()).send(body);
  }

  async function patchAccount(code: string, body: Record<string, unknown>) {
    const row = await AccountModel.findOne({ code }).exec();
    return request(app).patch(`/api/v1/accounts/${row!._id.toString()}`).set(auth()).send(body);
  }

  function postJournal(lines: Array<Record<string, unknown>>) {
    return request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: '2026-09-10', memo: 'Party sub-account test', intent: 'post', lines });
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'party.admin@gblenterprise.com', password: 'Admin123!', firstName: 'Party', lastName: 'Admin' })
      .expect(201);
    token = admin.body.data.tokens.accessToken as string;

    const supplier = await request(app)
      .post('/api/v1/suppliers')
      .set(auth())
      .send({ name: 'Sub Ledger Steel', paymentTermsDays: 30 })
      .expect(201);
    supplierId = supplier.body.data.id as string;

    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth())
      .send({ name: 'Sub Ledger Client' })
      .expect(201);
    customerId = customer.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('defaults a sub-account to postable when the role is missing or empty', async () => {
    const omitted = await createAccount({ code: '2141', name: 'Retention Payable', type: 'liability', parentCode: '2110' }).expect(201);
    expect(omitted.body.data.isPostable).toBe(true);
    expect(omitted.body.data.partyType).toBeNull();

    const empty = await createAccount({ code: '2142', name: 'Security Deposit Payable', type: 'liability', parentCode: '2110', isPostable: '' }).expect(201);
    expect(empty.body.data.isPostable).toBe(true);
  });

  it('creates a supplier-list sub-account and posts journal lines by supplier', async () => {
    const created = await createAccount({
      code: '2115',
      name: 'Contractor Payable',
      type: 'liability',
      parentCode: '2110',
      partyType: 'supplier',
    }).expect(201);
    expect(created.body.data.isPostable).toBe(true);
    expect(created.body.data.partyType).toBe('supplier');

    const journal = await postJournal([
      { accountCode: '5210', debit: 900, credit: 0 },
      { accountCode: '2115', debit: 0, credit: 900, entityType: 'supplier', entityId: supplierId },
    ]).expect(201);
    const partyLine = (journal.body.data.lines as Array<Record<string, unknown>>).find(
      (line) => line.accountCode === '2115',
    );
    expect(partyLine?.entityType).toBe('supplier');
    expect(partyLine?.entityName).toBe('Sub Ledger Steel');

    const inferred = await postJournal([
      { accountCode: '5210', debit: 100, credit: 0 },
      { accountCode: '2115', debit: 0, credit: 100, entityId: supplierId },
    ]).expect(201);
    expect(
      (inferred.body.data.lines as Array<Record<string, unknown>>).find(
        (line) => line.accountCode === '2115',
      )?.entityType,
    ).toBe('supplier');

    const wrong = await postJournal([
      { accountCode: '5210', debit: 100, credit: 0 },
      { accountCode: '2115', debit: 0, credit: 100, entityType: 'customer', entityId: customerId },
    ]);
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/only be tagged with a supplier/);

    const opening = await request(app)
      .post('/api/v1/accounts/party-opening-balance')
      .set(auth())
      .send({ accountCode: '2115', entityType: 'supplier', entityId: supplierId, amount: 250 });
    expect(opening.status).toBe(201);
    const obLine = (opening.body.data.lines as Array<Record<string, unknown>>).find(
      (line) => line.accountCode === '2115',
    );
    expect(obLine?.credit).toBe(250);
  });

  it('rejects a party list on headers and built-in party accounts, and guards changes', async () => {
    const header = await createAccount({ code: '2150', name: 'Other Dues', type: 'liability', parentCode: '2100', isPostable: false, partyType: 'supplier' });
    expect(header.status).toBe(400);

    const builtIn = await patchAccount('2111', { partyType: 'customer' });
    expect(builtIn.status).toBe(400);

    const switched = await patchAccount('2115', { partyType: 'customer' });
    expect(switched.status).toBe(400);
    expect(switched.body.message).toMatch(/another party type/);

    const tagged = await patchAccount('2141', { partyType: 'employee' });
    expect(tagged.status).toBe(200);
    expect(tagged.body.data.partyType).toBe('employee');
    const cleared = await patchAccount('2141', { partyType: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.partyType).toBeNull();
  });

  it('turns an emptied header back into a postable supplier-list account', async () => {
    await createAccount({ code: '2116', name: 'Other Payable', type: 'liability', parentCode: '2110', isPostable: false }).expect(201);
    const child = await createAccount({ code: '2116-01', name: 'Mr. Person', type: 'liability', parentCode: '2116' }).expect(201);

    const blocked = await patchAccount('2116', { isPostable: true });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/still has sub-accounts/);

    await request(app).delete(`/api/v1/accounts/${child.body.data.id as string}`).set(auth()).expect(200);
    const converted = await patchAccount('2116', { isPostable: true, partyType: 'supplier' });
    expect(converted.status).toBe(200);
    expect(converted.body.data.isPostable).toBe(true);
    expect(converted.body.data.partyType).toBe('supplier');

    await postJournal([
      { accountCode: '5210', debit: 300, credit: 0 },
      { accountCode: '2116', debit: 0, credit: 300, entityType: 'supplier', entityId: supplierId },
    ]).expect(201);

    const backToHeader = await patchAccount('2116', { isPostable: false });
    expect(backToHeader.status).toBe(400);
    expect(backToHeader.body.message).toMatch(/posted entries/);

    const system = await patchAccount('2111', { isPostable: false });
    expect(system.status).toBe(400);
  });

  it('keeps an own "other" party list and tracks its balances', async () => {
    const payee = await request(app)
      .post('/api/v1/other-parties')
      .set(auth())
      .send({ name: 'Mr. Landlord', kind: 'payable', phone: '01700000000' })
      .expect(201);
    const payeeId = payee.body.data.id as string;
    expect(payee.body.data.balance).toBe(0);

    const duplicate = await request(app)
      .post('/api/v1/other-parties')
      .set(auth())
      .send({ name: 'mr. landlord', kind: 'payable' });
    expect(duplicate.status).toBe(400);

    await request(app)
      .post('/api/v1/other-parties')
      .set(auth())
      .send({ name: 'Mr. Landlord', kind: 'receivable' })
      .expect(201);

    await createAccount({ code: '2117', name: 'Rent Payable', type: 'liability', parentCode: '2110', partyType: 'other' }).expect(201);

    const journal = await postJournal([
      { accountCode: '5210', debit: 400, credit: 0 },
      { accountCode: '2117', debit: 0, credit: 400, entityId: payeeId },
    ]).expect(201);
    const line = (journal.body.data.lines as Array<Record<string, unknown>>).find(
      (row) => row.accountCode === '2117',
    );
    expect(line?.entityType).toBe('other');
    expect(line?.entityName).toBe('Mr. Landlord');

    const wrong = await postJournal([
      { accountCode: '5210', debit: 50, credit: 0 },
      { accountCode: '2117', debit: 0, credit: 50, entityType: 'supplier', entityId: supplierId },
    ]);
    expect(wrong.status).toBe(400);

    await request(app)
      .post('/api/v1/accounts/party-opening-balance')
      .set(auth())
      .send({ accountCode: '2117', entityType: 'other', entityId: payeeId, amount: 100 })
      .expect(201);

    const payables = await request(app)
      .get('/api/v1/other-parties?kind=payable')
      .set(auth())
      .expect(200);
    const row = (payables.body.data as Array<Record<string, unknown>>).find((p) => p.id === payeeId);
    expect(row?.balance).toBe(500);
    expect((payables.body.data as Array<Record<string, unknown>>).every((p) => p.kind === 'payable')).toBe(true);

    await request(app)
      .patch(`/api/v1/other-parties/${payeeId}`)
      .set(auth())
      .send({ isActive: false })
      .expect(200);
    const inactive = await postJournal([
      { accountCode: '5210', debit: 10, credit: 0 },
      { accountCode: '2117', debit: 0, credit: 10, entityId: payeeId },
    ]);
    expect(inactive.status).toBe(404);
  });

  it('lets standard chart accounts take a party list, except cheque clearing accounts', async () => {
    const seeded = await AccountModel.findOne({ code: '2210' }).lean().exec();
    expect(seeded?.isSystem).toBe(true);

    const loan = await patchAccount('2210', { partyType: 'other' });
    expect(loan.status).toBe(200);
    expect(loan.body.data.partyType).toBe('other');

    const lender = await request(app)
      .post('/api/v1/other-parties')
      .set(auth())
      .send({ name: 'Director Loan Account', kind: 'payable' })
      .expect(201);
    const journal = await postJournal([
      { accountCode: '5210', debit: 1000, credit: 0 },
      { accountCode: '2210', debit: 0, credit: 1000, entityId: lender.body.data.id },
    ]).expect(201);
    expect(
      (journal.body.data.lines as Array<Record<string, unknown>>).find(
        (row) => row.accountCode === '2210',
      )?.entityName,
    ).toBe('Director Loan Account');

    const untagged = await postJournal([
      { accountCode: '5210', debit: 20, credit: 0 },
      { accountCode: '2210', debit: 0, credit: 20 },
    ]);
    expect(untagged.status).toBe(201);

    const pdc = await patchAccount('2112', { partyType: 'supplier' });
    expect(pdc.status).toBe(400);
    expect(pdc.body.message).toMatch(/cheque clearing/);

    const cash = await patchAccount('1111', { partyType: 'other' });
    expect(cash.status).toBe(400);
  });

  it('lets a header such as 5220 Utility Bills be picked in journal, never a postable account', async () => {
    const on = await patchAccount('5220', { journalPicker: true });
    expect(on.status).toBe(200);
    expect(on.body.data.journalPicker).toBe(true);
    expect(on.body.data.isPostable).toBe(false);

    const leaf = await patchAccount('5221', { journalPicker: true });
    expect(leaf.status).toBe(400);
    expect(leaf.body.message).toMatch(/only a header/);

    const list = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
    const rows = list.body.data as Array<Record<string, unknown>>;
    expect(rows.find((row) => row.code === '5220')?.journalPicker).toBe(true);
    expect(rows.find((row) => row.code === '5221')?.journalPicker).toBe(false);

    const off = await patchAccount('5220', { journalPicker: false });
    expect(off.body.data.journalPicker).toBe(false);
  });
});
