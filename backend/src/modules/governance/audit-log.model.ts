import { HydratedDocument, Model, Schema, Types, model, models } from 'mongoose';
import { AuditAction } from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';

export interface IAuditLog {
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorId: Types.ObjectId;
  actorEmail: string;
  actorRole: Role;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  summary: string;
  createdAt?: Date;
}

export type AuditLogDocument = HydratedDocument<IAuditLog>;

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: {
      type: String,
      required: true,
      enum: Object.values(AuditAction),
      index: true,
    },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, required: true, index: true },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actorEmail: { type: String, required: true },
    actorRole: {
      type: String,
      required: true,
      enum: Object.values(Role),
    },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    summary: { type: String, required: true, maxlength: 500 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'audit_logs',
  },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

// Immutable: block updates and deletes at the schema level
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('updateMany', function () {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('deleteOne', function () {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('deleteMany', function () {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('findOneAndDelete', function () {
  throw new Error('Audit logs are immutable');
});

export const AuditLogModel =
  (models.AuditLog as Model<IAuditLog> | undefined) ??
  model<IAuditLog>('AuditLog', auditLogSchema);
