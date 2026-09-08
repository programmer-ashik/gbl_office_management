import { Types } from 'mongoose';
import {
  ApprovalEntityType,
  ApprovalStatus,
  ApprovalStepRole,
  APPROVAL_THRESHOLD,
} from '../../common/enums/governance.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, forbidden, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { CounterModel } from '../accounting/counter.model';
import type { ProjectsService } from '../projects/projects.service';
import {
  ApprovalRequestModel,
  type ApprovalRequestDocument,
  type IApprovalStep,
} from './approval-request.model';
import type { AuditService } from './audit.service';
import { AuditAction } from '../../common/enums/governance.enum';

export type PublicApprovalStep = {
  role: ApprovalStepRole;
  status: string;
  actorEmail: string | null;
  decidedAt: string | null;
  note: string | null;
};

export type PublicApproval = {
  id: string;
  requestNumber: string;
  status: ApprovalStatus;
  entityType: ApprovalEntityType;
  amount: number;
  summary: string;
  projectId: string | null;
  projectCode: string | null;
  payload: Record<string, unknown>;
  steps: PublicApprovalStep[];
  currentStepIndex: number;
  requestedByEmail: string;
  resultRef: string | null;
  executedAt: string | null;
  createdAt: string | null;
};

export type CreateApprovalInput = {
  entityType: ApprovalEntityType;
  amount: number;
  summary: string;
  payload: Record<string, unknown>;
  projectId?: string;
  projectCode?: string;
};

/** Pure step builder — with projectId adds PM; otherwise accountant → admin only. */
export function buildApprovalSteps(hasProject: boolean): IApprovalStep[] {
  const steps: IApprovalStep[] = [];
  if (hasProject) {
    steps.push({
      role: ApprovalStepRole.PROJECT_MANAGER,
      status: 'pending',
    });
  }
  steps.push(
    { role: ApprovalStepRole.ACCOUNTANT, status: 'pending' },
    { role: ApprovalStepRole.ADMIN, status: 'pending' },
  );
  return steps;
}

