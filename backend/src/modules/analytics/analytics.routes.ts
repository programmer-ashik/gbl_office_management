import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { AnalyticsService } from './analytics.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;
const PROJECT_VIEW = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
] as const;

export function createAnalyticsRouter(
  analyticsService: AnalyticsService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/cash-flow',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const report = await analyticsService.cashFlowForecast(req.user!);
      sendSuccess(res, report, 'Cash flow forecast generated');
    }),
  );

  router.get(
    '/burn-rate',
    auth,
    requireRoles(...PROJECT_VIEW),
    asyncHandler(async (req, res) => {
      const rows = await analyticsService.burnRates(req.user!);
      sendSuccess(res, rows, 'Project burn rates retrieved');
    }),
  );

  router.get(
    '/statements',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const report = await analyticsService.financialStatements(req.user!);
      sendSuccess(res, report, 'Financial statements generated');
    }),
  );

  return router;
}
