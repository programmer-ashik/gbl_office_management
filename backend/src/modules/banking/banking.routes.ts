import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { LedgerService } from '../accounting/ledger.service';
import type { UsersService } from '../users/users.service';
import type { BankingService } from './banking.service';
import {
  CreateTransferDto,
  CreateTreasuryAccountDto,
  ImportReconciliationDto,
  MatchReconciliationDto,
  UpdateTreasuryAccountDto,
} from './dto/banking.dto';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

export function createTreasuryRouter(
  bankingService: BankingService,
  ledgerService: LedgerService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (_req, res) => {
      const accounts = await bankingService.list();
      sendSuccess(res, accounts, 'Treasury accounts retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateTreasuryAccountDto),
    asyncHandler(async (req, res) => {
      const account = await bankingService.create(req.body, req.user!.userId);
      sendSuccess(res, account, 'Treasury account created successfully', 201);
    }),
  );

  router.get(
    '/:id/ledger',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const account = await bankingService.getById(String(req.params.id));
      const ledger = await ledgerService.listForAccount(account.glAccountCode);
      sendSuccess(
        res,
        { account, entries: ledger.entries },
        'Treasury ledger retrieved successfully',
      );
    }),
  );

  router.get(
    '/:id/reconciliations',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const rows = await bankingService.listReconciliations(String(req.params.id));
      sendSuccess(res, rows, 'Reconciliations retrieved successfully');
    }),
  );

  router.post(
    '/:id/reconciliations',
    auth,
    requireRoles(...FINANCE),
    validateBody(ImportReconciliationDto),
    asyncHandler(async (req, res) => {
      const session = await bankingService.importReconciliation(
        String(req.params.id),
        req.body,
        req.user!.userId,
      );
      sendSuccess(res, session, 'Statement imported successfully', 201);
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const account = await bankingService.getById(String(req.params.id));
      sendSuccess(res, account, 'Treasury account retrieved successfully');
    }),
  );

  router.patch(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    validateBody(UpdateTreasuryAccountDto),
    asyncHandler(async (req, res) => {
      const account = await bankingService.update(String(req.params.id), req.body);
      sendSuccess(res, account, 'Treasury account updated successfully');
    }),
  );

  return router;
}

export function createTransfersRouter(
  bankingService: BankingService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (_req, res) => {
      const transfers = await bankingService.listTransfers();
      sendSuccess(res, transfers, 'Transfers retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateTransferDto),
    asyncHandler(async (req, res) => {
      const transfer = await bankingService.transfer(req.body, req.user!.userId);
      sendSuccess(res, transfer, 'Transfer posted successfully', 201);
    }),
  );

  return router;
}

export function createReconciliationsRouter(
  bankingService: BankingService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const session = await bankingService.getReconciliation(String(req.params.id));
      sendSuccess(res, session, 'Reconciliation retrieved successfully');
    }),
  );

  router.post(
    '/:id/match',
    auth,
    requireRoles(...FINANCE),
    validateBody(MatchReconciliationDto),
    asyncHandler(async (req, res) => {
      const session = await bankingService.matchLine(
        String(req.params.id),
        req.body.statementLineId,
        req.body.ledgerLineId,
      );
      sendSuccess(res, session, 'Statement line matched successfully');
    }),
  );

  router.post(
    '/:id/complete',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const session = await bankingService.complete(String(req.params.id));
      sendSuccess(res, session, 'Reconciliation completed successfully');
    }),
  );

  return router;
}
