import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import { CreateOtherPartyDto, UpdateOtherPartyDto } from './dto/other-party.dto';
import { OTHER_PARTY_KINDS, type OtherPartyKind } from './other-party.model';
import type { OtherPartiesService } from './other-parties.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;
const PROJECT_VIEW = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
] as const;

export function createOtherPartiesRouter(
  otherPartiesService: OtherPartiesService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...PROJECT_VIEW),
    asyncHandler(async (req, res) => {
      const kind = OTHER_PARTY_KINDS.includes(req.query.kind as OtherPartyKind)
        ? (req.query.kind as OtherPartyKind)
        : undefined;
      const activeOnly = req.query.active === '1' || req.query.active === 'true';
      const rows = await otherPartiesService.list({ kind, activeOnly });
      sendSuccess(res, rows, 'Other parties retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateOtherPartyDto),
    asyncHandler(async (req, res) => {
      const row = await otherPartiesService.create(req.body);
      sendSuccess(res, row, 'Party added successfully', 201);
    }),
  );

  router.patch(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    validateBody(UpdateOtherPartyDto),
    asyncHandler(async (req, res) => {
      const row = await otherPartiesService.update(String(req.params.id), req.body);
      sendSuccess(res, row, 'Party updated successfully');
    }),
  );

  return router;
}
