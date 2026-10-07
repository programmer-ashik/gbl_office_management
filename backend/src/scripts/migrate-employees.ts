import '../load-env';
import 'reflect-metadata';
import { loadConfig } from '../config';
import {
  connectDatabase,
  disconnectDatabase,
} from '../database/connection';
import { backfillEmployeesFromUsers } from '../modules/employees/employee-records';
import { EmployeeModel } from '../modules/employees/employee.model';
import { UserModel } from '../modules/users/user.model';

/**
 * User / Employee split migration. Additive and safe to re-run (it also runs
 * at API startup):
 * - creates the `employees` collection and its indexes (userId unique when set)
 * - for every pre-split staff user, and every user already referenced as an
 *   employee (advances, payroll, time logs, facilities, employee ledger lines),
 *   inserts an Employee with the same `_id` and `userId` = that user
 * - never modifies or deletes a user, journal, or payroll document
 *
 * Usage:
 *   npm run migrate:employees
 *   npm run migrate:employees -- --dry-run
 */
async function main(): Promise<void> {
  loadConfig();
  const dryRun = process.argv.includes('--dry-run');
  await connectDatabase();

  // createIndexes only adds; syncIndexes would drop indexes not in the schema.
  if (!dryRun) {
    await EmployeeModel.createIndexes();
  }

  const [users, employees, linked] = await Promise.all([
    UserModel.countDocuments().exec(),
    EmployeeModel.countDocuments().exec(),
    EmployeeModel.countDocuments({ userId: { $type: 'objectId' } }).exec(),
  ]);
  console.log(`Before: users=${users} employees=${employees} linked=${linked}`);

  if (dryRun) {
    console.log('[dry-run] no employees created');
    await disconnectDatabase();
    return;
  }

  const created = await backfillEmployeesFromUsers();
  const after = await EmployeeModel.countDocuments().exec();
  console.log(`Created ${created} employee record(s); employees now=${after}`);
  await disconnectDatabase();
}

main().catch(async (err: unknown) => {
  console.error(err);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
