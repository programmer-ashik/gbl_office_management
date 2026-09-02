import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import {
  CreateTimeLogDto,
  DisbursePayrollDto,
  GeneratePayrollDto,
  UpsertSalaryStructureDto,
} from './dto/payroll.dto';
import type { PayrollService } from './payroll.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createPayrollRouter(
  payrollService: PayrollService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/employees',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await payrollService.listEmployees(req.user!);
      sendSuccess(res, rows, 'Employees retrieved successfully');
    }),
  );

  router.get(
    '/salary-structures',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await payrollService.listSalaryStructures(req.user!);
      sendSuccess(res, rows, 'Salary structures retrieved successfully');
    }),
  );

  router.put(
    '/salary-structures',
    auth,
    requireRoles(...FINANCE),
    validateBody(UpsertSalaryStructureDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.upsertSalaryStructure(req.body, req.user!);
      sendSuccess(res, row, 'Salary structure saved successfully');
    }),
  );

  router.get(
    '/time-logs',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const periodYear = Number(req.query.periodYear);
      const periodMonth = Number(req.query.periodMonth);
      const rows = await payrollService.listTimeLogs(
        periodYear,
        periodMonth,
        req.user!,
      );
      sendSuccess(res, rows, 'Time logs retrieved successfully');
    }),
  );

  router.post(
    '/time-logs',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateTimeLogDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.createTimeLog(req.body, req.user!);
      sendSuccess(res, row, 'Time log recorded successfully', 201);
    }),
  );

  router.get(
    '/runs',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await payrollService.listRuns(req.user!);
      sendSuccess(res, rows, 'Payroll runs retrieved successfully');
    }),
  );

  router.post(
    '/runs',
    auth,
    requireRoles(...FINANCE),
    validateBody(GeneratePayrollDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.generateRun(req.body, req.user!);
      sendSuccess(res, row, 'Payroll sheet generated successfully', 201);
    }),
  );

  router.get(
    '/runs/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const row = await payrollService.getRun(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Payroll run retrieved successfully');
    }),
  );

  router.post(
    '/runs/:id/disburse',
    auth,
    requireRoles(...FINANCE),
    validateBody(DisbursePayrollDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.disburseRun(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Payroll disbursed successfully');
    }),
  );

  return router;
}
