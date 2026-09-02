import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { ApprovalService } from './approval.service';
import type { AuditService } from './audit.service';
import {
  CreateApprovalDto,
  DecideApprovalDto,
  OcrScanDto,
} from './dto/governance.dto';
import type { OcrService } from './ocr.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;
const APPROVERS = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
] as const;

export function createAuditRouter(
  auditService: AuditService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const entityType =
        typeof req.query.entityType === 'string'
          ? req.query.entityType
          : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const rows = await auditService.list(req.user!, { entityType, limit });
      sendSuccess(res, rows, 'Audit logs retrieved successfully');
    }),
  );

  router.get(
    '/:entityType/:entityId',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await auditService.listForEntity(
        String(req.params.entityType),
        String(req.params.entityId),
        req.user!,
      );
      sendSuccess(res, rows, 'Entity audit trail retrieved successfully');
    }),
  );

  return router;
}

export function createApprovalsRouter(
  approvalService: ApprovalService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...APPROVERS),
    asyncHandler(async (req, res) => {
      const rows = await approvalService.list(req.user!);
      sendSuccess(res, rows, 'Approvals retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...APPROVERS),
    validateBody(CreateApprovalDto),
    asyncHandler(async (req, res) => {
      const row = await approvalService.create(req.body, req.user!);
      sendSuccess(res, row, 'Approval request created', 201);
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...APPROVERS),
    asyncHandler(async (req, res) => {
      const row = await approvalService.getById(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Approval retrieved successfully');
    }),
  );

  router.post(
    '/:id/approve',
    auth,
    requireRoles(...APPROVERS),
    validateBody(DecideApprovalDto),
    asyncHandler(async (req, res) => {
      const row = await approvalService.approve(
        String(req.params.id),
        req.user!,
        req.body.note,
      );
      sendSuccess(res, row, 'Approval step recorded');
    }),
  );

  router.post(
    '/:id/reject',
    auth,
    requireRoles(...APPROVERS),
    validateBody(DecideApprovalDto),
    asyncHandler(async (req, res) => {
      const row = await approvalService.reject(
        String(req.params.id),
        req.user!,
        req.body.note,
      );
      sendSuccess(res, row, 'Approval rejected');
    }),
  );

  return router;
}

export function createOcrRouter(
  ocrService: OcrService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.post(
    '/receipt',
    auth,
    requireRoles(...APPROVERS, Role.EMPLOYEE),
    validateBody(OcrScanDto),
    asyncHandler(async (req, res) => {
      const result = ocrService.scanReceipt(req.body);
      sendSuccess(res, result, 'Receipt scanned (mock OCR)');
    }),
  );

  return router;
}
