import { Router } from 'express';
import { AccountType } from '../../common/enums/account-type.enum';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createAccountsRouter(
  accountsService: AccountsService,
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
      const type = req.query.type as AccountType | undefined;
      const accounts = await accountsService.list(type);
      sendSuccess(res, accounts, 'Chart of accounts retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateAccountDto),
    asyncHandler(async (req, res) => {
      const account = await accountsService.create(req.body);
      sendSuccess(res, account, 'Account created successfully', 201);
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const account = await accountsService.findByIdOrFail(String(req.params.id));
      sendSuccess(
        res,
        accountsService.toPublic(account),
        'Account retrieved successfully',
      );
    }),
  );

  router.patch(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    validateBody(UpdateAccountDto),
    asyncHandler(async (req, res) => {
      const account = await accountsService.update(String(req.params.id), req.body);
      sendSuccess(res, account, 'Account updated successfully');
    }),
  );

  return router;
}
