import { Types } from 'mongoose';
import { badRequest, conflict, notFound } from '../../common/errors/app-error';
import { TreasuryKind } from '../../common/enums/treasury-kind.enum';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import type { BankingService } from '../banking/banking.service';
import {
  ChequeBookModel,
  ChequeLeafModel,
  ChequeLeafStatus,
  type ChequeBookDocument,
  type ChequeLeafDocument,
} from './cheque-book.model';
import type { CreateChequeBookDto, PostJournalDto } from './dto/journal.dto';
import { JournalEntryModel } from './journal-entry.model';
import type { PublicJournal } from './journal.service';

export type PublicChequeBook = {
  id: string;
  treasuryId: string;
  bankAccountCode: string;
  bankName: string;
  bookName: string;
  prefix: string;
  startNumber: string;
  endNumber: string;
  leafCount: number;
  receivedDate: string | null;
  notes: string | null;
  availableCount: number;
  issuedCount: number;
  cancelledCount: number;
  nextAvailable: string | null;
  createdAt: string | null;
};

export type PublicChequeLeaf = {
  id: string;
  bookId: string;
  bookName: string;
  treasuryId: string;
  bankAccountCode: string;
  bankName: string;
  chequeNumber: string;
  sequence: number;
  status: ChequeLeafStatus;
  journalId: string | null;
  journalNumber: string | null;
  journalStatus: string | null;
  pdcStatus: string | null;
  issuedAt: string | null;
  payeeName: string | null;
  amount: number | null;
  chequeDate: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
};

export type ChequeLeafFilters = {
  bookId?: string;
  treasuryId?: string;
  bankAccountCode?: string;
  status?: string;
  search?: string;
};

type BankingLookup = Pick<BankingService, 'requireActive'>;

const LEAF_STATUS_VALUES = Object.values(ChequeLeafStatus) as string[];