export class ApprovalService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
  ) {}

  requiresApproval(amount: number): boolean {
    return amount >= APPROVAL_THRESHOLD;
  }

  toPublic(row: ApprovalRequestDocument): PublicApproval {
    return {
      id: row._id.toString(),
      requestNumber: row.requestNumber,
      status: row.status,
      entityType: row.entityType,
      amount: fromMinorUnits(row.amountMinor),
      summary: row.summary,
      projectId: row.projectId ? row.projectId.toString() : null,
      projectCode: row.projectCode ?? null,
      payload: row.payload as Record<string, unknown>,
      steps: row.steps.map((step) => ({
        role: step.role,
        status: step.status,
        actorEmail: step.actorEmail ?? null,
        decidedAt: step.decidedAt ? step.decidedAt.toISOString() : null,
        note: step.note ?? null,
      })),
      currentStepIndex: row.currentStepIndex,
      requestedByEmail: row.requestedByEmail,
      resultRef: row.resultRef ?? null,
      executedAt: row.executedAt ? row.executedAt.toISOString() : null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
  }

  async list(actor: AuthenticatedUser): Promise<PublicApproval[]> {
    this.assertCanView(actor);
    const filter =
      actor.role === Role.PROJECT_MANAGER
        ? {
            $or: [
              { requestedBy: new Types.ObjectId(actor.userId) },
              {
                status: ApprovalStatus.PENDING,
                'steps.role': ApprovalStepRole.PROJECT_MANAGER,
              },
            ],
          }
        : {};
    const rows = await ApprovalRequestModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return rows.map((row) => this.toPublic(row));
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<PublicApproval> {
    this.assertCanView(actor);
    return this.toPublic(await this.findOrFail(id));
  }

  async create(
    input: CreateApprovalInput,
    actor: AuthenticatedUser,
  ): Promise<PublicApproval> {
    if (!this.requiresApproval(input.amount)) {
      throw badRequest(
        `Approval is only required for amounts of ${APPROVAL_THRESHOLD} or more`,
      );
    }

    let projectCode = input.projectCode;
    if (input.projectId) {
      const project = await this.projectsService.getById(input.projectId);
      projectCode = project.code;
    }

    const steps = this.buildSteps(Boolean(input.projectId));
    const created = await ApprovalRequestModel.create({
      requestNumber: await this.nextNumber(),
      status: ApprovalStatus.PENDING,
      entityType: input.entityType,
      amountMinor: toMinorUnits(input.amount),
      currency: 'BDT',
      summary: input.summary.trim(),
      projectId: input.projectId
        ? new Types.ObjectId(input.projectId)
        : undefined,
      projectCode,
      payload: input.payload,
      steps,
      currentStepIndex: 0,
      requestedBy: new Types.ObjectId(actor.userId),
      requestedByEmail: actor.email,
    });

    await this.auditService.record({
      action: AuditAction.CREATE,
      entityType: 'approval_request',
      entityId: created._id.toString(),
      actor,
      summary: `Approval requested: ${created.requestNumber}`,
      after: this.toPublic(created) as unknown as Record<string, unknown>,
    });

    return this.toPublic(created);
  }

  async approve(
    id: string,
    actor: AuthenticatedUser,
    note?: string,
  ): Promise<PublicApproval> {
    const row = await this.findOrFail(id);
    if (row.status !== ApprovalStatus.PENDING) {
      throw badRequest('Only pending approvals can be decided');
    }

    const step = row.steps[row.currentStepIndex];
    if (!step || step.status !== 'pending') {
      throw badRequest('No pending approval step');
    }
    this.assertCanDecideStep(actor, step.role);

    step.status = 'approved';
    step.actorId = new Types.ObjectId(actor.userId);
    step.actorEmail = actor.email;
    step.decidedAt = new Date();
    step.note = note?.trim();

    const nextIndex = row.currentStepIndex + 1;
    if (nextIndex >= row.steps.length) {
      row.status = ApprovalStatus.APPROVED;
      row.currentStepIndex = row.steps.length - 1;
    } else {
      row.currentStepIndex = nextIndex;
    }
    await row.save();

    await this.auditService.record({
      action: AuditAction.UPDATE,
      entityType: 'approval_request',
      entityId: row._id.toString(),
      actor,
      summary: `Approval step approved: ${row.requestNumber}`,
      after: this.toPublic(row) as unknown as Record<string, unknown>,
    });

    return this.toPublic(row);
  }

  async reject(
    id: string,
    actor: AuthenticatedUser,
    note?: string,
  ): Promise<PublicApproval> {
    const row = await this.findOrFail(id);
    if (row.status !== ApprovalStatus.PENDING) {
      throw badRequest('Only pending approvals can be decided');
    }

    const step = row.steps[row.currentStepIndex];
    if (!step || step.status !== 'pending') {
      throw badRequest('No pending approval step');
    }
    this.assertCanDecideStep(actor, step.role);

    step.status = 'rejected';
    step.actorId = new Types.ObjectId(actor.userId);
    step.actorEmail = actor.email;
    step.decidedAt = new Date();
    step.note = note?.trim() || 'Rejected';
    row.status = ApprovalStatus.REJECTED;
    await row.save();

    await this.auditService.record({
      action: AuditAction.UPDATE,
      entityType: 'approval_request',
      entityId: row._id.toString(),
      actor,
      summary: `Approval rejected: ${row.requestNumber}`,
      after: this.toPublic(row) as unknown as Record<string, unknown>,
    });

    return this.toPublic(row);
  }

  async markExecuted(
    id: string,
    actor: AuthenticatedUser,
    resultRef: string,
  ): Promise<PublicApproval> {
    const row = await this.findOrFail(id);
    if (row.status !== ApprovalStatus.APPROVED) {
      throw badRequest('Only fully approved requests can be executed');
    }
    row.status = ApprovalStatus.EXECUTED;
    row.executedAt = new Date();
    row.executedBy = new Types.ObjectId(actor.userId);
    row.resultRef = resultRef;
    await row.save();

    await this.auditService.record({
      action: AuditAction.UPDATE,
      entityType: 'approval_request',
      entityId: row._id.toString(),
      actor,
      summary: `Approval executed: ${row.requestNumber} → ${resultRef}`,
      after: this.toPublic(row) as unknown as Record<string, unknown>,
    });

    return this.toPublic(row);
  }

  async requireApprovedOrCreate(
    input: CreateApprovalInput,
    actor: AuthenticatedUser,
    existingApprovalId?: string,
  ): Promise<{ allowed: true } | { allowed: false; approval: PublicApproval }> {
    if (!this.requiresApproval(input.amount)) {
      return { allowed: true };
    }

    if (existingApprovalId) {
      const row = await this.findOrFail(existingApprovalId);
      if (row.status === ApprovalStatus.APPROVED) {
        return { allowed: true };
      }
      if (row.status === ApprovalStatus.EXECUTED) {
        throw badRequest('This approval was already executed');
      }
      if (row.status === ApprovalStatus.REJECTED) {
        throw badRequest('This approval was rejected');
      }
      return { allowed: false, approval: this.toPublic(row) };
    }

    const approval = await this.create(input, actor);
    return { allowed: false, approval };
  }

  private buildSteps(hasProject: boolean): IApprovalStep[] {
    return buildApprovalSteps(hasProject);
  }

  private assertCanDecideStep(
    actor: AuthenticatedUser,
    stepRole: ApprovalStepRole,
  ): void {
    if (stepRole === ApprovalStepRole.ADMIN && actor.role !== Role.ADMIN) {
      throw forbidden('Admin approval required for this step');
    }
    if (
      stepRole === ApprovalStepRole.ACCOUNTANT &&
      actor.role !== Role.ACCOUNTANT &&
      actor.role !== Role.ADMIN
    ) {
      throw forbidden('Accountant approval required for this step');
    }
    if (
      stepRole === ApprovalStepRole.PROJECT_MANAGER &&
      actor.role !== Role.PROJECT_MANAGER &&
      actor.role !== Role.ADMIN
    ) {
      throw forbidden('Project manager approval required for this step');
    }
  }

  private assertCanView(actor: AuthenticatedUser): void {
    if (
      actor.role !== Role.ADMIN &&
      actor.role !== Role.ACCOUNTANT &&
      actor.role !== Role.PROJECT_MANAGER
    ) {
      throw forbidden('You do not have permission to view approvals');
    }
  }

  private async findOrFail(id: string): Promise<ApprovalRequestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Approval request not found');
    }
    const row = await ApprovalRequestModel.findById(id).exec();
    if (!row) {
      throw notFound('Approval request not found');
    }
    return row;
  }

  private async nextNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `approval:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    return `APR-${year}-${String(seq).padStart(5, '0')}`;
  }
}
