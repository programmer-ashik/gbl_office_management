import { Types } from 'mongoose';
import { badRequest, notFound } from '../../common/errors/app-error';
import { fromMinorUnits } from '../../common/utils/money';
import { JournalEntityType } from '../accounting/journal.enums';
import { LedgerLineModel } from '../accounting/ledger.model';
import type { CreateOtherPartyDto, UpdateOtherPartyDto } from './dto/other-party.dto';
import {
  OtherPartyModel,
  type OtherPartyDocument,
  type OtherPartyKind,
} from './other-party.model';

export type PublicOtherParty = {
  id: string;
  name: string;
  kind: OtherPartyKind;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  /** Posted balance on its natural side (owed to us / owed by us). */
  balance: number;
};

function toPublic(doc: OtherPartyDocument, balanceMinor = 0): PublicOtherParty {
  return {
    id: doc._id.toString(),
    name: doc.name,
    kind: doc.kind,
    phone: doc.phone ?? null,
    note: doc.note ?? null,
    isActive: doc.isActive,
    balance: fromMinorUnits(balanceMinor),
  };
}

export class OtherPartiesService {
  async list(filters: { kind?: OtherPartyKind; activeOnly?: boolean } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.kind) query.kind = filters.kind;
    if (filters.activeOnly) query.isActive = true;
    const rows = await OtherPartyModel.find(query).sort({ name: 1 }).exec();
    if (rows.length === 0) return [];

    const totals = await LedgerLineModel.aggregate<{
      _id: Types.ObjectId;
      debit: number;
      credit: number;
    }>([
      {
        $match: {
          entityType: JournalEntityType.OTHER,
          entityId: { $in: rows.map((row) => row._id) },
        },
      },
      {
        $group: {
          _id: '$entityId',
          debit: { $sum: '$debitMinor' },
          credit: { $sum: '$creditMinor' },
        },
      },
    ]);
    const byId = new Map(totals.map((row) => [row._id.toString(), row]));

    return rows.map((row) => {
      const total = byId.get(row._id.toString());
      const net = total ? total.debit - total.credit : 0;
      return toPublic(row, row.kind === 'receivable' ? net : -net);
    });
  }

  async create(dto: CreateOtherPartyDto): Promise<PublicOtherParty> {
    const name = dto.name.trim();
    const duplicate = await OtherPartyModel.exists({
      kind: dto.kind,
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (duplicate) {
      throw badRequest(`${name} is already in the ${dto.kind} list`);
    }
    const row = await OtherPartyModel.create({
      name,
      kind: dto.kind,
      phone: dto.phone?.trim() || undefined,
      note: dto.note?.trim() || undefined,
      isActive: true,
    });
    return toPublic(row);
  }

  async update(id: string, dto: UpdateOtherPartyDto): Promise<PublicOtherParty> {
    const row = await this.findOrFail(id);
    if (dto.name) row.name = dto.name.trim();
    if (dto.phone !== undefined) row.phone = dto.phone.trim() || undefined;
    if (dto.note !== undefined) row.note = dto.note.trim() || undefined;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    await row.save();
    const [withBalance] = await this.list({ kind: row.kind }).then((rows) =>
      rows.filter((item) => item.id === row._id.toString()),
    );
    return withBalance ?? toPublic(row);
  }

  async findOrFail(id: string): Promise<OtherPartyDocument> {
    if (!Types.ObjectId.isValid(id)) throw badRequest('Invalid party id');
    const row = await OtherPartyModel.findById(id).exec();
    if (!row) throw notFound('Party not found');
    return row;
  }
}
