import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { Role } from '../src/common/enums/role.enum';
import { disconnectDatabase } from '../src/database/connection';
import { AccountModel } from '../src/modules/accounting/account.model';
import { AccountsService } from '../src/modules/accounting/accounts.service';
import { JournalEntryModel } from '../src/modules/accounting/journal-entry.model';
import { JournalService } from '../src/modules/accounting/journal.service';
import {
  applyUtilitySplit,
  planUtilitySplit,
  UTILITY_SUB_LEDGERS,
} from '../src/modules/accounting/utility-subledgers';
import { AuditService } from '../src/modules/governance/audit.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { UserModel } from '../src/modules/users/user.model';

jest.setTimeout(180000);

const ADMIN_EMAIL = 'eexp.admin@gblenterprise.com';

describe('Employee-tagged salary / conveyance and utility sub-ledgers (e2e)', () => {
  let app: Express;
  let adminToken: string;
  let projectId: string;
  let employeeId: string;
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  function post(lines: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
    return request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: '2026-09-10', memo: 'Employee expense test', intent: 'post', lines, ...extra });
  }

  async function accountId(code: string): Promise<string> {
    const row = await AccountModel.findOne({ code }).exec();
    return row!._id.toString();
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: ADMIN_EMAIL, password: 'Admin123!', firstName: 'EExp', lastName: 'Admin' })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send({
        name: 'Conveyance site',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 100000,
        totalBudget: 50000,
      })
      .expect(201);
    projectId = project.body.data.id as string;

    const employee = await request(app)
      .post('/api/v1/employees')
      .set(auth())
      .send({ firstName: 'Rahim', lastName: 'Uddin', designation: 'Site engineer' })
      .expect(201);
    employeeId = employee.body.data.id as string;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  describe('employee tagging', () => {
    it('flags salary and conveyance heads, and rejects non-expense or header accounts', async () => {
      const salary = await request(app)
        .patch(`/api/v1/accounts/${await accountId('5230')}`)
        .set(auth())
        .send({ employeeExpenseKind: 'salary' })
        .expect(200);
      expect(salary.body.data.employeeExpenseKind).toBe('salary');

      const conveyance = await request(app)
        .post('/api/v1/accounts')
        .set(auth())
        .send({
          code: '5141',
          name: 'Convence Transport Bill',
          type: 'expense',
          parentCode: '5100',
          employeeExpenseKind: 'conveyance',
        })
        .expect(201);
      expect(conveyance.body.data.employeeExpenseKind).toBe('conveyance');

      await request(app)
        .patch(`/api/v1/accounts/${await accountId('5200')}`)
        .set(auth())
        .send({ employeeExpenseKind: 'salary' })
        .expect(400);
      await request(app)
        .patch(`/api/v1/accounts/${await accountId('1111')}`)
        .set(auth())
        .send({ employeeExpenseKind: 'salary' })
        .expect(400);

      const other = await request(app).get('/api/v1/accounts').set(auth()).expect(200);
      const rent = (other.body.data as Array<{ code: string; employeeExpenseKind: string | null }>)
        .find((row) => row.code === '5210');
      expect(rent?.employeeExpenseKind).toBeNull();
    });

    it('stores the employee on salary and conveyance lines', async () => {
      const salary = await post([
        { accountCode: '5230', debit: 18000, entityType: 'employee', entityId: employeeId },
        { accountCode: '1111', credit: 18000 },
      ]).expect(201);
      expect(salary.body.data.lines[0]).toEqual(
        expect.objectContaining({ entityType: 'employee', entityId: employeeId }),
      );

      await post([
        { accountCode: '5141', debit: 700, entityType: 'employee', entityId: employeeId, projectId },
        { accountCode: '1111', credit: 700 },
      ]).expect(201);
    });

    it('infers the employee type and rejects other party types on flagged heads', async () => {
      await post([
        { accountCode: '5230', debit: 500, entityId: employeeId },
        { accountCode: '1111', credit: 500 },
      ]).expect(201);

      const wrong = await post([
        { accountCode: '5230', debit: 100, entityType: 'customer', entityId: employeeId },
        { accountCode: '1111', credit: 100 },
      ]).expect(400);
      expect(wrong.body.message ?? wrong.body.error?.message ?? '').toMatch(/employee/i);
    });

    it('keeps the tag optional, and conveyance under 5100 still needs a project', async () => {
      await post([
        { accountCode: '5230', debit: 50 },
        { accountCode: '1111', credit: 50 },
      ]).expect(201);
      await post([
        { accountCode: '5141', debit: 50, entityType: 'employee', entityId: employeeId },
        { accountCode: '1111', credit: 50 },
      ]).expect(400);
    });

    it('shows salary and conveyance drawn in the employee directory', async () => {
      const detail = await request(app)
        .get(`/api/v1/employees/${employeeId}`)
        .set(auth())
        .expect(200);
      expect(detail.body.data.expenses).toEqual(
        expect.objectContaining({ salary: 18500, conveyance: 700, total: 19200 }),
      );
      expect(detail.body.data.expenses.byAccount).toEqual([
        expect.objectContaining({ accountCode: '5141', kind: 'conveyance', amount: 700 }),
        expect.objectContaining({ accountCode: '5230', kind: 'salary', amount: 18500 }),
      ]);

      const list = await request(app).get('/api/v1/employees').set(auth()).expect(200);
      const row = (list.body.data as Array<{ id: string; expenses: { total: number } }>)
        .find((item) => item.id === employeeId);
      expect(row?.expenses.total).toBe(19200);
    });

    it('nets out reversed journals', async () => {
      const extra = await post([
        { accountCode: '5230', debit: 1000, entityType: 'employee', entityId: employeeId },
        { accountCode: '1111', credit: 1000 },
      ]).expect(201);
      await request(app)
        .post(`/api/v1/journals/${extra.body.data.id}/reverse`)
        .set(auth())
        .expect(201);
      const detail = await request(app)
        .get(`/api/v1/employees/${employeeId}`)
        .set(auth())
        .expect(200);
      expect(detail.body.data.expenses.salary).toBe(18500);
    });
  });

  describe('utility sub-ledger split', () => {
    const originalIds: string[] = [];

    async function netIncome(): Promise<number> {
      const res = await request(app).get('/api/v1/reports/balance-sheet').set(auth()).expect(200);
      return res.body.data.equity.netIncome as number;
    }

    function journalService() {
      return new JournalService(new AccountsService(), new ProjectsService(), new AuditService());
    }

    it('boot seed does not create sub-ledgers under a still-postable 5220', async () => {
      // Recreate the live shape: 5220 postable, no children.
      await AccountModel.deleteMany({
        code: { $in: UTILITY_SUB_LEDGERS.map((row) => row.code) },
      }).exec();
      await AccountModel.updateOne({ code: '5220' }, { $set: { isPostable: true } }).exec();

      await new AccountsService().seedFromChartOfAccountsJson({ forceUpdate: false });
      expect(await AccountModel.exists({ code: '5221' })).toBeNull();
      expect((await AccountModel.findOne({ code: '5220' }).exec())!.isPostable).toBe(true);
    });

    it('moves 5220 history to 5229 by reclassification and makes 5220 a header', async () => {
      const a = await post(
        [
          { accountCode: '5220', debit: 4000, description: 'DESCO' },
          { accountCode: '1111', credit: 4000 },
        ],
        { date: '2026-08-05' },
      ).expect(201);
      const b = await post(
        [
          { accountCode: '5220', debit: 1500, projectId, description: 'Site WASA' },
          { accountCode: '1111', credit: 1500 },
        ],
        { date: '2026-08-20' },
      ).expect(201);
      originalIds.push(a.body.data.id as string, b.body.data.id as string);
      const before = await netIncome();

      const plan = await planUtilitySplit();
      expect(plan.errors).toEqual([]);
      expect(plan.reclasses.map((row) => [row.date, row.amount])).toEqual([
        ['2026-08-05', 4000],
        ['2026-08-20', 1500],
      ]);

      const admin = await UserModel.findOne({ email: ADMIN_EMAIL }).exec();
      const result = await applyUtilitySplit(journalService(), admin!._id.toString());
      expect(result.postedReclasses).toHaveLength(2);
      expect(result.headerOwnBalanceAfter).toBe(0);

      const header = await AccountModel.findOne({ code: '5220' }).exec();
      expect(header!.isPostable).toBe(false);
      for (const row of UTILITY_SUB_LEDGERS) {
        const child = await AccountModel.findOne({ code: row.code }).exec();
        expect(child).toEqual(expect.objectContaining({ parentCode: '5220', isPostable: true }));
      }

      // Originals untouched.
      for (const id of originalIds) {
        const entry = await JournalEntryModel.findById(id).exec();
        expect(entry!.status).toBe('posted');
        expect(entry!.lines.some((line) => line.accountCode === '5220')).toBe(true);
      }

      const reclasses = await JournalEntryModel.find({ reference: /^RCL-5220-/ }).exec();
      expect(reclasses.map((row) => row.date.toISOString().slice(0, 10)).sort()).toEqual([
        '2026-08-05',
        '2026-08-20',
      ]);
      expect(reclasses.every((row) => row.source === 'system')).toBe(true);
      const withProject = reclasses.find((row) => row.lines.some((line) => line.projectId));
      expect(withProject?.lines.every((line) => line.projectId?.toString() === projectId)).toBe(true);

      expect(await netIncome()).toBe(before);
      const tb = await request(app).get('/api/v1/reports/trial-balance').set(auth()).expect(200);
      expect(tb.body.data.isBalanced).toBe(true);
    });

    it('blocks new postings to the 5220 header and accepts sub-ledgers', async () => {
      const blocked = await post([
        { accountCode: '5220', debit: 100 },
        { accountCode: '1111', credit: 100 },
      ]).expect(400);
      expect(JSON.stringify(blocked.body)).toMatch(/Header account/);

      await post([
        { accountCode: '5221', debit: 100 },
        { accountCode: '1111', credit: 100 },
      ]).expect(201);
    });

    it('is safe to re-run', async () => {
      const plan = await planUtilitySplit();
      expect(plan.alreadyDone).toBe(true);
      const admin = await UserModel.findOne({ email: ADMIN_EMAIL }).exec();
      const again = await applyUtilitySplit(journalService(), admin!._id.toString());
      expect(again.postedReclasses).toHaveLength(0);
      expect(await JournalEntryModel.countDocuments({ reference: /^RCL-5220-/ })).toBe(2);
    });
  });

  describe('split any account into sub-accounts (API)', () => {
    let accountantToken: string;

    beforeAll(async () => {
      const signup = await request(app)
        .post('/api/v1/auth/signup')
        .send({
          email: 'eexp.accountant@gblenterprise.com',
          password: 'Acct123!',
          firstName: 'EExp',
          lastName: 'Accountant',
        })
        .expect(201);
      await request(app)
        .patch(`/api/v1/users/${signup.body.data.user.id}/role`)
        .set(auth())
        .send({ role: Role.ACCOUNTANT })
        .expect(200);
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'eexp.accountant@gblenterprise.com', password: 'Acct123!' })
        .expect(201);
      accountantToken = login.body.data.tokens.accessToken as string;
    });

    const conveyanceSplit = {
      children: [
        { code: '5141-01', name: 'Site conveyance' },
        { code: '5141-02', name: 'Office conveyance' },
      ],
      historyTo: '5141-01',
    };

    it('previews the split, and asks where existing history goes', async () => {
      const id = await accountId('5141');
      const missing = await request(app)
        .post(`/api/v1/accounts/${id}/split/preview`)
        .set({ Authorization: `Bearer ${accountantToken}` })
        .send({ children: conveyanceSplit.children })
        .expect(200);
      expect(missing.body.data.errors.join(' ')).toMatch(/receives the existing balance/);

      const preview = await request(app)
        .post(`/api/v1/accounts/${id}/split/preview`)
        .set({ Authorization: `Bearer ${accountantToken}` })
        .send(conveyanceSplit)
        .expect(200);
      expect(preview.body.data.errors).toEqual([]);
      expect(preview.body.data.totalToMove).toBe(700);
      expect(preview.body.data.reclasses).toEqual([
        expect.objectContaining({ amount: 700, projectId, employeeId }),
      ]);
    });

    it('only lets an Admin apply the split', async () => {
      await request(app)
        .post(`/api/v1/accounts/${await accountId('5141')}/split`)
        .set({ Authorization: `Bearer ${accountantToken}` })
        .send(conveyanceSplit)
        .expect(403);
      expect((await AccountModel.findOne({ code: '5141' }).exec())!.isPostable).toBe(true);
    });

    it('splits a tagged head, keeping project, employee and report totals', async () => {
      const before = await request(app).get('/api/v1/reports/balance-sheet').set(auth()).expect(200);

      const res = await request(app)
        .post(`/api/v1/accounts/${await accountId('5141')}/split`)
        .set(auth())
        .send(conveyanceSplit)
        .expect(200);
      expect(res.body.data.postedReclasses).toHaveLength(1);
      expect(res.body.data.headerOwnBalanceAfter).toBe(0);

      const header = await AccountModel.findOne({ code: '5141' }).exec();
      expect(header!.isPostable).toBe(false);
      expect(header!.employeeExpenseKind).toBeUndefined();
      for (const child of conveyanceSplit.children) {
        const row = await AccountModel.findOne({ code: child.code }).exec();
        expect(row).toEqual(
          expect.objectContaining({
            parentCode: '5141',
            isPostable: true,
            type: 'expense',
            employeeExpenseKind: 'conveyance',
          }),
        );
      }

      const after = await request(app).get('/api/v1/reports/balance-sheet').set(auth()).expect(200);
      expect(after.body.data.equity.netIncome).toBe(before.body.data.equity.netIncome);

      const detail = await request(app)
        .get(`/api/v1/employees/${employeeId}`)
        .set(auth())
        .expect(200);
      expect(detail.body.data.expenses.conveyance).toBe(700);
      expect(detail.body.data.expenses.byAccount).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ accountCode: '5141-01', kind: 'conveyance', amount: 700 }),
        ]),
      );

      await post([
        { accountCode: '5141', debit: 10, projectId },
        { accountCode: '1111', credit: 10 },
      ]).expect(400);
      await post([
        { accountCode: '5141-02', debit: 10, projectId, entityId: employeeId },
        { accountCode: '1111', credit: 10 },
      ]).expect(201);
    });

    it('splits an account with no postings straight into a header', async () => {
      const created = await request(app)
        .post('/api/v1/accounts')
        .set(auth())
        .send({ code: '5260', name: 'Office Maintenance', type: 'expense', parentCode: '5200' })
        .expect(201);
      const res = await request(app)
        .post(`/api/v1/accounts/${created.body.data.id}/split`)
        .set(auth())
        .send({ children: [{ code: '5261', name: 'AC servicing' }] })
        .expect(200);
      expect(res.body.data.postedReclasses).toHaveLength(0);
      expect((await AccountModel.findOne({ code: '5261' }).exec())!.parentCode).toBe('5260');
    });

    it('refuses system, control and duplicate-code splits', async () => {
      const cash = await request(app)
        .post(`/api/v1/accounts/${await accountId('1111')}/split/preview`)
        .set(auth())
        .send({ children: [{ code: '1111-01', name: 'Petty cash' }], historyTo: '1111-01' })
        .expect(200);
      expect(cash.body.data.errors.length).toBeGreaterThan(0);
      await request(app)
        .post(`/api/v1/accounts/${await accountId('1111')}/split`)
        .set(auth())
        .send({ children: [{ code: '1111-01', name: 'Petty cash' }], historyTo: '1111-01' })
        .expect(400);

      const dup = await request(app)
        .post(`/api/v1/accounts/${await accountId('5210')}/split/preview`)
        .set(auth())
        .send({ children: [{ code: '5221', name: 'Rent A' }] })
        .expect(200);
      expect(dup.body.data.errors.join(' ')).toMatch(/already used/);
    });
  });
});