function formatLeafNumber(prefix: string, value: number, width: number): string {
  return `${prefix}${String(value).padStart(width, '0')}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Company chequebooks: register the leaves the bank gave us, hand out the next
 * unused number when a cheque is issued, and never let a leaf be used twice.
 */
export class ChequeBookService {
  constructor(private readonly banking: BankingLookup) {}

  async createBook(dto: CreateChequeBookDto, userId: string): Promise<PublicChequeBook> {
    const treasury = await this.banking.requireActive(dto.treasuryId);
    if (treasury.kind !== TreasuryKind.COMMERCIAL_BANK) {
      throw badRequest('Chequebooks can only be registered for commercial bank accounts');
    }
    const prefix = (dto.prefix ?? '').trim().toUpperCase();
    const width = dto.startNumber.length;
    const start = Number.parseInt(dto.startNumber, 10);
    const count = Number(dto.leafCount);
    const numbers = Array.from({ length: count }, (_, index) =>
      formatLeafNumber(prefix, start + index, width),
    );

    const clashes = await ChequeLeafModel.find({
      bankAccountCode: treasury.glAccountCode,
      chequeNumber: { $in: numbers },
    })
      .select('chequeNumber')
      .sort({ sequence: 1 })
      .limit(5)
      .lean()
      .exec();
    if (clashes.length > 0) {
      throw conflict(
        `Cheque number(s) ${clashes.map((row) => row.chequeNumber).join(', ')} already exist for ${treasury.name}`,
      );
    }

    const book = await ChequeBookModel.create({
      treasuryId: new Types.ObjectId(treasury.id),
      bankAccountCode: treasury.glAccountCode,
      bankName: treasury.name,
      bookName: dto.bookName?.trim() || `${numbers[0]} – ${numbers[numbers.length - 1]}`,
      prefix,
      startNumber: numbers[0],
      endNumber: numbers[numbers.length - 1],
      leafCount: count,
      receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
      notes: dto.notes?.trim() || undefined,
      createdBy: new Types.ObjectId(userId),
    });

    try {
      await ChequeLeafModel.insertMany(
        numbers.map((chequeNumber, index) => ({
          bookId: book._id,
          treasuryId: book.treasuryId,
          bankAccountCode: book.bankAccountCode,
          chequeNumber,
          sequence: start + index,
          status: ChequeLeafStatus.AVAILABLE,
        })),
        { ordered: true },
      );
    } catch (err) {
      await ChequeLeafModel.deleteMany({ bookId: book._id }).exec();
      await ChequeBookModel.deleteOne({ _id: book._id }).exec();
      if ((err as { code?: number }).code === 11000) {
        throw conflict('Some of these cheque numbers were registered at the same time; try again');
      }
      throw err;
    }

    const [row] = await this.withCounts([book]);
    return row;
  }

  async listBooks(filters: { treasuryId?: string } = {}): Promise<PublicChequeBook[]> {
    const query: Record<string, unknown> = {};
    if (filters.treasuryId && Types.ObjectId.isValid(filters.treasuryId)) {
      query.treasuryId = new Types.ObjectId(filters.treasuryId);
    }
    const books = await ChequeBookModel.find(query).sort({ createdAt: -1 }).exec();
    return this.withCounts(books);
  }

  async listLeaves(filters: ChequeLeafFilters = {}): Promise<PublicChequeLeaf[]> {
    const query: Record<string, unknown> = {};
    if (filters.bookId) {
      if (!Types.ObjectId.isValid(filters.bookId)) throw badRequest('Invalid chequebook id');
      query.bookId = new Types.ObjectId(filters.bookId);
    }
    if (filters.treasuryId && Types.ObjectId.isValid(filters.treasuryId)) {
      query.treasuryId = new Types.ObjectId(filters.treasuryId);
    }
    if (filters.bankAccountCode) query.bankAccountCode = filters.bankAccountCode;
    if (filters.status && LEAF_STATUS_VALUES.includes(filters.status)) {
      query.status = filters.status;
    }
    if (filters.search?.trim()) {
      const pattern = new RegExp(escapeRegex(filters.search.trim()), 'i');
      query.$or = [{ chequeNumber: pattern }, { payeeName: pattern }, { journalNumber: pattern }];
    }
    const leaves = await ChequeLeafModel.find(query)
      .sort({ bookId: 1, sequence: 1 })
      .limit(2000)
      .exec();
    return this.toPublicLeaves(leaves);
  }

  /** Unused leaves, oldest book first, so the next cheque number is always the first row. */
  async availableLeaves(filters: {
    treasuryId?: string;
    bankAccountCode?: string;
  }): Promise<PublicChequeLeaf[]> {
    if (!filters.treasuryId && !filters.bankAccountCode) {
      throw badRequest('Choose a bank account to list its unused cheque leaves');
    }
    return this.listLeaves({ ...filters, status: ChequeLeafStatus.AVAILABLE });
  }

  async cancelLeaf(leafId: string, reason: string, userId: string): Promise<PublicChequeLeaf> {
    const leaf = await this.findLeafOrFail(leafId);
    if (leaf.status !== ChequeLeafStatus.AVAILABLE) {
      throw badRequest(
        leaf.status === ChequeLeafStatus.ISSUED
          ? `Cheque ${leaf.chequeNumber} is already issued on ${leaf.journalNumber ?? 'a journal'}; bounce or reverse that journal instead`
          : `Cheque ${leaf.chequeNumber} is already cancelled`,
      );
    }
    const updated = await ChequeLeafModel.findOneAndUpdate(
      { _id: leaf._id, status: ChequeLeafStatus.AVAILABLE },
      {
        $set: {
          status: ChequeLeafStatus.CANCELLED,
          cancelReason: reason.trim(),
          cancelledAt: new Date(),
          cancelledBy: new Types.ObjectId(userId),
        },
      },
      { new: true },
    ).exec();
    if (!updated) throw conflict(`Cheque ${leaf.chequeNumber} changed meanwhile; refresh and retry`);
    const [row] = await this.toPublicLeaves([updated]);
    return row;
  }

  async restoreLeaf(leafId: string): Promise<PublicChequeLeaf> {
    const leaf = await this.findLeafOrFail(leafId);
    const updated = await ChequeLeafModel.findOneAndUpdate(
      { _id: leaf._id, status: ChequeLeafStatus.CANCELLED },
      {
        $set: { status: ChequeLeafStatus.AVAILABLE },
        $unset: { cancelReason: 1, cancelledAt: 1, cancelledBy: 1 },
      },
      { new: true },
    ).exec();
    if (!updated) {
      throw badRequest(`Only cancelled leaves can be restored (cheque ${leaf.chequeNumber} is ${leaf.status})`);
    }
    const [row] = await this.toPublicLeaves([updated]);
    return row;
  }

  async deleteBook(bookId: string): Promise<{ id: string; deletedLeaves: number }> {
    if (!Types.ObjectId.isValid(bookId)) throw badRequest('Invalid chequebook id');
    const book = await ChequeBookModel.findById(bookId).exec();
    if (!book) throw notFound('Chequebook not found');
    const issued = await ChequeLeafModel.countDocuments({
      bookId: book._id,
      status: ChequeLeafStatus.ISSUED,
    }).exec();
    if (issued > 0) {
      throw badRequest(
        `This chequebook has ${issued} issued cheque(s) and cannot be deleted; cancel unused leaves instead`,
      );
    }
    const removed = await ChequeLeafModel.deleteMany({ bookId: book._id }).exec();
    await ChequeBookModel.deleteOne({ _id: book._id }).exec();
    return { id: book.id, deletedLeaves: removed.deletedCount ?? 0 };
  }

  /**
   * Finds the company leaf a journal is issuing: the explicit `chequeLeafId`, or a
   * registered leaf of the credited bank with the same cheque number. Returns null
   * for cheques that are not from a registered book (e.g. received cheques).
   */
  async resolveLeafForJournal(dto: PostJournalDto): Promise<ChequeLeafDocument | null> {
    if ((dto.intent ?? 'post') === 'draft') return null;
    const creditCodes = [
      ...new Set(dto.lines.filter((line) => (line.credit ?? 0) > 0).map((line) => line.accountCode)),
    ];

    if (dto.chequeLeafId) {
      const leaf = await this.findLeafOrFail(dto.chequeLeafId);
      this.assertLeafUsable(leaf);
      if (!creditCodes.includes(leaf.bankAccountCode)) {
        throw badRequest(
          `Cheque ${leaf.chequeNumber} belongs to bank account ${leaf.bankAccountCode}; the journal must credit that bank`,
        );
      }
      return leaf;
    }

    const number = dto.chequeNumber?.trim();
    if (!number || creditCodes.length === 0) return null;
    const leaf = await ChequeLeafModel.findOne({
      bankAccountCode: { $in: creditCodes },
      chequeNumber: number,
    }).exec();
    if (!leaf) return null;
    this.assertLeafUsable(leaf);
    return leaf;
  }

  /** Marks the leaf issued, posts the journal, and links both (released again if posting fails). */
  async issueWithJournal(
    dto: PostJournalDto,
    userId: string,
    post: (dto: PostJournalDto) => Promise<PublicJournal>,
  ): Promise<PublicJournal> {
    const leaf = await this.resolveLeafForJournal(dto);
    if (!leaf) return post(dto);

    const amountMinor = dto.lines
      .filter((line) => line.accountCode === leaf.bankAccountCode)
      .reduce((sum, line) => sum + toMinorUnits(line.credit ?? 0), 0);
    const claimed = await ChequeLeafModel.findOneAndUpdate(
      { _id: leaf._id, status: ChequeLeafStatus.AVAILABLE },
      {
        $set: {
          status: ChequeLeafStatus.ISSUED,
          issuedAt: new Date(),
          issuedBy: new Types.ObjectId(userId),
          amountMinor,
          chequeDate: new Date(dto.chequeDate ?? dto.date),
        },
      },
      { new: true },
    ).exec();
    if (!claimed) {
      throw conflict(`Cheque ${leaf.chequeNumber} was just used by another entry; pick the next leaf`);
    }

    let entry: PublicJournal;
    try {
      entry = await post({ ...dto, chequeNumber: leaf.chequeNumber });
    } catch (err) {
      await ChequeLeafModel.updateOne(
        { _id: leaf._id, status: ChequeLeafStatus.ISSUED, journalId: { $exists: false } },
        {
          $set: { status: ChequeLeafStatus.AVAILABLE },
          $unset: { issuedAt: 1, issuedBy: 1, amountMinor: 1, chequeDate: 1 },
        },
      ).exec();
      throw err;
    }

    const payee =
      entry.lines.find((line) => line.debit > 0 && line.entityName)?.entityName ??
      entry.lines.find((line) => line.debit > 0)?.accountName ??
      null;
    await ChequeLeafModel.updateOne(
      { _id: leaf._id },
      {
        $set: {
          journalId: new Types.ObjectId(entry.id),
          journalNumber: entry.entryNumber,
          ...(payee ? { payeeName: payee } : {}),
        },
      },
    ).exec();
    return entry;
  }

  private assertLeafUsable(leaf: ChequeLeafDocument): void {
    if (leaf.status === ChequeLeafStatus.ISSUED) {
      throw conflict(
        `Cheque ${leaf.chequeNumber} was already issued${leaf.journalNumber ? ` on ${leaf.journalNumber}` : ''}`,
      );
    }
    if (leaf.status === ChequeLeafStatus.CANCELLED) {
      throw conflict(`Cheque ${leaf.chequeNumber} is cancelled and cannot be issued`);
    }
  }

  private async findLeafOrFail(id: string): Promise<ChequeLeafDocument> {
    if (!Types.ObjectId.isValid(id)) throw badRequest('Invalid cheque leaf id');
    const leaf = await ChequeLeafModel.findById(id).exec();
    if (!leaf) throw notFound('Cheque leaf not found');
    return leaf;
  }

  private async withCounts(books: ChequeBookDocument[]): Promise<PublicChequeBook[]> {
    if (books.length === 0) return [];
    const ids = books.map((book) => book._id);
    const [counts, next] = await Promise.all([
      ChequeLeafModel.aggregate<{ _id: { bookId: Types.ObjectId; status: string }; n: number }>([
        { $match: { bookId: { $in: ids } } },
        { $group: { _id: { bookId: '$bookId', status: '$status' }, n: { $sum: 1 } } },
      ]).exec(),
      ChequeLeafModel.aggregate<{ _id: Types.ObjectId; chequeNumber: string }>([
        { $match: { bookId: { $in: ids }, status: ChequeLeafStatus.AVAILABLE } },
        { $sort: { sequence: 1 } },
        { $group: { _id: '$bookId', chequeNumber: { $first: '$chequeNumber' } } },
      ]).exec(),
    ]);
    const countOf = (bookId: Types.ObjectId, status: string) =>
      counts.find((row) => row._id.bookId.equals(bookId) && row._id.status === status)?.n ?? 0;
    return books.map((book) => ({
      id: book.id,
      treasuryId: book.treasuryId.toString(),
      bankAccountCode: book.bankAccountCode,
      bankName: book.bankName,
      bookName: book.bookName,
      prefix: book.prefix ?? '',
      startNumber: book.startNumber,
      endNumber: book.endNumber,
      leafCount: book.leafCount,
      receivedDate: book.receivedDate ? book.receivedDate.toISOString().slice(0, 10) : null,
      notes: book.notes ?? null,
      availableCount: countOf(book._id, ChequeLeafStatus.AVAILABLE),
      issuedCount: countOf(book._id, ChequeLeafStatus.ISSUED),
      cancelledCount: countOf(book._id, ChequeLeafStatus.CANCELLED),
      nextAvailable: next.find((row) => row._id.equals(book._id))?.chequeNumber ?? null,
      createdAt: book.createdAt ? book.createdAt.toISOString() : null,
    }));
  }

  private async toPublicLeaves(leaves: ChequeLeafDocument[]): Promise<PublicChequeLeaf[]> {
    if (leaves.length === 0) return [];
    const bookIds = [...new Set(leaves.map((leaf) => leaf.bookId.toString()))];
    const journalIds = leaves
      .map((leaf) => leaf.journalId)
      .filter((id): id is Types.ObjectId => Boolean(id));
    const [books, journals] = await Promise.all([
      ChequeBookModel.find({ _id: { $in: bookIds } })
        .select('bookName bankName')
        .lean()
        .exec(),
      journalIds.length
        ? JournalEntryModel.find({ _id: { $in: journalIds } })
            .select('status pdcStatus')
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);
    const bookById = new Map(books.map((book) => [book._id.toString(), book]));
    const journalById = new Map(
      journals.map((journal) => [journal._id.toString(), journal as { status?: string; pdcStatus?: string }]),
    );
    return leaves.map((leaf) => {
      const book = bookById.get(leaf.bookId.toString());
      const journal = leaf.journalId ? journalById.get(leaf.journalId.toString()) : undefined;
      return {
        id: leaf.id,
        bookId: leaf.bookId.toString(),
        bookName: book?.bookName ?? '',
        treasuryId: leaf.treasuryId.toString(),
        bankAccountCode: leaf.bankAccountCode,
        bankName: book?.bankName ?? leaf.bankAccountCode,
        chequeNumber: leaf.chequeNumber,
        sequence: leaf.sequence,
        status: leaf.status,
        journalId: leaf.journalId ? leaf.journalId.toString() : null,
        journalNumber: leaf.journalNumber ?? null,
        journalStatus: journal?.status ?? null,
        pdcStatus: journal?.pdcStatus ?? null,
        issuedAt: leaf.issuedAt ? leaf.issuedAt.toISOString() : null,
        payeeName: leaf.payeeName ?? null,
        amount: leaf.amountMinor != null ? fromMinorUnits(leaf.amountMinor) : null,
        chequeDate: leaf.chequeDate ? leaf.chequeDate.toISOString().slice(0, 10) : null,
        cancelReason: leaf.cancelReason ?? null,
        cancelledAt: leaf.cancelledAt ? leaf.cancelledAt.toISOString() : null,
      };
    });
  }
}
