import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';

export type StatementLineStatus = 'unmatched' | 'matched' | 'ignored';
export type ReconciliationStatus = 'open' | 'completed';

export interface IStatementLine {
  _id?: Types.ObjectId;
  date: Date;
  description: string;
  amountMinor: number;
  reference?: string;
  status: StatementLineStatus;
  matchedLedgerLineId?: Types.ObjectId;
}

export interface IReconciliation {
  reconciliationNumber: string;
  treasuryAccountId: Types.ObjectId;
  glAccountCode: string;
  asOf: Date;
  statementBalanceMinor: number;
  status: ReconciliationStatus;
  lines: IStatementLine[];
  createdBy: Types.ObjectId;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ReconciliationDocument = HydratedDocument<IReconciliation>;

const statementLineSchema = new Schema<IStatementLine>(
  {
    date: { type: Date, required: true },
    description: { type: String, required: true, trim: true, maxlength: 240 },
    amountMinor: { type: Number, required: true },
    reference: { type: String, trim: true, maxlength: 80 },
    status: {
      type: String,
      required: true,
      enum: ['unmatched', 'matched', 'ignored'],
      default: 'unmatched',
    },
    matchedLedgerLineId: { type: Schema.Types.ObjectId, ref: 'LedgerLine' },
  },
  { _id: true },
);

const reconciliationSchema = new Schema<IReconciliation>(
  {
    reconciliationNumber: { type: String, required: true, unique: true },
    treasuryAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'TreasuryAccount',
      required: true,
      index: true,
    },
    glAccountCode: { type: String, required: true },
    asOf: { type: Date, required: true },
    statementBalanceMinor: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['open', 'completed'],
      default: 'open',
      index: true,
    },
    lines: { type: [statementLineSchema], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'reconciliations' },
);

export const ReconciliationModel =
  (models.Reconciliation as Model<IReconciliation> | undefined) ??
  model<IReconciliation>('Reconciliation', reconciliationSchema);
