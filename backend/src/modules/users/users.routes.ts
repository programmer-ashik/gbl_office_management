import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import {
  ChangeOwnPasswordDto,
  ResetUserPasswordDto,
} from './dto/password.dto';
import { UpdateUserPermissionsDto } from './dto/update-user-permissions.dto';
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

  // Must be registered before /:id routes so "profile" is not treated as an id.
  router.put(
    '/profile/change-password',
    auth,
    validateBody(ChangeOwnPasswordDto),
    asyncHandler(async (req, res) => {
      const user = await usersService.changeOwnPassword(
        req.user!.userId,
        req.body.oldPassword,
        req.body.newPassword,
      );
      sendSuccess(res, user, 'Password updated successfully');
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

  router.patch(
    '/:id/permissions',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(UpdateUserPermissionsDto),
    asyncHandler(async (req, res) => {
      const user = await usersService.updatePermissions(
        String(req.params.id),
        req.body.allowedPermissions,
      );
      sendSuccess(res, user, 'User permissions updated successfully');
    }),
  );

  router.put(
    '/:id/reset-password',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(ResetUserPasswordDto),
    asyncHandler(async (req, res) => {
      const user = await usersService.resetPassword(
        String(req.params.id),
        req.body.newPassword,
      );
      sendSuccess(res, user, 'Password reset successfully');
    }),
  );

  return router;
}
