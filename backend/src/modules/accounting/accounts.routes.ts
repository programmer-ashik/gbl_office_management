import { Router } from 'express';
import { AccountType } from '../../common/enums/account-type.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import type { JournalService } from './journal.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createAccountsRouter(
  accountsService: AccountsService,
  authService: AuthService,
  usersService: UsersService,
  journalService?: JournalService,
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
      const dto = req.body as CreateAccountDto;
      const openingBalance =
        typeof dto.openingBalance === 'number' ? dto.openingBalance : undefined;

      if (openingBalance != null && dto.isPostable === false) {
        throw badRequest(
          'Opening balance requires a postable (leaf) account. Leave isPostable enabled or omit the amount.',
        );
      }

      const account = await accountsService.create(dto);

      if (openingBalance != null) {
        if (!journalService) {
          try {
            await accountsService.remove(account.id);
          } catch {
            // ignore
          }
          throw badRequest(
            'Opening balance cannot be posted: journal service unavailable',
          );
        }
        try {
          const journal = await journalService.postOpeningBalanceForNewAccount({
            accountCode: account.code,
            accountType: account.type,
            amount: openingBalance,
            userId: req.user!.userId,
          });
          sendSuccess(
            res,
            {
              ...account,
              openingJournalId: journal.id,
              openingJournalNumber: journal.entryNumber,
            },
            `Account created with opening balance journal ${journal.entryNumber}`,
            201,
          );
          return;
        } catch (err) {
          try {
            await accountsService.remove(account.id);
          } catch {
            // keep original journal error if rollback fails
          }
          throw err;
        }
      }

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

  router.delete(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const result = await accountsService.remove(String(req.params.id));
      sendSuccess(res, result, 'Account deleted successfully');
    }),
  );

  return router;
}
