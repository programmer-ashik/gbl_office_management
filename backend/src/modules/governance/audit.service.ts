import { Types } from 'mongoose';
import { AuditAction } from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';
import { forbidden } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditLogModel, type AuditLogDocument } from './audit-log.model';

export type AuditWriteInput = {
  action: AuditAction;
  entityType: string;
  entityId: string;
  actor: AuthenticatedUser | { userId: string; email: string; role: Role };
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export type PublicAuditLog = {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  actorId: string;
  actorEmail: string;
  actorRole: Role;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  summary: string;
  createdAt: string;
};

export class AuditService {
  toPublic(row: AuditLogDocument): PublicAuditLog {
    return {
      id: row._id.toString(),
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId.toString(),
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      before: (row.before as Record<string, unknown> | undefined) ?? null,
      after: (row.after as Record<string, unknown> | undefined) ?? null,
      summary: row.summary,
      createdAt: row.createdAt
        ? row.createdAt.toISOString()
        : new Date().toISOString(),
    };
  }

  async record(input: AuditWriteInput): Promise<PublicAuditLog> {
    const created = await AuditLogModel.create({
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: new Types.ObjectId(input.actor.userId),
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      summary: input.summary.slice(0, 500),
    });
    return this.toPublic(created);
  }

  async list(
    actor: AuthenticatedUser,
    options?: { entityType?: string; limit?: number },
  ): Promise<PublicAuditLog[]> {
    if (actor.role !== Role.ADMIN && actor.role !== Role.ACCOUNTANT) {
      throw forbidden('Finance role required to view audit logs');
    }
    const filter = options?.entityType
      ? { entityType: options.entityType }
      : {};
    const rows = await AuditLogModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(options?.limit ?? 100)
      .exec();
    return rows.map((row) => this.toPublic(row));
  }

  async listForEntity(
    entityType: string,
    entityId: string,
    actor: AuthenticatedUser,
  ): Promise<PublicAuditLog[]> {
    if (actor.role !== Role.ADMIN && actor.role !== Role.ACCOUNTANT) {
      throw forbidden('Finance role required to view audit logs');
    }
    const rows = await AuditLogModel.find({ entityType, entityId })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return rows.map((row) => this.toPublic(row));
  }
}
