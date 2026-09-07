import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { QuotationStatus } from '../../common/enums/quotation-status.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import {
  CreateQuotationDto,
  UpdateQuotationStatusDto,
} from './dto/quotation.dto';
import type { QuotationsService } from './quotations.service';

/** Derived “can create quotation” — role-based, no User schema flag. */
export const QUOTATION_CREATE_ROLES = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
  Role.EMPLOYEE,
] as const;

export const QUOTATION_VIEW_ROLES = QUOTATION_CREATE_ROLES;

export function createQuotationsRouter(
  quotationsService: QuotationsService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...QUOTATION_VIEW_ROLES),
    asyncHandler(async (req, res) => {
      const createdBy =
        typeof req.query.createdBy === 'string'
          ? req.query.createdBy
          : undefined;
      const projectId =
        typeof req.query.projectId === 'string'
          ? req.query.projectId
          : undefined;
      const status =
        typeof req.query.status === 'string' &&
        Object.values(QuotationStatus).includes(
          req.query.status as QuotationStatus,
        )
          ? (req.query.status as QuotationStatus)
          : undefined;
      const fromDate = req.query.fromDate
        ? new Date(String(req.query.fromDate))
        : undefined;
      const toDate = req.query.toDate
        ? new Date(String(req.query.toDate))
        : undefined;
      const rows = await quotationsService.list(req.user!, {
        createdBy,
        projectId,
        status,
        fromDate,
        toDate,
      });
      sendSuccess(res, rows, 'Quotations retrieved successfully');
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...QUOTATION_VIEW_ROLES),
    asyncHandler(async (req, res) => {
      const row = await quotationsService.getById(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, row, 'Quotation retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...QUOTATION_CREATE_ROLES),
    validateBody(CreateQuotationDto),
    asyncHandler(async (req, res) => {
      const row = await quotationsService.create(req.body, req.user!);
      sendSuccess(res, row, 'Quotation created successfully', 201);
    }),
  );

  router.patch(
    '/:id/status',
    auth,
    requireRoles(...QUOTATION_CREATE_ROLES),
    validateBody(UpdateQuotationStatusDto),
    asyncHandler(async (req, res) => {
      const row = await quotationsService.updateStatus(
        String(req.params.id),
        req.body.status,
        req.user!,
      );
      sendSuccess(res, row, 'Quotation status updated successfully');
    }),
  );

  return router;
}
