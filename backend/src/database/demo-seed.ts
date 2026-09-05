import { Role } from '../common/enums/role.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { hashPassword } from '../common/utils/crypto.util';
import { toMinorUnits } from '../common/utils/money';
import { CounterModel } from '../modules/accounting/counter.model';
import type { JournalService } from '../modules/accounting/journal.service';
import type { BankingService } from '../modules/banking/banking.service';
import { CustomerModel } from '../modules/customers/customer.model';
import { ItemModel } from '../modules/procurement/item.model';
import { SupplierModel } from '../modules/procurement/supplier.model';
import { ProjectModel } from '../modules/projects/project.model';
import { UserModel } from '../modules/users/user.model';
import type { UsersService } from '../modules/users/users.service';

type SeedDeps = {
  usersService: UsersService;
  bankingService: BankingService;
  journalService: JournalService;
};

const DEMO_USERS: Array<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
}> = [
  {
    email: 'accountant@gblenterprise.com',
    password: 'Acct123!',
    firstName: 'Office',
    lastName: 'Accountant',
    role: Role.ACCOUNTANT,
  },
  {
    email: 'pm@gblenterprise.com',
    password: 'Pm123456!',
    firstName: 'Site',
    lastName: 'Manager',
    role: Role.PROJECT_MANAGER,
  },
  {
    email: 'employee@gblenterprise.com',
    password: 'Worker123!',
    firstName: 'Field',
    lastName: 'Worker',
    role: Role.EMPLOYEE,
  },
  {
    email: 'employee2@gblenterprise.com',
    password: 'Worker123!',
    firstName: 'Store',
    lastName: 'Keeper',
    role: Role.EMPLOYEE,
  },
];

async function nextNumber(scope: string, prefix: string): Promise<string> {
  const row = await CounterModel.findOneAndUpdate(
    { key: scope },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  ).exec();
  return `${prefix}-${String(row!.seq).padStart(4, '0')}`;
}

/**
 * Idempotent demo seed for real MongoDB deployments (new CoA leaf codes).
 */
export async function seedDemoData(deps: SeedDeps): Promise<void> {
  for (const row of DEMO_USERS) {
    const existing = await deps.usersService.findByEmail(row.email);
    if (existing) continue;
    const password = await hashPassword(row.password);
    await deps.usersService.create({
      email: row.email,
      password,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
    });
    console.log(`Seeded demo user ${row.email} (${row.role})`);
  }

  const pm = await UserModel.findOne({ email: 'pm@gblenterprise.com' }).exec();
  const admin = await UserModel.findOne({ role: Role.ADMIN }).exec();

  if ((await CustomerModel.countDocuments().exec()) === 0) {
    await CustomerModel.create([
      {
        customerNumber: await nextNumber('customer', 'CUS'),
        name: 'ABC Construction Ltd',
        contactName: 'Accounts',
        email: 'ar@abcconstruction.test',
        phone: '+8801711000001',
        isActive: true,
      },
      {
        customerNumber: await nextNumber('customer', 'CUS'),
        name: 'GBL Properties Ltd',
        contactName: 'Billing Desk',
        email: 'billing@gblproperties.test',
        phone: '+8801700000000',
        isActive: true,
      },
    ]);
    console.log('Seeded demo customers');
  }

  const projectCount = await ProjectModel.countDocuments().exec();
  if (projectCount === 0 && admin) {
    await ProjectModel.create({
      code: await nextNumber('project', 'PRJ'),
      name: 'Demo Office Fit-out',
      client: {
        name: 'GBL Properties Ltd',
        contactName: 'Billing Desk',
        email: 'billing@gblproperties.test',
        phone: '+8801700000000',
      },
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      contractValueMinor: toMinorUnits(1_200_000),
      totalBudgetMinor: toMinorUnits(450_000),
      status: ProjectStatus.ACTIVE,
      managerId: pm?._id ?? null,
      description: 'Seeded sample project for dashboards and workflows',
      createdBy: admin._id,
    });
    console.log('Seeded demo project');
  }

  if ((await SupplierModel.countDocuments().exec()) === 0) {
    await SupplierModel.create({
      supplierNumber: await nextNumber('supplier', 'SUP'),
      name: 'Metro Building Supply',
      contactName: 'Sales',
      phone: '+8801811111111',
      paymentTermsDays: 30,
      isActive: true,
    });
    console.log('Seeded demo supplier');
  }

  if ((await ItemModel.countDocuments().exec()) === 0) {
    await ItemModel.create({
      sku: 'CEM-50',
      name: 'Portland cement 50kg',
      unit: 'bag',
      isActive: true,
    });
    console.log('Seeded demo inventory item');
  }

  const treasury = await deps.bankingService.list();
  const cash = treasury.find((row) => row.glAccountCode === '1111');
  const bank = treasury.find((row) => row.glAccountCode === '1112');
  if (
    cash &&
    bank &&
    cash.bookBalance === 0 &&
    bank.bookBalance === 0 &&
    admin
  ) {
    await deps.journalService.post(
      {
        date: '2026-01-01',
        memo: 'Opening capital (seed)',
        journalType: 'opening_balance',
        reference: 'SEED-OB-001',
        lines: [
          { accountCode: '1111', debit: 150_000 },
          { accountCode: '1112', debit: 850_000 },
          { accountCode: '3100', credit: 1_000_000 },
        ],
      },
      admin._id.toString(),
    );
    console.log('Seeded opening cash and bank balances (balanced BS)');
  }
}
