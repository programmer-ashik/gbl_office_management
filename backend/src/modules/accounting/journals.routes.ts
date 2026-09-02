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
      const projectId =
        typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
      const entries = await journalService.list(50, projectId);
      sendSuccess(res, entries, 'Journal entries retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(PostJournalDto),
    asyncHandler(async (req, res) => {
      const dto = req.body as PostJournalDto;
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
