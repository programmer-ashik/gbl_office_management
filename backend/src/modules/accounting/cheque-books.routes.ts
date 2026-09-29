import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { ChequeBookService } from './cheque-book.service';
import { CancelChequeLeafDto, CreateChequeBookDto } from './dto/journal.dto';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

/** Company (own) chequebooks and their leaves. */
export function createChequeBooksRouter(
  chequeBookService: ChequeBookService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  const str = (query: Record<string, unknown>, key: string) =>
    typeof query[key] === 'string' && query[key] ? (query[key] as string) : undefined;

  router.get(
    '/',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const query = req.query as Record<string, unknown>;
      const rows = await chequeBookService.listBooks({ treasuryId: str(query, 'treasuryId') });
      sendSuccess(res, rows, 'Chequebooks retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateChequeBookDto),
    asyncHandler(async (req, res) => {
      const book = await chequeBookService.createBook(
        req.body as CreateChequeBookDto,
        req.user!.userId,
      );
      sendSuccess(res, book, 'Chequebook registered', 201);
    }),
  );

  router.get(
    '/leaves',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const query = req.query as Record<string, unknown>;
      const rows = await chequeBookService.listLeaves({
        bookId: str(query, 'bookId'),
        treasuryId: str(query, 'treasuryId'),
        bankAccountCode: str(query, 'bankAccountCode'),
        status: str(query, 'status'),
        search: str(query, 'search') ?? str(query, 'q'),
      });
      sendSuccess(res, rows, 'Cheque leaves retrieved successfully');
    }),
  );

  router.get(
    '/leaves/available',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const query = req.query as Record<string, unknown>;
      const rows = await chequeBookService.availableLeaves({
        treasuryId: str(query, 'treasuryId'),
        bankAccountCode: str(query, 'bankAccountCode'),
      });
      sendSuccess(res, rows, 'Unused cheque leaves retrieved successfully');
    }),
  );

  router.post(
    '/leaves/:leafId/cancel',
    auth,
    requireRoles(...FINANCE),
    validateBody(CancelChequeLeafDto),
    asyncHandler(async (req, res) => {
      const leaf = await chequeBookService.cancelLeaf(
        String(req.params.leafId),
        (req.body as CancelChequeLeafDto).reason,
        req.user!.userId,
      );
      sendSuccess(res, leaf, 'Cheque leaf cancelled');
    }),
  );

  router.post(
    '/leaves/:leafId/restore',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const leaf = await chequeBookService.restoreLeaf(String(req.params.leafId));
      sendSuccess(res, leaf, 'Cheque leaf restored');
    }),
  );

  router.delete(
    '/:id',
    auth,
    requireRoles(Role.ADMIN, Role.ACCOUNTANT),
    asyncHandler(async (req, res) => {
      const result = await chequeBookService.deleteBook(String(req.params.id));
      sendSuccess(res, result, 'Chequebook deleted');
    }),
  );

  return router;
}
