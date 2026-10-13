import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Heads under 5100 Direct Project Cost require a project (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let projectId: string;
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  function journal(accountCode: string, extra: Record<string, unknown> = {}, intent = 'post') {
    return request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({
        date: '2026-09-15',
        memo: `Project cost ${accountCode}`,
        intent,
        lines: [
          { accountCode, debit: 250, ...extra },
          { accountCode: '1111', credit: 250 },
        ],
      });
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'pch.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'PCH',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send({
        name: 'Project cost site',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 100000,
        totalBudget: 50000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({ code: '5150', name: 'Purchase Project', type: 'expense', parentCode: '5100' })
      .expect(201);
    await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({
        code: '5160',
        name: 'Subcontract Works',
        type: 'expense',
        parentCode: '5100',
        isPostable: false,
      })
      .expect(201);
    await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({ code: '5161', name: 'Civil Subcontract', type: 'expense', parentCode: '5160' })
      .expect(201);
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('rejects a new direct child of 5100 without a project, accepts it with one', async () => {
    const missing = await journal('5150').expect(400);
    expect(missing.body.message).toMatch(/Purchase Project \(5150\) requires a project/);
    const ok = await journal('5150', { projectId }).expect(201);
    expect(ok.body.data.status).toBe('posted');
  });

  it('applies to heads nested deeper under 5100', async () => {
    const missing = await journal('5161').expect(400);
    expect(missing.body.message).toMatch(/Civil Subcontract \(5161\) requires a project/);
    await journal('5161', { projectId }).expect(201);
  });

  it('applies to drafts and to the built-in 5110 head', async () => {
    await journal('5150', {}, 'draft').expect(400);
    await journal('5110').expect(400);
    await journal('5110', { projectId }).expect(201);
  });

  it('leaves heads outside 5100 unchanged', async () => {
    await journal('5240').expect(201);
  });

  it('still allows an opening balance on a new 5100 head without a project', async () => {
    await request(app)
      .post('/api/v1/accounts')
      .set(auth())
      .send({
        code: '5170',
        name: 'Site Consumables',
        type: 'expense',
        parentCode: '5100',
        openingBalance: 500,
      })
      .expect(201);
  });
});
