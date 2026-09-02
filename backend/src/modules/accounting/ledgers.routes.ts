import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
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
      const ledger = await ledgerService.listForAccount(
        String(req.params.accountCode),
        asOf,
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

  return router;
}
