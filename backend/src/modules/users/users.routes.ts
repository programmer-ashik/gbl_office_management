import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import type { UsersService } from './users.service';

export function createUsersRouter(
  usersService: UsersService,
  authService: AuthService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(Role.ADMIN),
    asyncHandler(async (_req, res) => {
      const users = await usersService.findAll();
      sendSuccess(res, users, 'Users retrieved successfully');
    }),
  );

  router.get(
    '/me',
    auth,
    asyncHandler(async (req, res) => {
      const user = await usersService.findByIdOrFail(req.user!.userId);
      sendSuccess(
        res,
        usersService.toPublicUser(user),
        'Current user retrieved successfully',
      );
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(Role.ADMIN, Role.ACCOUNTANT),
    asyncHandler(async (req, res) => {
      const user = await usersService.findByIdOrFail(String(req.params.id));
      sendSuccess(
        res,
        usersService.toPublicUser(user),
        'User retrieved successfully',
      );
    }),
  );

  router.patch(
    '/:id/role',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(UpdateUserRoleDto),
    asyncHandler(async (req, res) => {
      const user = await usersService.updateRole(
        String(req.params.id),
        req.body.role,
      );
      sendSuccess(res, user, 'User role updated successfully');
    }),
  );

  router.patch(
    '/:id/status',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(UpdateUserStatusDto),
    asyncHandler(async (req, res) => {
      const user = await usersService.updateStatus(
        String(req.params.id),
        req.body.isActive,
      );
      sendSuccess(res, user, 'User status updated successfully');
    }),
  );

  return router;
}
