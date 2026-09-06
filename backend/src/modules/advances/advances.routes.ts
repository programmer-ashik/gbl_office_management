import { Router } from 'express';
import { ALL_ROLES, Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { AdvancesService } from './advances.service';
import {
  ConfirmSettlementDto,
  CreateAdvanceDto,
  DisburseAdvanceDto,
  RejectAdvanceDto,
  ReimburseAdvanceDto,
  SubmitSettlementDto,
} from './dto/advance.dto';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createAdvancesRouter(
  advancesService: AdvancesService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (req, res) => {
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize
        ? Number(req.query.pageSize)
        : undefined;
      const result = await advancesService.list(req.user!, {
        projectId: req.query.projectId
          ? String(req.query.projectId)
          : undefined,
        employeeId: req.query.employeeId
          ? String(req.query.employeeId)
          : undefined,
        startDate: req.query.startDate
          ? String(req.query.startDate)
          : undefined,
        endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        page: Number.isFinite(page) ? page : undefined,
        pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      });
      sendSuccess(res, result, 'Advances retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...ALL_ROLES),
    validateBody(CreateAdvanceDto),
    asyncHandler(async (req, res) => {
      const row = await advancesService.create(req.body, req.user!);
      sendSuccess(res, row, 'Advance requisition submitted', 201);
    }),
  );

  router.get(
    '/projects',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (req, res) => {
      const rows = await advancesService.projectOptions(req.user!);
      sendSuccess(res, rows, 'Project options retrieved successfully');
    }),
  );

  router.get(
    '/expense-accounts',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (_req, res) => {
      const rows = await advancesService.expenseAccountOptions();
      sendSuccess(res, rows, 'Expense accounts retrieved successfully');
    }),
  );

  router.get(
    '/project-report/pdf',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const projectId = String(req.query.projectId ?? '');
      const pdf = await advancesService.buildProjectReportPdf(
        projectId,
        req.user!,
        {
          employeeId: req.query.employeeId
            ? String(req.query.employeeId)
            : undefined,
          startDate: req.query.startDate
            ? String(req.query.startDate)
            : undefined,
          endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        },
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${pdf.filename}"`,
      );
      res.send(pdf.buffer);
    }),
  );

  router.get(
    '/:id/pdf',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (req, res) => {
      const pdf = await advancesService.buildVoucherPdf(
        String(req.params.id),
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

  router.get(
    '/:id',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (req, res) => {
      const row = await advancesService.getById(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Advance retrieved successfully');
    }),
  );

  router.post(
    '/:id/reject',
    auth,
    requireRoles(...FINANCE),
    validateBody(RejectAdvanceDto),
    asyncHandler(async (req, res) => {
      const row = await advancesService.reject(
        String(req.params.id),
        req.user!,
        req.body.reason,
      );
      sendSuccess(res, row, 'Advance requisition rejected');
    }),
  );

  router.post(
    '/:id/disburse',
    auth,
    requireRoles(...FINANCE),
    validateBody(DisburseAdvanceDto),
    asyncHandler(async (req, res) => {
      const row = await advancesService.disburse(
        String(req.params.id),
        req.body,
        req.user!,
      );
      if (
        row &&
        typeof row === 'object' &&
        'requiresApproval' in row &&
        row.requiresApproval
      ) {
        sendSuccess(
          res,
          row,
          'Large advance disbursement queued for multi-level approval',
          202,
        );
        return;
      }
      sendSuccess(res, row, 'Advance disbursed', 201);
    }),
  );

  router.post(
    '/:id/settlement',
    auth,
    requireRoles(...ALL_ROLES),
    validateBody(SubmitSettlementDto),
    asyncHandler(async (req, res) => {
      const row = await advancesService.submitSettlement(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Settlement submitted');
    }),
  );

  router.post(
    '/:id/confirm',
    auth,
    requireRoles(...FINANCE),
    validateBody(ConfirmSettlementDto),
    asyncHandler(async (req, res) => {
      const row = await advancesService.confirmSettlement(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Advance settled', 201);
    }),
  );

  router.post(
    '/:id/reimburse',
    auth,
    requireRoles(...FINANCE),
    validateBody(ReimburseAdvanceDto),
    asyncHandler(async (req, res) => {
      const row = await advancesService.reimburse(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Employee reimbursed', 201);
    }),
  );

  return router;
}
