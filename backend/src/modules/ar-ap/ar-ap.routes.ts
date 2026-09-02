import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { ArApService } from './ar-ap.service';
import {
  CollectInvoiceDto,
  CreateInvoiceDto,
  CreateSupplierBillDto,
  CreateSupplierPaymentDto,
  ExecuteSupplierPaymentDto,
} from './dto/ar-ap.dto';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createReceivablesRouter(
  arApService: ArApService,
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
      const rows = await arApService.listInvoices(req.user!);
      sendSuccess(res, rows, 'Invoices retrieved successfully');
    }),
  );

  router.get(
    '/overdue',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await arApService.overdueNotices(req.user!);
      sendSuccess(res, rows, 'Overdue invoices retrieved successfully');
    }),
  );

  router.get(
    '/aging',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const report = await arApService.arAging(
        typeof req.query.asOf === 'string' ? req.query.asOf : undefined,
        req.user!,
      );
      sendSuccess(res, report, 'AR aging report generated');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateInvoiceDto),
    asyncHandler(async (req, res) => {
      const row = await arApService.createInvoice(req.body, req.user!);
      sendSuccess(res, row, 'Invoice created successfully', 201);
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const row = await arApService.getInvoice(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Invoice retrieved successfully');
    }),
  );

  router.get(
    '/:id/collections',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await arApService.listCollections(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, rows, 'Collections retrieved successfully');
    }),
  );

  router.post(
    '/:id/collect',
    auth,
    requireRoles(...FINANCE),
    validateBody(CollectInvoiceDto),
    asyncHandler(async (req, res) => {
      const row = await arApService.collectInvoice(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Collection recorded successfully');
    }),
  );

  return router;
}

export function createPayablesRouter(
  arApService: ArApService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/bills',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await arApService.listBills(req.user!);
      sendSuccess(res, rows, 'Supplier bills retrieved successfully');
    }),
  );

  router.post(
    '/bills',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateSupplierBillDto),
    asyncHandler(async (req, res) => {
      const row = await arApService.createBill(req.body, req.user!);
      sendSuccess(res, row, 'Supplier bill recorded successfully', 201);
    }),
  );

  router.get(
    '/payments',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await arApService.listPayments(req.user!);
      sendSuccess(res, rows, 'Supplier payments retrieved successfully');
    }),
  );

  router.post(
    '/payments',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateSupplierPaymentDto),
    asyncHandler(async (req, res) => {
      const row = await arApService.schedulePayment(req.body, req.user!);
      sendSuccess(res, row, 'Supplier payment scheduled successfully', 201);
    }),
  );

  router.post(
    '/payments/:id/execute',
    auth,
    requireRoles(...FINANCE),
    validateBody(ExecuteSupplierPaymentDto),
    asyncHandler(async (req, res) => {
      const row = await arApService.executePayment(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Supplier payment executed successfully');
    }),
  );

  router.post(
    '/payments/:id/cancel',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const row = await arApService.cancelPayment(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, row, 'Supplier payment cancelled successfully');
    }),
  );

  router.get(
    '/aging',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const report = await arApService.apAging(
        typeof req.query.asOf === 'string' ? req.query.asOf : undefined,
        req.user!,
      );
      sendSuccess(res, report, 'AP aging report generated');
    }),
  );

  return router;
}

export function createSupplierLedgerRouter(
  arApService: ArApService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/:id/ledger',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const row = await arApService.vendorLedger(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Vendor ledger retrieved successfully');
    }),
  );

  return router;
}
