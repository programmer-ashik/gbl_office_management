import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { badRequest } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import { BalanceSheetService } from './balance-sheet.service';
import type { LedgerService } from './ledger.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createLedgersRouter(
  ledgerService: LedgerService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/:accountCode',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const asOf = req.query.asOf
        ? new Date(String(req.query.asOf))
        : undefined;
      const fromDate = req.query.fromDate
        ? new Date(String(req.query.fromDate))
        : undefined;
      const toDate = req.query.toDate
        ? new Date(String(req.query.toDate))
        : undefined;
      const entityType =
        typeof req.query.entityType === 'string'
          ? req.query.entityType
          : undefined;
      const entityId =
        typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
      const ledger = await ledgerService.listForAccount(
        String(req.params.accountCode),
        {
          asOf,
          fromDate,
          toDate,
          entity: { entityType, entityId },
        },
      );
      sendSuccess(res, ledger, 'Ledger retrieved successfully');
    }),
  );

  return router;
}

export function createReportsRouter(
  ledgerService: LedgerService,
  authService: AuthService,
  usersService: UsersService,
  balanceSheetService = new BalanceSheetService(),
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/trial-balance',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const asOf = req.query.asOf
        ? new Date(String(req.query.asOf))
        : new Date();
      const report = await ledgerService.trialBalance(asOf);
      sendSuccess(res, report, 'Trial balance retrieved successfully');
    }),
  );

  router.get(
    '/balance-sheet',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const raw =
        typeof req.query.asOfDate === 'string'
          ? req.query.asOfDate
          : typeof req.query.asOf === 'string'
            ? req.query.asOf
            : undefined;
      const asOf = raw ? new Date(raw) : new Date();
      if (Number.isNaN(asOf.getTime())) {
        throw badRequest('Invalid asOfDate');
      }
      const report = await balanceSheetService.generate(asOf);
      sendSuccess(res, report, 'Balance sheet retrieved successfully');
    }),
  );

  return router;
}
