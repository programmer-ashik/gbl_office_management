import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import type { CustomersService } from './customers.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;
const PROJECT_VIEW = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
] as const;

export function createCustomersRouter(
  customersService: CustomersService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...PROJECT_VIEW),
    asyncHandler(async (req, res) => {
      const activeOnly = req.query.active === '1' || req.query.active === 'true';
      const rows = await customersService.list(activeOnly);
      sendSuccess(res, rows, 'Customers retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateCustomerDto),
    asyncHandler(async (req, res) => {
      const row = await customersService.create(req.body);
      sendSuccess(res, row, 'Customer created successfully', 201);
    }),
  );

  router.patch(
    '/:id',
    auth,
    requireRoles(...FINANCE),
    validateBody(UpdateCustomerDto),
    asyncHandler(async (req, res) => {
      const row = await customersService.update(String(req.params.id), req.body);
      sendSuccess(res, row, 'Customer updated successfully');
    }),
  );

  return router;
}
