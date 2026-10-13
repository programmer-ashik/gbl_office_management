import { HydratedDocument, Model, Schema, model, models } from 'mongoose';

/** Receivable parties owe us; payable parties are owed by us. */
export const OTHER_PARTY_KINDS = ['receivable', 'payable'] as const;

export type OtherPartyKind = (typeof OTHER_PARTY_KINDS)[number];

export interface IOtherParty {
  name: string;
  kind: OtherPartyKind;
  phone?: string;
  note?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OtherPartyDocument = HydratedDocument<IOtherParty>;

const otherPartySchema = new Schema<IOtherParty>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    kind: { type: String, required: true, enum: OTHER_PARTY_KINDS, index: true },
    phone: { type: String, trim: true, maxlength: 40 },
    note: { type: String, trim: true, maxlength: 240 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, collection: 'other_parties' },
);

otherPartySchema.index({ kind: 1, name: 1 });

export const OtherPartyModel =
  (models.OtherParty as Model<IOtherParty> | undefined) ??
  model<IOtherParty>('OtherParty', otherPartySchema);
