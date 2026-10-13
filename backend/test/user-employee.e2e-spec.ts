import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';
import { EmployeeModel } from '../src/modules/employees/employee.model';
import { backfillEmployeesFromUsers } from '../src/modules/employees/employee-records';
import { UserModel } from '../src/modules/users/user.model';

jest.setTimeout(180000);

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  salary: number | null;
  joinDate: string | null;
  isActive: boolean;
  userId: string | null;
  hasAccount: boolean;
  account: { id: string; email: string; role: Role; isActive: boolean } | null;
};

describe('Decoupled User / Employee (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let projectId: string;
  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string, password: string) {
    return request(app).post('/api/v1/auth/login').send({ email, password });
  }

  async function employees(): Promise<Employee[]> {
    const res = await request(app).get('/api/v1/employees').set(auth()).expect(200);
    return res.body.data as Employee[];
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'split.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'Split',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send({
        name: 'Split test site',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 100000,
        totalBudget: 50000,
      })
      .expect(201);
    projectId = project.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('creates a pure User (no employee) via /settings/users', async () => {
    const employeesBefore = await EmployeeModel.countDocuments().exec();
    const res = await request(app)
      .post('/api/v1/settings/users')
      .set(auth())
      .send({
        email: 'external.admin@partner.test',
        password: 'Partner123!',
        firstName: 'External',
        lastName: 'Admin',
        role: Role.ADMIN,
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      email: 'external.admin@partner.test',
      role: Role.ADMIN,
      employeeId: null,
    });
    expect(await EmployeeModel.countDocuments().exec()).toBe(employeesBefore);
    expect((await employees()).some((row) => row.email === 'external.admin@partner.test')).toBe(
      false,
    );
    const session = await login('external.admin@partner.test', 'Partner123!');
    expect(session.status).toBe(201);
    expect(session.body.data.user.employeeId).toBeNull();

    // Same route under /users.
    await request(app)
      .post('/api/v1/users')
      .set(auth())
      .send({
        email: 'auditor@partner.test',
        password: 'Partner123!',
        firstName: 'Ext',
        lastName: 'Auditor',
      })
      .expect(201);
  });

  it('creates a pure Employee with no software access', async () => {
    const usersBefore = await UserModel.countDocuments().exec();
    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({
        firstName: 'Karim',
        lastName: 'Mason',
        phone: '01700000001',
        designation: 'Site mason',
        salary: 18000,
        joinDate: '2026-01-15',
      })
      .expect(201);
    const row = res.body.data as Employee;
    expect(row).toMatchObject({
      firstName: 'Karim',
      phone: '01700000001',
      designation: 'Site mason',
      salary: 18000,
      joinDate: '2026-01-15',
      isActive: true,
      userId: null,
      hasAccount: false,
      account: null,
    });
    expect(await UserModel.countDocuments().exec()).toBe(usersBefore);

    const payroll = await request(app).get('/api/v1/payroll/employees').set(auth()).expect(200);
    expect(
      (payroll.body.data as Array<{ id: string; role: string | null }>).find(
        (item) => item.id === row.id,
      ),
    ).toMatchObject({ role: null });
  });

  it('creates an Employee WITH access in one transaction (both records, linked)', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({
        firstName: 'Rina',
        lastName: 'Akter',
        designation: 'Accounts officer',
        createAccount: true,
        email: 'rina@gblenterprise.com',
        password: 'Rina1234!',
        role: Role.ACCOUNTANT,
      })
      .expect(201);
    const row = res.body.data as Employee;
    expect(row.hasAccount).toBe(true);
    expect(row.account).toMatchObject({
      email: 'rina@gblenterprise.com',
      role: Role.ACCOUNTANT,
      isActive: true,
    });

    const user = await UserModel.findOne({ email: 'rina@gblenterprise.com' }).exec();
    expect(user).toBeTruthy();
    expect(row.userId).toBe(user!._id.toString());
    const stored = await EmployeeModel.findById(row.id).exec();
    expect(String(stored!.userId)).toBe(user!._id.toString());

    const session = await login('rina@gblenterprise.com', 'Rina1234!');
    expect(session.status).toBe(201);
    expect(session.body.data.user.employeeId).toBe(row.id);

    const users = await request(app).get('/api/v1/users').set(auth()).expect(200);
    expect(
      (users.body.data as Array<{ email: string; employeeId: string | null }>).find(
        (item) => item.email === 'rina@gblenterprise.com',
      )!.employeeId,
    ).toBe(row.id);
  });

  it('rolls back when the login cannot be created, and validates account fields', async () => {
    const employeesBefore = await EmployeeModel.countDocuments().exec();
    await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({
        firstName: 'Dup',
        lastName: 'Email',
        createAccount: true,
        email: 'rina@gblenterprise.com',
        password: 'Dup12345!',
      })
      .expect(409);
    await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({ firstName: 'No', lastName: 'Password', createAccount: true, email: 'np@x.test' })
      .expect(400);
    expect(await EmployeeModel.countDocuments().exec()).toBe(employeesBefore);
  });

  it('keeps the legacy POST /employees body (email + default_password) creating a login', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({
        email: 'legacy.body@gblenterprise.com',
        default_password: 'Legacy123!',
        firstName: 'Legacy',
        lastName: 'Body',
        role: Role.EMPLOYEE,
      })
      .expect(201);
    expect(res.body.data.hasAccount).toBe(true);
    expect((await login('legacy.body@gblenterprise.com', 'Legacy123!')).status).toBe(201);
  });

  it('grants access to an existing employee, who can then use self-service', async () => {
    const created = await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({ firstName: 'Salam', lastName: 'Driver', designation: 'Driver' })
      .expect(201);
    const employeeId = created.body.data.id as string;

    const granted = await request(app)
      .post(`/api/v1/employees/${employeeId}/grant-access`)
      .set(auth())
      .send({ email: 'salam@gblenterprise.com', password: 'Salam1234!', role: Role.EMPLOYEE })
      .expect(201);
    const row = granted.body.data as Employee;
    expect(row.id).toBe(employeeId);
    expect(row.hasAccount).toBe(true);
    expect(row.designation).toBe('Driver');
    expect(row.userId).not.toBe(employeeId);

    await request(app)
      .post(`/api/v1/employees/${employeeId}/grant-access`)
      .set(auth())
      .send({ email: 'salam2@gblenterprise.com', password: 'Salam1234!' })
      .expect(409);

    const session = await login('salam@gblenterprise.com', 'Salam1234!');
    expect(session.status).toBe(201);
    const token = session.body.data.tokens.accessToken as string;

    const advance = await request(app)
      .post('/api/v1/advances')
      .set(auth(token))
      .send({ projectId, amount: 500, purpose: 'Fuel for site trips' })
      .expect(201);
    expect(advance.body.data.employeeId).toBe(employeeId);

    const mine = await request(app).get('/api/v1/advances').set(auth(token)).expect(200);
    expect(
      (mine.body.data.items as Array<{ id: string }>).some(
        (item) => item.id === advance.body.data.id,
      ),
    ).toBe(true);
    await request(app)
      .get(`/api/v1/employees/${employeeId}/ledger`)
      .set(auth(token))
      .expect(200);
  });

  it('deactivating or deleting a User leaves the Employee intact', async () => {
    const created = await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({
        firstName: 'Nadia',
        lastName: 'Engineer',
        phone: '01800000002',
        designation: 'Site engineer',
        salary: 45000,
        joinDate: '2025-06-01',
        createAccount: true,
        email: 'nadia@gblenterprise.com',
        password: 'Nadia1234!',
        role: Role.PROJECT_MANAGER,
      })
      .expect(201);
    const employee = created.body.data as Employee;
    const userId = employee.userId!;

    await request(app)
      .patch(`/api/v1/users/${userId}/status`)
      .set(auth())
      .send({ isActive: false })
      .expect(200);
    expect((await login('nadia@gblenterprise.com', 'Nadia1234!')).status).toBe(401);
    const afterDeactivate = (await employees()).find((row) => row.id === employee.id)!;
    expect(afterDeactivate).toMatchObject({
      isActive: true,
      userId,
      designation: 'Site engineer',
      salary: 45000,
    });
    expect(afterDeactivate.account).toMatchObject({ isActive: false });

    const deleted = await request(app)
      .delete(`/api/v1/users/${userId}`)
      .set(auth())
      .expect(200);
    expect(deleted.body.data.unlinkedEmployeeId).toBe(employee.id);
    expect(await UserModel.findById(userId).exec()).toBeNull();

    const afterDelete = await request(app)
      .get(`/api/v1/employees/${employee.id}`)
      .set(auth())
      .expect(200);
    expect(afterDelete.body.data).toMatchObject({
      id: employee.id,
      firstName: 'Nadia',
      phone: '01800000002',
      designation: 'Site engineer',
      salary: 45000,
      joinDate: '2025-06-01',
      isActive: true,
      userId: null,
      hasAccount: false,
    });

    // A direct model delete also sets userId to null (ON DELETE SET NULL).
    const regrant = await request(app)
      .post(`/api/v1/employees/${employee.id}/grant-access`)
      .set(auth())
      .send({ email: 'nadia.new@gblenterprise.com', password: 'Nadia1234!' })
      .expect(201);
    await UserModel.findOneAndDelete({ _id: regrant.body.data.userId }).exec();
    const raw = await EmployeeModel.findById(employee.id).exec();
    expect(raw).toBeTruthy();
    expect(raw!.userId).toBeNull();
  });

  it('refuses to delete your own account', async () => {
    const me = await request(app).get('/api/v1/auth/me').set(auth()).expect(200);
    await request(app).delete(`/api/v1/users/${me.body.data.id}`).set(auth()).expect(400);
  });

  it('migration links pre-split staff users to same-_id employees, copying status', async () => {
    const active = await request(app)
      .post('/api/v1/users')
      .set(auth())
      .send({
        email: 'pre.split.active@gblenterprise.com',
        password: 'PreSplit123!',
        firstName: 'Pre',
        lastName: 'Active',
        role: Role.PROJECT_MANAGER,
      })
      .expect(201);
    const disabled = await request(app)
      .post('/api/v1/users')
      .set(auth())
      .send({
        email: 'pre.split.disabled@gblenterprise.com',
        password: 'PreSplit123!',
        firstName: 'Pre',
        lastName: 'Disabled',
        role: Role.EMPLOYEE,
      })
      .expect(201);
    await request(app)
      .patch(`/api/v1/users/${disabled.body.data.id}/status`)
      .set(auth())
      .send({ isActive: false })
      .expect(200);
    const outsider = await request(app)
      .post('/api/v1/users')
      .set(auth())
      .send({
        email: 'pre.split.admin@partner.test',
        password: 'PreSplit123!',
        firstName: 'Pre',
        lastName: 'Admin',
        role: Role.ADMIN,
      })
      .expect(201);

    expect(await backfillEmployeesFromUsers()).toBeGreaterThan(0);
    expect(await backfillEmployeesFromUsers()).toBe(0);

    const activeRow = await EmployeeModel.findById(active.body.data.id).exec();
    expect(String(activeRow!.userId)).toBe(active.body.data.id);
    expect(activeRow!.isActive).toBe(true);
    const disabledRow = await EmployeeModel.findById(disabled.body.data.id).exec();
    expect(disabledRow!.isActive).toBe(false);
    expect(await EmployeeModel.findById(outsider.body.data.id).exec()).toBeNull();
  });

  it('still accepts pre-split user ids as employee ids (same _id employee)', async () => {
    const legacy = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'legacy.staff@gblenterprise.com',
        password: 'Legacy123!',
        firstName: 'Legacy',
        lastName: 'Staff',
      })
      .expect(201);
    const legacyUserId = legacy.body.data.user.id as string;
    const legacyToken = legacy.body.data.tokens.accessToken as string;
    expect(await EmployeeModel.findById(legacyUserId).exec()).toBeNull();

    const advance = await request(app)
      .post('/api/v1/advances')
      .set(auth(legacyToken))
      .send({ projectId, amount: 250, purpose: 'Legacy self request' })
      .expect(201);
    expect(advance.body.data.employeeId).toBe(legacyUserId);

    const provisioned = await EmployeeModel.findById(legacyUserId).exec();
    expect(provisioned).toBeTruthy();
    expect(String(provisioned!.userId)).toBe(legacyUserId);
    await request(app)
      .get(`/api/v1/employees/${legacyUserId}/ledger`)
      .set(auth(legacyToken))
      .expect(200);
  });
});
