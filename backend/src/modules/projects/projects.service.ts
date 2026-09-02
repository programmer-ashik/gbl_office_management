import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { AccountType } from '../../common/enums/account-type.enum';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors/app-error';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fromMinorUnits, toMinorUnits } from '../../common/utils/money';
import { LedgerLineModel } from '../accounting/ledger.model';
import { CounterModel } from '../accounting/counter.model';
import { UserModel } from '../users/user.model';
import type {
  CreateProjectDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { ProjectModel, type ProjectDocument } from './project.model';
import {
  computeProjectFinancials,
  emptyFinancials,
  type AccountRollup,
  type ProjectFinancials,
} from './profitability';

export type PublicClient = {
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type PublicProject = {
  id: string;
  code: string;
  name: string;
  client: PublicClient;
  startDate: string;
  endDate: string | null;
  contractValue: number;
  totalBudget: number;
  status: ProjectStatus;
  managerId: string | null;
  description: string | null;
  createdAt: string | null;
  financials: ProjectFinancials;
};

export class ProjectsService {
  toPublic(
    project: ProjectDocument,
    financials?: ProjectFinancials,
  ): PublicProject {
    return {
      id: project._id.toString(),
      code: project.code,
      name: project.name,
      client: {
        name: project.client.name,
        contactName: project.client.contactName ?? null,
        email: project.client.email ?? null,
        phone: project.client.phone ?? null,
        address: project.client.address ?? null,
      },
      startDate: project.startDate.toISOString(),
      endDate: project.endDate ? project.endDate.toISOString() : null,
      contractValue:
        financials?.contractValue ?? fromMinorUnits(project.contractValueMinor),
      totalBudget:
        financials?.totalBudget ?? fromMinorUnits(project.totalBudgetMinor),
      status: project.status,
      managerId: project.managerId ? project.managerId.toString() : null,
      description: project.description ?? null,
      createdAt: project.createdAt ? project.createdAt.toISOString() : null,
      financials:
        financials ??
        emptyFinancials(project.contractValueMinor, project.totalBudgetMinor),
    };
  }

  async create(dto: CreateProjectDto, userId: string): Promise<PublicProject> {
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertManager(dto.managerId);

    const project = await ProjectModel.create({
      code: await this.nextProjectCode(new Date(dto.startDate)),
      name: dto.name.trim(),
      client: this.normalizeClient(dto.client),
      startDate: new Date(dto.startDate),
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      contractValueMinor: toMinorUnits(dto.contractValue),
      totalBudgetMinor: toMinorUnits(dto.totalBudget),
      status: dto.status ?? ProjectStatus.PLANNING,
      managerId: dto.managerId ? new Types.ObjectId(dto.managerId) : undefined,
      description: dto.description?.trim(),
      createdBy: new Types.ObjectId(userId),
    });

    return this.toPublic(project);
  }

  async list(
    status?: ProjectStatus,
    actor?: AuthenticatedUser,
  ): Promise<PublicProject[]> {
    const filter: Record<string, unknown> = status ? { status } : {};
    if (actor?.role === Role.PROJECT_MANAGER) {
      filter.managerId = new Types.ObjectId(actor.userId);
    }
    const projects = await ProjectModel.find(filter)
      .sort({ startDate: -1, code: -1 })
      .exec();
    const financialsById = await this.aggregateFinancials(
      projects.map((project) => project._id),
    );

    return projects.map((project) =>
      this.toPublic(
        project,
        financialsById.get(project._id.toString()) ??
          emptyFinancials(project.contractValueMinor, project.totalBudgetMinor),
      ),
    );
  }

  async getById(id: string, actor?: AuthenticatedUser): Promise<PublicProject> {
    const project = await this.findByIdOrFail(id);
    if (actor) {
      this.assertCanAccessProject(actor, project);
    }
    const financialsById = await this.aggregateFinancials([project._id]);
    return this.toPublic(
      project,
      financialsById.get(project._id.toString()) ??
        emptyFinancials(project.contractValueMinor, project.totalBudgetMinor),
    );
  }

  async profitability(id: string, actor?: AuthenticatedUser): Promise<PublicProject> {
    return this.getById(id, actor);
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    actor?: AuthenticatedUser,
  ): Promise<PublicProject> {
    const project = await this.findByIdOrFail(id);
    if (actor) {
      this.assertCanAccessProject(actor, project);
    }
    const startDate = dto.startDate ?? project.startDate.toISOString();
    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
        : project.endDate?.toISOString();
    this.assertDateRange(startDate, endDate);
    await this.assertManager(dto.managerId);

    if (dto.name) project.name = dto.name.trim();
    if (dto.client) {
      project.client = this.normalizeClient({
        name: dto.client.name,
        contactName: dto.client.contactName ?? project.client.contactName,
        email: dto.client.email ?? project.client.email,
        phone: dto.client.phone ?? project.client.phone,
        address: dto.client.address ?? project.client.address,
      });
    }
    if (dto.startDate) project.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) {
      project.endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    }
    if (dto.contractValue !== undefined) {
      project.contractValueMinor = toMinorUnits(dto.contractValue);
    }
    if (dto.totalBudget !== undefined) {
      project.totalBudgetMinor = toMinorUnits(dto.totalBudget);
    }
    if (dto.managerId !== undefined) {
      project.managerId = dto.managerId
        ? new Types.ObjectId(dto.managerId)
        : undefined;
    }
    if (dto.description !== undefined) {
      project.description = dto.description.trim();
    }

    await project.save();
    return this.getById(id, actor);
  }

  async updateStatus(
    id: string,
    status: ProjectStatus,
    actor?: AuthenticatedUser,
  ): Promise<PublicProject> {
    const project = await this.findByIdOrFail(id);
    if (actor) {
      this.assertCanAccessProject(actor, project);
    }
    project.status = status;
    await project.save();
    return this.getById(id, actor);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const project = await this.findByIdOrFail(id);
    const posted = await LedgerLineModel.exists({ projectId: project._id });
    if (posted) {
      throw conflict(
        'Cannot delete a project with posted journal activity; mark it completed instead',
      );
    }
    await project.deleteOne();
    return { deleted: true };
  }

  async findByIdOrFail(id: string): Promise<ProjectDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw notFound('Project not found');
    }
    const project = await ProjectModel.findById(id).exec();
    if (!project) {
      throw notFound('Project not found');
    }
    return project;
  }

  async listOptions(
    actor?: AuthenticatedUser,
  ): Promise<
    Array<{ id: string; code: string; name: string; status: ProjectStatus }>
  > {
    const filter =
      actor?.role === Role.PROJECT_MANAGER
        ? { managerId: new Types.ObjectId(actor.userId) }
        : {};
    const projects = await ProjectModel.find(filter)
      .select('code name status')
      .sort({ startDate: -1, code: -1 })
      .exec();
    return projects.map((project) => ({
      id: project._id.toString(),
      code: project.code,
      name: project.name,
      status: project.status,
    }));
  }

  assertCanAccessProject(
    actor: AuthenticatedUser,
    project: ProjectDocument | { managerId?: Types.ObjectId | null },
  ): void {
    if (actor.role === Role.ADMIN || actor.role === Role.ACCOUNTANT) {
      return;
    }
    if (actor.role === Role.PROJECT_MANAGER) {
      const managerId = project.managerId?.toString();
      if (managerId && managerId === actor.userId) {
        return;
      }
      throw forbidden('You can only access projects assigned to you');
    }
    throw forbidden('You do not have access to this project');
  }

  async assertCanAccessProjectId(
    actor: AuthenticatedUser,
    projectId: string,
  ): Promise<void> {
    if (actor.role === Role.ADMIN || actor.role === Role.ACCOUNTANT) {
      return;
    }
    const project = await this.findByIdOrFail(projectId);
    this.assertCanAccessProject(actor, project);
  }

  async managedProjectIds(actor: AuthenticatedUser): Promise<Types.ObjectId[]> {
    if (actor.role !== Role.PROJECT_MANAGER) {
      return [];
    }
    const rows = await ProjectModel.find({
      managerId: new Types.ObjectId(actor.userId),
    })
      .select('_id')
      .exec();
    return rows.map((row) => row._id);
  }

  async assertExists(id: string, session?: ClientSession): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw badRequest('Invalid project id');
    }
    const exists = await ProjectModel.findById(id)
      .session(session ?? null)
      .select('_id')
      .exec();
    if (!exists) {
      throw notFound('Project not found');
    }
  }

  private normalizeClient(client: CreateProjectDto['client']) {
    return {
      name: client.name.trim(),
      contactName: client.contactName?.trim(),
      email: client.email?.trim().toLowerCase(),
      phone: client.phone?.trim(),
      address: client.address?.trim(),
    };
  }

  private assertDateRange(startDate: string, endDate?: string): void {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      throw badRequest('Invalid start date');
    }
    if (!endDate) {
      return;
    }
    const end = new Date(endDate);
    if (Number.isNaN(end.getTime())) {
      throw badRequest('Invalid end date');
    }
    if (end < start) {
      throw badRequest('End date cannot be before start date');
    }
  }

  private async assertManager(managerId?: string): Promise<void> {
    if (!managerId) {
      return;
    }
    if (!Types.ObjectId.isValid(managerId)) {
      throw badRequest('Invalid manager id');
    }
    const user = await UserModel.findById(managerId).exec();
    if (!user || !user.isActive) {
      throw notFound('Project manager not found');
    }
    if (user.role !== Role.PROJECT_MANAGER && user.role !== Role.ADMIN) {
      throw badRequest('Assigned manager must be a project manager or admin');
    }
  }

  private async nextProjectCode(date: Date): Promise<string> {
    const year = date.getUTCFullYear();
    const counter = await CounterModel.findOneAndUpdate(
      { key: `project:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const seq = counter?.seq ?? 1;
    return `PRJ-${year}-${String(seq).padStart(5, '0')}`;
  }

  private async aggregateFinancials(
    projectIds: Types.ObjectId[],
  ): Promise<Map<string, ProjectFinancials>> {
    const result = new Map<string, ProjectFinancials>();
    if (projectIds.length === 0) {
      return result;
    }

    const projects = await ProjectModel.find({ _id: { $in: projectIds } })
      .select('_id contractValueMinor totalBudgetMinor')
      .exec();
    const byId = new Map(
      projects.map((project) => [project._id.toString(), project]),
    );

    const rows = await LedgerLineModel.aggregate<{
      _id: { projectId: Types.ObjectId; accountCode: string };
      accountName: string;
      accountType: AccountType;
      debitMinor: number;
      creditMinor: number;
    }>([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: { projectId: '$projectId', accountCode: '$accountCode' },
          accountName: { $first: '$accountName' },
          accountType: { $first: '$accountType' },
          debitMinor: { $sum: '$debitMinor' },
          creditMinor: { $sum: '$creditMinor' },
        },
      },
    ]);

    const rollupsByProject = new Map<string, AccountRollup[]>();
    for (const row of rows) {
      const projectId = row._id.projectId.toString();
      const list = rollupsByProject.get(projectId) ?? [];
      list.push({
        accountCode: row._id.accountCode,
        accountName: row.accountName,
        accountType: row.accountType,
        debitMinor: row.debitMinor,
        creditMinor: row.creditMinor,
      });
      rollupsByProject.set(projectId, list);
    }

    for (const [id, project] of byId) {
      result.set(
        id,
        computeProjectFinancials(
          project.contractValueMinor,
          project.totalBudgetMinor,
          rollupsByProject.get(id) ?? [],
        ),
      );
    }

    return result;
  }
}
