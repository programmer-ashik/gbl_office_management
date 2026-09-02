import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import {
  ApprovalEntityType,
  ApprovalStatus,
  ApprovalStepRole,
} from '../../common/enums/governance.enum';

export interface IApprovalStep {
  role: ApprovalStepRole;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  actorId?: Types.ObjectId;
  actorEmail?: string;
  decidedAt?: Date;
  note?: string;
}

export interface IApprovalRequest {
  requestNumber: string;
  status: ApprovalStatus;
  entityType: ApprovalEntityType;
  amountMinor: number;
  currency: string;
  summary: string;
  projectId?: Types.ObjectId;
  projectCode?: string;
  payload: Record<string, unknown>;
  steps: IApprovalStep[];
  currentStepIndex: number;
  requestedBy: Types.ObjectId;
  requestedByEmail: string;
  executedAt?: Date;
  executedBy?: Types.ObjectId;
  resultRef?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ApprovalRequestDocument = HydratedDocument<IApprovalRequest>;

const approvalStepSchema = new Schema<IApprovalStep>(
  {
    role: {
      type: String,
      required: true,
      enum: Object.values(ApprovalStepRole),
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'approved', 'rejected', 'skipped'],
      default: 'pending',
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail: { type: String },
    decidedAt: { type: Date },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const approvalRequestSchema = new Schema<IApprovalRequest>(
  {
    requestNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(ApprovalStatus),
      default: ApprovalStatus.PENDING,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: Object.values(ApprovalEntityType),
      index: true,
    },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, default: 'BDT' },
    summary: { type: String, required: true, maxlength: 500 },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    projectCode: { type: String },
    payload: { type: Schema.Types.Mixed, required: true },
    steps: { type: [approvalStepSchema], required: true },
    currentStepIndex: { type: Number, required: true, default: 0 },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedByEmail: { type: String, required: true },
    executedAt: { type: Date },
    executedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resultRef: { type: String },
  },
  { timestamps: true, collection: 'approval_requests' },
);

approvalRequestSchema.index({ status: 1, createdAt: -1 });

export const ApprovalRequestModel =
  (models.ApprovalRequest as Model<IApprovalRequest> | undefined) ??
  model<IApprovalRequest>('ApprovalRequest', approvalRequestSchema);
