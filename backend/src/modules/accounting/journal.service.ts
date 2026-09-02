import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AuditAction } from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  assertDebitsEqualCredits,
  fromMinorUnits,
  toMinorUnits,
} from '../../common/utils/money';
import { withTransaction } from '../../database/connection';
import type { AuditService } from '../governance/audit.service';
import type { ProjectsService } from '../projects/projects.service';
import type { UsersService } from '../users/users.service';
import { AccountsService } from './accounts.service';
import { CounterModel } from './counter.model';
import type { JournalLineDto, PostJournalDto } from './dto/journal.dto';
import {
  JournalEntryModel,
  type IJournalLine,
  type JournalEntryDocument,
} from './journal-entry.model';
import { LedgerLineModel } from './ledger.model';

export type PreparedLine = {
  accountCode: string;
  accountName: string;
  accountId: Types.ObjectId;
  debitMinor: number;
  creditMinor: number;
  description?: string;
  projectId?: string;
};

export function prepareJournalLines(lines: JournalLineDto[]): {
  debitMinor: number;
  creditMinor: number;
  prepared: Omit<PreparedLine, 'accountId' | 'accountName'>[];
} {
  let debitMinor = 0;
  let creditMinor = 0;
  const prepared = lines.map((line) => {
    const debit = toMinorUnits(line.debit ?? 0);
    const credit = toMinorUnits(line.credit ?? 0);

    if (debit > 0 && credit > 0) {
      throw badRequest(
        `Line ${line.accountCode} cannot have both debit and credit`,
      );
    }
    if (debit === 0 && credit === 0) {
      throw badRequest(`Line ${line.accountCode} must have a debit or a credit`);
    }

    debitMinor += debit;
    creditMinor += credit;
    return {
      accountCode: line.accountCode.trim().toUpperCase(),
      debitMinor: debit,
      creditMinor: credit,
      description: line.description?.trim(),
      projectId: line.projectId,
    };
  });

  assertDebitsEqualCredits(debitMinor, creditMinor);
  return { debitMinor, creditMinor, prepared };
}

export type PublicJournalLine = {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string | null;
  projectId: string | null;
};

export type PublicJournal = {
  id: string;
  entryNumber: string;
  date: string;
  memo: string;
  reference: string | null;
  status: string;
  source: string;
  projectId: string | null;
  totalDebit: number;
  totalCredit: number;
  postedAt: string;
  lines: PublicJournalLine[];
};

