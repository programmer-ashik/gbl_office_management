import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AdvancesService } from '../advances/advances.service';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import { CreateEmployeeDto } from './dto/employee.dto';
import type { EmployeesService } from './employees.service';

export function createEmployeesRouter(
  employeesService: EmployeesService,
  advancesService: AdvancesService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(Role.ADMIN, Role.ACCOUNTANT),
    asyncHandler(async (req, res) => {
      const rows = await employeesService.list(req.user!);
      sendSuccess(res, rows, 'Employees retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(CreateEmployeeDto),
    asyncHandler(async (req, res) => {
      const row = await employeesService.create(req.body, req.user!);
      sendSuccess(res, row, 'Employee created successfully', 201);
    }),
  );

  router.get(
    '/:id/ledger',
    auth,
    requireRoles(Role.ADMIN, Role.ACCOUNTANT, Role.EMPLOYEE, Role.PROJECT_MANAGER),
    asyncHandler(async (req, res) => {
      const report = await advancesService.getEmployeeLedger(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, report, 'Employee ledger retrieved successfully');
    }),
  );

  router.get(
    '/:id/advance-balance',
    auth,
    requireRoles(Role.ADMIN, Role.ACCOUNTANT, Role.EMPLOYEE, Role.PROJECT_MANAGER),
    asyncHandler(async (req, res) => {
      const balance = await advancesService.getEmployeeAdvanceBalance(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, balance, 'Employee advance balance retrieved');
    }),
  );

  return router;
}
