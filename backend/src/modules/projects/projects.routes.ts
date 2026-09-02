import { Router } from 'express';
import { ProjectStatus } from '../../common/enums/project-status.enum';
import { Role } from '../../common/enums/role.enum';
import { badRequest } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectStatusDto,
} from './dto/project.dto';
import type { ProjectsService } from './projects.service';

const PROJECT_ROLES = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
] as const;

export function createProjectsRouter(
  projectsService: ProjectsService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...PROJECT_ROLES),
    asyncHandler(async (req, res) => {
      const raw = req.query.status;
      let status: ProjectStatus | undefined;
      if (typeof raw === 'string' && raw.length > 0) {
        if (!Object.values(ProjectStatus).includes(raw as ProjectStatus)) {
          throw badRequest('Invalid project status');
        }
        status = raw as ProjectStatus;
      }
      const projects = await projectsService.list(status, req.user!);
      sendSuccess(res, projects, 'Projects retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...PROJECT_ROLES),
    validateBody(CreateProjectDto),
    asyncHandler(async (req, res) => {
      const project = await projectsService.create(req.body, req.user!.userId);
      sendSuccess(res, project, 'Project created successfully', 201);
    }),
  );

  router.get(
    '/:id/profitability',
    auth,
    requireRoles(...PROJECT_ROLES),
    asyncHandler(async (req, res) => {
      const project = await projectsService.profitability(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, project, 'Project profitability retrieved successfully');
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...PROJECT_ROLES),
    asyncHandler(async (req, res) => {
      const project = await projectsService.getById(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, project, 'Project retrieved successfully');
    }),
  );

  router.patch(
    '/:id/status',
    auth,
    requireRoles(...PROJECT_ROLES),
    validateBody(UpdateProjectStatusDto),
    asyncHandler(async (req, res) => {
      const project = await projectsService.updateStatus(
        String(req.params.id),
        req.body.status,
        req.user!,
      );
      sendSuccess(res, project, 'Project status updated successfully');
    }),
  );

  router.patch(
    '/:id',
    auth,
    requireRoles(...PROJECT_ROLES),
    validateBody(UpdateProjectDto),
    asyncHandler(async (req, res) => {
      const project = await projectsService.update(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, project, 'Project updated successfully');
    }),
  );

  router.delete(
    '/:id',
    auth,
    requireRoles(Role.ADMIN),
    asyncHandler(async (req, res) => {
      const result = await projectsService.remove(String(req.params.id));
      sendSuccess(res, result, 'Project deleted successfully');
    }),
  );

  return router;
}