export class JournalService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly projectsService: ProjectsService,
    private readonly auditService?: AuditService,
    private readonly usersService?: UsersService,
  ) {}

  toPublic(entry: JournalEntryDocument): PublicJournal {
    return {
      id: entry._id.toString(),
      entryNumber: entry.entryNumber,
      date: entry.date.toISOString(),
      memo: entry.memo,
      reference: entry.reference ?? null,
      status: entry.status,
      source: entry.source,
      projectId: entry.projectId ? entry.projectId.toString() : null,
      totalDebit: fromMinorUnits(entry.totalDebitMinor),
      totalCredit: fromMinorUnits(entry.totalCreditMinor),
      postedAt: entry.postedAt.toISOString(),
      lines: entry.lines.map((line) => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: fromMinorUnits(line.debitMinor),
        credit: fromMinorUnits(line.creditMinor),
        description: line.description ?? null,
        projectId: line.projectId ? line.projectId.toString() : null,
      })),
    };
  }

  async post(
    dto: PostJournalDto,
    userId: string,
    source: 'manual' | 'system' = 'manual',
  ): Promise<PublicJournal> {
    const { debitMinor, creditMinor, prepared } = prepareJournalLines(dto.lines);
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) {
      throw badRequest('Invalid journal date');
    }

    const projectIds = new Set<string>();
    if (dto.projectId) {
      projectIds.add(dto.projectId);
    }
    for (const line of prepared) {
      if (line.projectId) {
        projectIds.add(line.projectId);
      }
    }
    for (const projectId of projectIds) {
      await this.projectsService.assertExists(projectId);
    }

    const entry = await withTransaction(async (session) => {
      const accounts = await this.accountsService.findPostableByCodes(
        prepared.map((line) => line.accountCode),
        session,
      );
      const byCode = new Map(accounts.map((account) => [account.code, account]));

      const lines: IJournalLine[] = prepared.map((line) => {
        const account = byCode.get(line.accountCode)!;
        const projectId = line.projectId ?? dto.projectId;
        return {
          accountId: account._id,
          accountCode: account.code,
          accountName: account.name,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          description: line.description,
          projectId: projectId ? new Types.ObjectId(projectId) : undefined,
        };
      });

      const entryNumber = await this.nextEntryNumber(date, session);
      const postedAt = new Date();
      const [created] = await JournalEntryModel.create(
        [
          {
            entryNumber,
            date,
            memo: dto.memo.trim(),
            reference: dto.reference?.trim(),
            status: 'posted',
            source,
            projectId: dto.projectId
              ? new Types.ObjectId(dto.projectId)
              : undefined,
            lines,
            totalDebitMinor: debitMinor,
            totalCreditMinor: creditMinor,
            postedAt,
            postedBy: new Types.ObjectId(userId),
          },
        ],
        { session },
      );

      await LedgerLineModel.insertMany(
        lines.map((line) => {
          const account = byCode.get(line.accountCode)!;
          return {
            journalEntryId: created._id,
            journalEntryNumber: entryNumber,
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            accountType: account.type,
            date,
            memo: line.description || dto.memo.trim(),
            debitMinor: line.debitMinor,
            creditMinor: line.creditMinor,
            projectId: line.projectId,
          };
        }),
        { session },
      );

      return created;
    });

    const publicEntry = this.toPublic(entry);
    await this.auditLedgerWrite(
      userId,
      AuditAction.CREATE,
      publicEntry,
      `Journal posted: ${publicEntry.entryNumber}`,
    );
    return publicEntry;
  }

  async list(limit = 50, projectId?: string): Promise<PublicJournal[]> {
    const filter =
      projectId && Types.ObjectId.isValid(projectId)
        ? {
            $or: [
              { projectId: new Types.ObjectId(projectId) },
              { 'lines.projectId': new Types.ObjectId(projectId) },
            ],
          }
        : {};
    const entries = await JournalEntryModel.find(filter)
      .sort({ date: -1, entryNumber: -1 })
      .limit(limit)
      .exec();
    return entries.map((entry) => this.toPublic(entry));
  }

  async findByIdOrFail(id: string): Promise<JournalEntryDocument> {
    const entry = await JournalEntryModel.findById(id).exec();
    if (!entry) {
      throw notFound('Journal entry not found');
    }
    return entry;
  }

  async reverse(id: string, userId: string): Promise<PublicJournal> {
    const original = await this.findByIdOrFail(id);
    if (original.status === 'reversed') {
      throw badRequest('Journal entry is already reversed');
    }

    const reversing = await this.post(
      {
        date: new Date().toISOString(),
        memo: `Reversal of ${original.entryNumber}`,
        reference: original.entryNumber,
        projectId: original.projectId?.toString(),
        lines: original.lines.map((line) => ({
          accountCode: line.accountCode,
          debit: fromMinorUnits(line.creditMinor),
          credit: fromMinorUnits(line.debitMinor),
          description: `Reversal of ${original.entryNumber}`,
          projectId: line.projectId?.toString(),
        })),
      },
      userId,
      'system',
    );

    original.status = 'reversed';
    original.reversedByEntryId = new Types.ObjectId(reversing.id);
    await original.save();

    await JournalEntryModel.updateOne(
      { _id: reversing.id },
      { $set: { reversesEntryId: original._id } },
    ).exec();

    await this.auditLedgerWrite(
      userId,
      AuditAction.UPDATE,
      {
        originalId: original._id.toString(),
        originalNumber: original.entryNumber,
        reversingId: reversing.id,
        reversingNumber: reversing.entryNumber,
      },
      `Journal reversed: ${original.entryNumber} → ${reversing.entryNumber}`,
      {
        id: original._id.toString(),
        status: 'posted',
      },
    );

    return reversing;
  }

  private async auditLedgerWrite(
    userId: string,
    action: AuditAction,
    after: Record<string, unknown> | PublicJournal,
    summary: string,
    before?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }
    let actor: AuthenticatedUser = {
      userId,
      email: 'unknown@local',
      role: Role.ADMIN,
    };
    if (this.usersService && Types.ObjectId.isValid(userId)) {
      const user = await this.usersService.findById(userId);
      if (user) {
        actor = {
          userId: user._id.toString(),
          email: user.email,
          role: user.role,
        };
      }
    }
    const entityId =
      typeof after === 'object' && after && 'id' in after
        ? String((after as { id: string }).id)
        : userId;
    await this.auditService.record({
      action,
      entityType: 'journal_entry',
      entityId,
      actor,
      summary,
      before: before ?? null,
      after: after as Record<string, unknown>,
    });
  }

  private async nextEntryNumber(
    date: Date,
    session: ClientSession,
  ): Promise<string> {
    const year = date.getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `journal:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    const seq = counter?.seq ?? 1;
    return `JE-${year}-${String(seq).padStart(5, '0')}`;
  }
}
