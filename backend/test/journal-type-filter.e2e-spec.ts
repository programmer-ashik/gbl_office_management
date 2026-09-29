import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { disconnectDatabase } from '../src/database/connection';
import { AccountModel } from '../src/modules/accounting/account.model';
import { JOURNAL_TYPE_VALUES } from '../src/modules/accounting/journal.enums';
import { JournalEntryModel } from '../src/modules/accounting/journal-entry.model';

jest.setTimeout(180000);

type Journal = {
  entryNumber: string;
  journalType: string;
  source: string;
  typeTags: string[];
  memo: string;
};

describe('Journal type filter (e2e)', () => {
  let app: Express;
  let adminToken: string;
  /** entryNumber → every Type filter the journal must appear under. */
  const expected = new Map<string, string[]>();
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function manual(body: Record<string, unknown>, tags: string[]) {
    const res = await request(app)
      .post('/api/v1/journals')
      .set(auth())
      .send({ date: '2026-09-10', intent: 'post', ...body })
      .expect(201);
    expected.set(res.body.data.entryNumber as string, tags);
  }

  let seq = 900;
  async function system(
    memo: string,
    reference: string | undefined,
    pairs: Array<[string, number, number]>,
    tags: string[],
    extra: Record<string, unknown> = {},
  ) {
    const lines = [];
    for (const [code, debit, credit] of pairs) {
      const account = await AccountModel.findOne({ code }).lean();
      lines.push({
        accountId: account!._id,
        accountCode: code,
        accountName: account!.name,
        debitMinor: debit * 100,
        creditMinor: credit * 100,
      });
    }
    const total = lines.reduce((sum, line) => sum + line.debitMinor, 0);
    const entryNumber = `JE-2026-${String(++seq).padStart(5, '0')}`;
    const doc = await JournalEntryModel.create({
      entryNumber,
      date: new Date('2026-09-15'),
      memo,
      reference,
      status: 'posted',
      source: 'system',
      lines,
      totalDebitMinor: total,
      totalCreditMinor: total,
      ...extra,
    });
    expected.set(entryNumber, tags);
    return doc;
  }

  beforeAll(async () => {
    app = await createApp();
    const admin = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'jt.admin@gblenterprise.com',
        password: 'Admin123!',
        firstName: 'JT',
        lastName: 'Admin',
      })
      .expect(201);
    adminToken = admin.body.data.tokens.accessToken as string;

    const employee = await request(app)
      .post('/api/v1/auth/signup')
      .send({
        email: 'jt.worker@gblenterprise.com',
        password: 'Worker123!',
        firstName: 'JT',
        lastName: 'Worker',
      })
      .expect(201);
    const employeeToken = employee.body.data.tokens.accessToken as string;
    const employeeId = employee.body.data.user.id as string;

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth())
      .send({
        name: 'Type filter site',
        client: { name: 'GBL Properties' },
        startDate: '2026-09-01',
        contractValue: 100000,
        totalBudget: 50000,
      })
      .expect(201);
    const projectId = project.body.data.id as string;

    const treasury = await request(app).get('/api/v1/treasury').set(auth()).expect(200);
    const cashId = (
      treasury.body.data as Array<{ id: string; glAccountCode: string }>
    ).find((row) => row.glAccountCode === '1111')!.id;

    const expenseLines = [
      { accountCode: '5240', debit: 100, description: 'Office tea' },
      { accountCode: '1111', credit: 100 },
    ];
    await manual(
      {
        memo: 'Owner cash',
        lines: [
          { accountCode: '1111', debit: 500000 },
          { accountCode: '3100', credit: 500000 },
        ],
      },
      ['general', 'cash_receipt'],
    );
    // Same shape as JE-2026-00008: staff advance + utility + rent paid in cash.
    await manual(
      {
        memo: 'gbl-260929-Advancet-UtilityB',
        projectId,
        lines: [
          {
            accountCode: '1161',
            debit: 10000,
            entityType: 'employee',
            entityId: employeeId,
            description: 'Staff advance',
          },
          { accountCode: '5220', debit: 5000, description: 'Utility' },
          { accountCode: '5210', debit: 6000, description: 'Rent' },
          { accountCode: '1111', credit: 21000 },
        ],
      },
      ['general', 'employee_advance', 'expense', 'cash_payment'],
    );
    for (const type of JOURNAL_TYPE_VALUES) {
      const exclusive = type === 'opening_balance' || type === 'year_end_closing';
      await manual(
        { memo: `Explicit ${type}`, journalType: type, lines: expenseLines },
        exclusive ? [type] : [type, 'expense', 'cash_payment'],
      );
    }

    // Real advance module: disbursement is posted as a general system journal.
    const created = await request(app)
      .post('/api/v1/advances')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ projectId, amount: 5000, purpose: 'Site float' })
      .expect(201);
    const advanceId = created.body.data.id as string;
    await request(app).post(`/api/v1/advances/${advanceId}/approve`).set(auth()).expect(200);
    const paid = await request(app)
      .post(`/api/v1/advances/${advanceId}/disburse`)
      .set(auth())
      .send({ treasuryId: cashId, date: '2026-09-11' })
      .expect(201);
    expected.set(paid.body.data.disbursementJournalNumber as string, [
      'employee_advance',
      'cash_payment',
    ]);

    // System journals as each module writes them.
    await system('Site work invoice', 'INV-2026-00077', [['1151', 1000, 0], ['4110', 0, 1000]], ['sales', 'project_revenue']);
    await system('Collection for INV-2026-00077', 'RC-2026-00077', [['1111', 1000, 0], ['1151', 0, 1000]], ['customer_receipt', 'cash_receipt']);
    await system('Cement credit bill', 'BILL-2026-00077', [['5240', 500, 0], ['2111', 0, 500]], ['purchase', 'expense']);
    await system('Payment to Legacy Cement', 'PAY-2026-00077', [['2111', 500, 0], ['1111', 0, 500]], ['supplier_payment', 'cash_payment']);
    await system('Payroll accrual PAY-2026-00078 · 2026-09', 'PAY-2026-00078', [['5230', 900, 0], ['2121', 0, 900]], ['payroll_adjustment', 'expense']);
    await system('Salary advance SAD-2026-00001', 'SAD-2026-00001', [['1161', 300, 0], ['1111', 0, 300]], ['employee_advance', 'cash_payment']);
    await system('GRN for PO-2026-00001', 'PO-2026-00001', [['1141', 800, 0], ['2111', 0, 800]], ['purchase']);
    await system('Issue stock to PRJ-1', 'PRJ-1', [['5110', 200, 0], ['1141', 0, 200]], ['project_cost']);
    await system('Cash to BRAC', 'TRF-2026-00001', [['1122', 1000, 0], ['1111', 0, 1000]], ['internal_transfer']);
    await system('Bank charge · REC-2026-00001', 'REC-2026-00001', [['5250', 20, 0], ['1122', 0, 20]], ['other_expense', 'expense', 'bank_withdrawal']);
    await system('Bank interest · REC-2026-00001', 'REC-2026-00001', [['1122', 15, 0], ['4200', 0, 15]], ['other_income', 'bank_deposit']);
    const advance = await system('Advance ADV-2026-00099 disbursed', 'ADV-2026-00099', [['1161', 400, 0], ['1111', 0, 400]], ['employee_advance', 'cash_payment']);
    await system(`Reversal of ${advance.entryNumber}`, 'ADV-2026-00099', [['1111', 400, 0], ['1161', 0, 400]], ['employee_advance', 'cash_payment'], { reversesEntryId: advance._id });
    await system('Project revenue accrual', undefined, [['1142', 90, 0], ['4110', 0, 90]], ['project_revenue']);
    await system('Opening balance for account 1161', undefined, [['1161', 90, 0], ['3100', 0, 90]], ['opening_balance'], { journalType: 'opening_balance' });
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it.each(JOURNAL_TYPE_VALUES.map((type) => [type]))(
    'filter "%s" returns every journal carrying that type',
    async (type) => {
      const res = await request(app)
        .get('/api/v1/journals')
        .query({ journalType: type })
        .set(auth())
        .expect(200);
      const rows = res.body.data as Journal[];
      const got = rows
        .filter((row) => expected.has(row.entryNumber))
        .map((row) => row.entryNumber)
        .sort();
      const want = [...expected]
        .filter(([, tags]) => tags.includes(type))
        .map(([entryNumber]) => entryNumber)
        .sort();
      expect(want.length).toBeGreaterThan(0);
      expect(got).toEqual(want);
      for (const row of rows) {
        if (type === 'general') {
          expect(row.journalType).toBe('general');
          expect(row.source !== 'system' || row.typeTags.length === 0).toBe(true);
        } else {
          expect(row.typeTags).toContain(type);
        }
      }

      const summary = await request(app)
        .get('/api/v1/journals/summary')
        .query({ journalType: type })
        .set(auth())
        .expect(200);
      expect(summary.body.data.total).toBe(rows.length);
    },
  );
});
