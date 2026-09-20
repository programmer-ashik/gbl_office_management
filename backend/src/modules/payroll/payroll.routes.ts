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
  CreateSalaryFacilityDto,
  CreateTimeLogDto,
  DisbursePayrollDto,
  GeneratePayrollDto,
  PostPayrollDto,
  PreviewSalaryBreakdownDto,
  UpdatePayrollSettingsDto,
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
    '/settings',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const row = await payrollService.getPayrollSettings(req.user!);
      sendSuccess(res, row, 'Payroll settings retrieved successfully');
    }),
  );

  router.put(
    '/settings',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(UpdatePayrollSettingsDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.updatePayrollSettings(
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Payroll settings saved successfully');
    }),
  );

  router.post(
    '/salary-structures/preview',
    auth,
    requireRoles(...FINANCE),
    validateBody(PreviewSalaryBreakdownDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.previewSalaryBreakdown(
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Salary breakdown preview generated');
    }),
  );

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
    '/salary-facilities',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await payrollService.listSalaryFacilities(req.user!);
      sendSuccess(res, rows, 'Salary advances & loans retrieved successfully');
    }),
  );

  router.post(
    '/salary-facilities',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateSalaryFacilityDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.createSalaryFacility(req.body, req.user!);
      sendSuccess(res, row, 'Salary facility disbursed successfully', 201);
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
    '/runs/:id/post',
    auth,
    requireRoles(...FINANCE),
    validateBody(PostPayrollDto),
    asyncHandler(async (req, res) => {
      const row = await payrollService.postRun(
        String(req.params.id),
        req.user!,
        req.body,
      );
      sendSuccess(res, row, 'Monthly payroll posted (accrual) successfully');
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

  router.get(
    '/runs/:id/salary-slips/pdf',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const employeeId =
        typeof req.query.employeeId === 'string'
          ? req.query.employeeId
          : undefined;
      const pdf = await payrollService.buildSalarySlipPdfBuffer(
        String(req.params.id),
        employeeId,
        req.user!,
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${pdf.filename}"`,
      );
      res.send(pdf.buffer);
    }),
  );

  return router;
}
