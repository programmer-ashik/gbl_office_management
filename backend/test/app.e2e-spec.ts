import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';

jest.setTimeout(180000);

describe('Phase 1 foundation (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('connects to MongoDB and reports healthy', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.database.connected).toBe(true);
    expect(res.body.data.database.ping).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const res = await request(app).get('/api/v1/auth/me').expect(401);

    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(401);
  });

  it('creates the first user as Admin via signup', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Ashik',
        lastName: 'Hasan',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe(Role.ADMIN);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    adminToken = res.body.data.tokens.accessToken as string;
  });

  it('creates subsequent users as Employee', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'Rahim',
        lastName: 'Uddin',
      })
      .expect(201);

    expect(res.body.data.user.role).toBe(Role.EMPLOYEE);
    employeeToken = res.body.data.tokens.accessToken as string;
    employeeId = res.body.data.user.id as string;
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@gblenterprise.com',
        password: 'Admin123!',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('admin@gblenterprise.com');
    adminToken = res.body.data.tokens.accessToken as string;
  });

  it('returns the current user through auth middleware', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.email).toBe('admin@gblenterprise.com');
    expect(res.body.data.role).toBe(Role.ADMIN);
  });

  it('rotates refresh tokens', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'worker@gblenterprise.com',
        password: 'Worker123!',
      })
      .expect(201);

    const refreshToken = login.body.data.tokens.refreshToken as string;
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken);
  });

  it('enforces RBAC: employees cannot list users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(403);
  });

  it('allows Admin to list users and change roles', async () => {
    const list = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(list.body.data)).toBe(true);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);

    const updated = await request(app)
      .patch(`/api/v1/users/${employeeId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: Role.ACCOUNTANT })
      .expect(200);

    expect(updated.body.data.role).toBe(Role.ACCOUNTANT);
  });

  it('rejects duplicate signup', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Ashik',
        lastName: 'Hasan',
      })
      .expect(409);

    expect(res.body.success).toBe(false);
  });
});
