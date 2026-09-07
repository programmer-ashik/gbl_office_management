import { Router } from 'express';
import { Role } from '../../common/enums/role.enum';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import type { ArApService } from '../ar-ap/ar-ap.service';
import {
  CreateItemDto,
  CreateProductCategoryDto,
  CreatePurchaseOrderDto,
  CreateSupplierDto,
  IssueStockDto,
  ReceiveGoodsDto,
  ReturnGoodsDto,
} from './dto/procurement.dto';
import type { ProcurementService } from './procurement.service';

const FINANCE = [Role.ADMIN, Role.ACCOUNTANT] as const;
const PROCUREMENT = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
] as const;
const CATALOG_VIEW = [
  Role.ADMIN,
  Role.ACCOUNTANT,
  Role.PROJECT_MANAGER,
  Role.EMPLOYEE,
] as const;

export function createSuppliersRouter(
  procurementService: ProcurementService,
  authService: AuthService,
  usersService: UsersService,
  arApService: ArApService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...PROCUREMENT),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.listSuppliers(req.user!);
      sendSuccess(res, rows, 'Suppliers retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateSupplierDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.createSupplier(req.body, req.user!);
      sendSuccess(res, row, 'Supplier created successfully', 201);
    }),
  );

  router.get(
    '/:id/ledger',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      // Always use AR/AP ledger so Add bill / payments appear (not GRN-only).
      const row = await arApService.vendorLedger(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Vendor ledger retrieved successfully');
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...PROCUREMENT),
    asyncHandler(async (req, res) => {
      const row = await procurementService.getSupplier(String(req.params.id), req.user!);
      sendSuccess(res, row, 'Supplier retrieved successfully');
    }),
  );

  return router;
}

export function createItemsRouter(
  procurementService: ProcurementService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...CATALOG_VIEW),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.listItems(req.user!, {
        categoryId:
          typeof req.query.categoryId === 'string'
            ? req.query.categoryId
            : undefined,
        subCategoryId:
          typeof req.query.subCategoryId === 'string'
            ? req.query.subCategoryId
            : undefined,
        search:
          typeof req.query.search === 'string' ? req.query.search : undefined,
      });
      sendSuccess(res, rows, 'Items retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateItemDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.createItem(req.body, req.user!);
      sendSuccess(res, row, 'Item created successfully', 201);
    }),
  );

  return router;
}

export function createProductCategoriesRouter(
  procurementService: ProcurementService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...CATALOG_VIEW),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.listCategories(req.user!);
      sendSuccess(res, rows, 'Product categories retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...FINANCE),
    validateBody(CreateProductCategoryDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.createCategory(req.body, req.user!);
      sendSuccess(res, row, 'Product category created successfully', 201);
    }),
  );

  return router;
}

export function createWarehousesRouter(
  procurementService: ProcurementService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...PROCUREMENT),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.listWarehouses(req.user!);
      sendSuccess(res, rows, 'Warehouses retrieved successfully');
    }),
  );

  return router;
}

export function createPurchaseOrdersRouter(
  procurementService: ProcurementService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...PROCUREMENT),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.listPurchaseOrders(req.user!);
      sendSuccess(res, rows, 'Purchase orders retrieved successfully');
    }),
  );

  router.post(
    '/',
    auth,
    requireRoles(...PROCUREMENT),
    validateBody(CreatePurchaseOrderDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.createPurchaseOrder(req.body, req.user!);
      sendSuccess(res, row, 'Purchase order created successfully', 201);
    }),
  );

  router.get(
    '/:id',
    auth,
    requireRoles(...PROCUREMENT),
    asyncHandler(async (req, res) => {
      const row = await procurementService.getPurchaseOrder(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, row, 'Purchase order retrieved successfully');
    }),
  );

  router.post(
    '/:id/cancel',
    auth,
    requireRoles(...FINANCE),
    asyncHandler(async (req, res) => {
      const row = await procurementService.cancelPurchaseOrder(
        String(req.params.id),
        req.user!,
      );
      sendSuccess(res, row, 'Purchase order cancelled');
    }),
  );

  router.post(
    '/:id/receive',
    auth,
    requireRoles(...FINANCE),
    validateBody(ReceiveGoodsDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.receiveGoods(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Goods received', 201);
    }),
  );

  router.post(
    '/:id/returns',
    auth,
    requireRoles(...FINANCE),
    validateBody(ReturnGoodsDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.returnGoods(
        String(req.params.id),
        req.body,
        req.user!,
      );
      sendSuccess(res, row, 'Vendor return posted', 201);
    }),
  );

  return router;
}

export function createInventoryRouter(
  procurementService: ProcurementService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/',
    auth,
    requireRoles(...CATALOG_VIEW),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.inventory(req.user!);
      sendSuccess(res, rows, 'Inventory retrieved successfully');
    }),
  );

  router.get(
    '/issues',
    auth,
    requireRoles(...PROCUREMENT),
    asyncHandler(async (req, res) => {
      const rows = await procurementService.listIssues(req.user!);
      sendSuccess(res, rows, 'Stock issues retrieved successfully');
    }),
  );

  router.post(
    '/issues',
    auth,
    requireRoles(...FINANCE),
    validateBody(IssueStockDto),
    asyncHandler(async (req, res) => {
      const row = await procurementService.issueStock(req.body, req.user!);
      sendSuccess(res, row, 'Stock issued to project', 201);
    }),
  );

  return router;
}
