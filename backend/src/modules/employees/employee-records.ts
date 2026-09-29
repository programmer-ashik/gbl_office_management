import { type ClientSession, Types } from 'mongoose';
import { Role } from '../../common/enums/role.enum';
import { notFound } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { LedgerLineModel } from '../accounting/ledger.model';
import { JournalEntityType } from '../accounting/journal.enums';
import { AdvanceModel } from '../advances/advance.model';
import { PayrollRunModel } from '../payroll/payroll-run.model';
import { SalaryFacilityModel } from '../payroll/salary-facility.model';
import { SalaryStructureModel } from '../payroll/salary-structure.model';
import { TimeLogModel } from '../payroll/time-log.model';
import { UserModel, type UserDocument } from '../users/user.model';
import { EmployeeModel, type EmployeeDocument } from './employee.model';

/** Roles that were treated as staff before the User/Employee split. */
export const LEGACY_STAFF_ROLES = [
  Role.EMPLOYEE,
  Role.PROJECT_MANAGER,
  Role.ACCOUNTANT,
] as const;

export interface PublicEmployeeAccount {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface PublicEmployee {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  /** HR contact email, else the login email. */
  email: string | null;
  phone: string | null;
  designation: string | null;
  salary: number | null;
  joinDate: string | null;
  isActive: boolean;
  userId: string | null;
  hasAccount: boolean;
  account: PublicEmployeeAccount | null;
  /** Login role when the employee has an account (kept for older screens). */
  role: Role | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function toPublicEmployee(
  employee: EmployeeDocument,
  user?: UserDocument | null,
): PublicEmployee {
  const account =
    user && employee.userId && user._id.equals(employee.userId)
      ? {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          isActive: user.isActive,
        }
      : null;
  return {
    id: employee._id.toString(),
    firstName: employee.firstName,
    lastName: employee.lastName,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    email: employee.email || account?.email || null,
    phone: employee.phone || null,
    designation: employee.designation || null,
    salary:
      employee.salaryMinor != null ? fromMinorUnits(employee.salaryMinor) : null,
    joinDate: employee.joinDate ? employee.joinDate.toISOString().slice(0, 10) : null,
    isActive: employee.isActive,
    userId: employee.userId ? employee.userId.toString() : null,
    hasAccount: Boolean(account),
    account,
    role: account?.role ?? null,
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

/** Employee record for a pre-split user id, reusing the user's `_id`. */
async function provisionFromUser(
  user: UserDocument,
  session?: ClientSession,
): Promise<EmployeeDocument> {
  await EmployeeModel.updateOne(
    { _id: user._id },
    {
      $setOnInsert: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isActive: user.isActive,
        userId: user._id,
      },
    },
    { upsert: true, ...(session ? { session } : {}) },
  ).exec();
  return (await EmployeeModel.findById(user._id).session(session ?? null).exec())!;
}

/**
 * Resolves an employee id. Ids that still point at a pre-split user are
 * accepted: the user's linked employee is returned, or one is created with
 * the same `_id`, so older references keep working.
 */
export async function findEmployee(
  id: string,
  session?: ClientSession,
): Promise<EmployeeDocument | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const direct = await EmployeeModel.findById(id).session(session ?? null).exec();
  if (direct) return direct;
  const linked = await EmployeeModel.findOne({ userId: new Types.ObjectId(id) })
    .session(session ?? null)
    .exec();
  if (linked) return linked;
  const user = await UserModel.findById(id).session(session ?? null).exec();
  return user ? provisionFromUser(user, session) : null;
}

export async function findEmployeeOrFail(
  id: string,
  session?: ClientSession,
): Promise<EmployeeDocument> {
  const employee = await findEmployee(id, session);
  if (!employee) throw notFound('Employee not found');
  return employee;
}

/** The employee a logged-in user acts as, if any. */
export async function employeeIdForUser(userId: string): Promise<string | null> {
  if (!Types.ObjectId.isValid(userId)) return null;
  const employee = await EmployeeModel.findOne(
    { userId: new Types.ObjectId(userId) },
    { _id: 1 },
  ).exec();
  return employee ? employee._id.toString() : null;
}

/**
 * Migration: creates an Employee (same `_id`, linked `userId`) for every
 * pre-split staff user and every user already used as an employee in
 * advances, payroll, time logs, facilities, or employee ledger lines.
 * Idempotent and additive — no user or history document is modified.
 */
export async function backfillEmployeesFromUsers(): Promise<number> {
  const [staff, advances, structures, runs, logs, facilities, ledger] =
    await Promise.all([
      UserModel.distinct('_id', { role: { $in: LEGACY_STAFF_ROLES } }).exec(),
      AdvanceModel.distinct('employeeId').exec(),
      SalaryStructureModel.distinct('employeeId').exec(),
      PayrollRunModel.distinct('lines.employeeId').exec(),
      TimeLogModel.distinct('employeeId').exec(),
      SalaryFacilityModel.distinct('employeeId').exec(),
      LedgerLineModel.distinct('entityId', {
        entityType: JournalEntityType.EMPLOYEE,
      }).exec(),
    ]);
  const candidateIds = [
    ...new Set(
      [staff, advances, structures, runs, logs, facilities, ledger]
        .flat()
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ].map((id) => new Types.ObjectId(id));
  if (candidateIds.length === 0) return 0;

  const [existing, linked, users] = await Promise.all([
    EmployeeModel.distinct('_id', { _id: { $in: candidateIds } }).exec(),
    EmployeeModel.distinct('userId', { userId: { $in: candidateIds } }).exec(),
    UserModel.find({ _id: { $in: candidateIds } }).exec(),
  ]);
  const covered = new Set([...existing, ...linked].map((id) => String(id)));
  let created = 0;
  for (const user of users) {
    if (covered.has(user._id.toString())) continue;
    await provisionFromUser(user);
    created += 1;
  }
  return created;
}
