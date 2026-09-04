import { Router } from 'express';
import { ApprovalEntityType } from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { ApprovalService } from '../governance/approval.service';
import type { UsersService } from '../users/users.service';
import { PostJournalDto } from './dto/journal.dto';
import type { JournalService } from './journal.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;

function listFiltersFromQuery(query: Record<string, unknown>) {
  const str = (key: string) =>
    typeof query[key] === 'string' ? (query[key] as string) : undefined;
  return {
    projectId: str('projectId'),
    fromDate: str('fromDate'),
    toDate: str('toDate'),
    status: str('status'),
    journalType: str('journalType'),
    accountCode: str('accountCode'),
    entityType: str('entityType'),
    entityId: str('entityId'),
    search: str('search') ?? str('q'),
    source: str('source'),
  };
}

export function createJournalsRouter(
  journalService: JournalService,
  authService: AuthService,
  usersService: UsersService,
  approvalService?: ApprovalService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const entries = await journalService.list(
        300,
        listFiltersFromQuery(req.query as Record<string, unknown>),
      );
      sendSuccess(res, entries, 'Journal entries retrieved successfully');
    }),
  );

  router.get(
    '/summary',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const summary = await journalService.summary(
        listFiltersFromQuery(req.query as Record<string, unknown>),
      );
      sendSuccess(res, summary, 'Journal summary retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(PostJournalDto),
    asyncHandler(async (req, res) => {
      const dto = req.body as PostJournalDto;
      const intent = dto.intent ?? 'post';

      if (intent === 'draft') {
        const entry = await journalService.saveDraft(dto, req.user!.userId);
        sendSuccess(res, entry, 'Journal draft saved successfully', 201);
        return;
      }

      const amount = dto.lines.reduce((sum, line) => sum + (line.debit ?? 0), 0);

      if (approvalService && req.user!.role !== Role.ADMIN) {
        const gate = await approvalService.requireApprovedOrCreate(
          {
            entityType: ApprovalEntityType.JOURNAL,
            amount,
            summary: dto.memo,
            projectId: dto.projectId,
            payload: {
              date: dto.date,
              memo: dto.memo,
              reference: dto.reference,
              journalType: dto.journalType,
              projectId: dto.projectId,
              lines: dto.lines,
            },
          },
          req.user!,
          dto.approvalId,
        );
        if (!gate.allowed) {
          sendSuccess(
            res,
            { requiresApproval: true, approval: gate.approval },
            'Large journal queued for multi-level approval',
            202,
          );
          return;
        }
      }

      const entry = await journalService.post(dto, req.user!.userId);
      if (approvalService && dto.approvalId) {
        await approvalService.markExecuted(
          dto.approvalId,
          req.user!,
          entry.entryNumber,
        );
      }
      sendSuccess(res, entry, 'Journal posted successfully', 201);
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const entry = await journalService.findByIdOrFail(String(req.params.id));
      sendSuccess(
        res,
        journalService.toPublic(entry),
        'Journal entry retrieved successfully',
      );
    }),
  );

  router.patch(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    validateBody(PostJournalDto),
    asyncHandler(async (req, res) => {
      const entry = await journalService.update(
        String(req.params.id),
        req.body,
        req.user!.userId,
      );
      sendSuccess(res, entry, 'Journal updated successfully');
    }),
  );

  router.post(
    '/:id/post',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const entry = await journalService.postExisting(
        String(req.params.id),
        req.user!.userId,
      );
      sendSuccess(res, entry, 'Journal posted successfully');
    }),
  );

  router.delete(
    '/:id',
    auth,
    requireRoles(Role.ADMIN, Role.ACCOUNTANT),
    asyncHandler(async (req, res) => {
      const result = await journalService.delete(
        String(req.params.id),
        req.user!.userId,
      );
      sendSuccess(res, result, 'Journal deleted successfully');
    }),
  );

  router.post(
    '/:id/reverse',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const entry = await journalService.reverse(
        String(req.params.id),
        req.user!.userId,
      );
      sendSuccess(res, entry, 'Reversing journal posted successfully', 201);
    }),
  );

  return router;
}
