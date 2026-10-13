import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import { BouncePdcDto, ClearPdcDto } from './dto/journal.dto';
import type { PdcService } from './pdc.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

/** Transaction-level actions on posted journals (post-dated cheques). */
export function createTransactionsRouter(
  pdcService: PdcService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  const filtersFrom = (query: Record<string, unknown>) => {
    const str = (key: string) =>
      typeof query[key] === 'string' ? (query[key] as string) : undefined;
    return {
      status: str('status'),
      direction: str('direction'),
      fromDate: str('fromDate'),
      toDate: str('toDate'),
      search: str('search') ?? str('q'),
    };
  };

  router.get(
    '/pdc',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await pdcService.list(filtersFrom(req.query as Record<string, unknown>));
      sendSuccess(res, rows, 'Post-dated cheques retrieved successfully');
    }),
  );

  router.get(
    '/cheques',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await pdcService.register(
        filtersFrom(req.query as Record<string, unknown>),
      );
      sendSuccess(res, rows, 'Cheque register retrieved successfully');
    }),
  );

  router.post(
    '/:id/undo-clear-pdc',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const result = await pdcService.undoClear(String(req.params.id), req.user!.userId);
      sendSuccess(res, result, 'Cheque clearing reversed; cheque is pending again', 201);
    }),
  );

  router.post(
    '/:id/clear-pdc',
    auth,
    requireRoles(...FINANCE),
    validateBody(ClearPdcDto),
    asyncHandler(async (req, res) => {
      const body = req.body as ClearPdcDto;
      const result = await pdcService.clear(String(req.params.id), req.user!.userId, {
        date: body.date,
        memo: body.memo,
      });
      sendSuccess(res, result, 'Post-dated cheque cleared', 201);
    }),
  );

  router.post(
    '/:id/bounce-pdc',
    auth,
    requireRoles(...FINANCE),
    validateBody(BouncePdcDto),
    asyncHandler(async (req, res) => {
      const body = req.body as BouncePdcDto;
      const result = await pdcService.bounce(String(req.params.id), req.user!.userId, {
        reason: body.reason,
      });
      sendSuccess(res, result, 'Post-dated cheque marked as bounced', 201);
    }),
  );

  return router;
}
