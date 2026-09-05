import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 9 RBAC, approvals, OCR and audit (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let accountantToken: string;
  let pmToken: string;
  let pmId: string;
  let otherPmToken: string;
  let employeeToken: string;
  let assignedProjectId: string;
  let otherProjectId: string;
  let approvalId: string;

  beforeAll(async () => {
    app = await createApp();

    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'gov.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Gov',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const accountant = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'gov.accountant@gblenterprise.com',
        password: 'Acct123!',
        firstName: 'Gov',
        lastName: 'Accountant',
      })
      .expect(201);
    const accountantId = accountant.body.data.user.id as string;
    await request(app)
      .patch(`/api/v1/users/${accountantId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.ACCOUNTANT })
      .expect(200);
    const accountantLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'gov.accountant@gblenterprise.com',
        password: 'Acct123!',
      })
      .expect(201);
    accountantToken = accountantLogin.body.data.tokens.accessToken as string;

    const pm = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'gov.pm@gblenterprise.com',
        password: 'Pm123456!',
        firstName: 'Assigned',
        lastName: 'Manager',
      })
      .expect(201);
    pmId = pm.body.data.user.id as string;
    await request(app)
      .patch(`/api/v1/users/${pmId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.PROJECT_MANAGER })
      .expect(200);
    const pmLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'gov.pm@gblenterprise.com', password: 'Pm123456!' })
      .expect(201);
    pmToken = pmLogin.body.data.tokens.accessToken as string;

    const otherPm = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'gov.otherpm@gblenterprise.com',
        password: 'Pm123456!',
        firstName: 'Other',
        lastName: 'Manager',
      })
      .expect(201);
    const otherPmId = otherPm.body.data.user.id as string;
    await request(app)
      .patch(`/api/v1/users/${otherPmId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.PROJECT_MANAGER })
      .expect(200);
    const otherPmLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'gov.otherpm@gblenterprise.com', password: 'Pm123456!' })
      .expect(201);
    otherPmToken = otherPmLogin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'gov.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Site',
        lastName: 'Worker',
      })
      .expect(201);
    employeeToken = employee.body.data.tokens.accessToken as string;

    const assigned = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'PM scoped site',
        client: { name: 'Client A' },
        startDate: '2026-09-01',
        contractValue: 500_000,
        totalBudget: 200_000,
        managerId: pmId,
      })
      .expect(201);
    assignedProjectId = assigned.body.data.id as string;

    const other = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Other manager site',
        client: { name: 'Client B' },
        startDate: '2026-09-01',
        contractValue: 300_000,
        totalBudget: 100_000,
        managerId: otherPmId,
      })
      .expect(201);
    otherProjectId = other.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('restricts project managers to assigned projects only', async () => {
    const listed = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${pmToken}`)
      .expect(200);
    const ids = (listed.body.data as Array<{ id: string }>).map((row) => row.id);
    expect(ids).toContain(assignedProjectId);
    expect(ids).not.toContain(otherProjectId);

    await request(app)
      .get(`/api/v1/projects/${otherProjectId}`)
      .set('Authorization', `Bearer ${pmToken}`)
      .expect(403);

    await request(app)
      .get('/api/v1/journals')
      .set('Authorization', `Bearer ${pmToken}`)
      .expect(403);
  });

  it('queues large journals for PM → accountant → admin approval', async () => {
    const queued = await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        date: '2026-09-10',
        memo: 'Large equity injection',
        projectId: assignedProjectId,
        lines: [
          { accountCode: '1112', debit: 150_000 },
          { accountCode: '3100', credit: 150_000 },
        ],
      })
      .expect(202);

    expect(queued.body.data.requiresApproval).toBe(true);
    approvalId = queued.body.data.approval.id as string;
    expect(queued.body.data.approval.steps).toHaveLength(3);

    await request(app)
      .post(`/api/v1/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${pmToken}`)
      .send({ note: 'PM OK' })
      .expect(200);

    await request(app)
      .post(`/api/v1/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({ note: 'Accounts OK' })
      .expect(200);

    const fully = await request(app)
      .post(`/api/v1/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'MD OK' })
      .expect(200);
    expect(fully.body.data.status).toBe('approved');

    const posted = await request(app)
      .post('/api/v1/journals')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        date: '2026-09-10',
        memo: 'Large equity injection',
        projectId: assignedProjectId,
        approvalId,
        lines: [
          { accountCode: '1112', debit: 150_000 },
          { accountCode: '3100', credit: 150_000 },
        ],
      })
      .expect(201);
    expect(posted.body.data.entryNumber).toMatch(/^JE-/);
  });

  it('records immutable audit logs for ledger posts', async () => {
    const audit = await request(app)
      .get('/api/v1/audit?entityType=journal_entry')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect((audit.body.data as unknown[]).length).toBeGreaterThan(0);

    await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  it('mock OCR fills settlement voucher fields', async () => {
    const scan = await request(app)
      .post('/api/v1/ocr/receipt')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ textHint: 'Travel taxi fare vendor: Rapid Cab 975.25' })
      .expect(200);

    expect(scan.body.data.mock).toBe(true);
    expect(scan.body.data.lines[0].accountCode).toBe('5300');
    expect(scan.body.data.lines[0].amount).toBe(975.25);
  });
});
