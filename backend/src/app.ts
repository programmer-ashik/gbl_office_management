import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { loadConfig } from './config';
import { errorHandler, notFoundHandler } from './common/middleware/error-handler';
import { connectDatabase } from './database/connection';
import { AuthService } from './modules/auth/auth.service';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createHealthRouter } from './modules/health/health.routes';
import { UsersService } from './modules/users/users.service';
import { createUsersRouter } from './modules/users/users.routes';
import { AccountsService } from './modules/accounting/accounts.service';
import { createAccountsRouter } from './modules/accounting/accounts.routes';
import { JournalService } from './modules/accounting/journal.service';
import { createJournalsRouter } from './modules/accounting/journals.routes';
import { LedgerService } from './modules/accounting/ledger.service';
import {
  createLedgersRouter,
  createReportsRouter,
} from './modules/accounting/ledgers.routes';
import { ProjectsService } from './modules/projects/projects.service';
import { createProjectsRouter } from './modules/projects/projects.routes';
import { BankingService } from './modules/banking/banking.service';
import {
  createReconciliationsRouter,
  createTransfersRouter,
  createTreasuryRouter,
} from './modules/banking/banking.routes';
import { AdvancesService } from './modules/advances/advances.service';
import { createAdvancesRouter } from './modules/advances/advances.routes';
import { ArApService } from './modules/ar-ap/ar-ap.service';
import {
  createPayablesRouter,
  createReceivablesRouter,
} from './modules/ar-ap/ar-ap.routes';
import { AnalyticsService } from './modules/analytics/analytics.service';
import { createAnalyticsRouter } from './modules/analytics/analytics.routes';
import { EmployeesService } from './modules/employees/employees.service';
import { createEmployeesRouter } from './modules/employees/employees.routes';
import { ApprovalService } from './modules/governance/approval.service';
import { AuditService } from './modules/governance/audit.service';
import {
  createApprovalsRouter,
  createAuditRouter,
  createOcrRouter,
} from './modules/governance/governance.routes';
import { OcrService } from './modules/governance/ocr.service';
import { PayrollService } from './modules/payroll/payroll.service';
import { createPayrollRouter } from './modules/payroll/payroll.routes';
import { ProcurementService } from './modules/procurement/procurement.service';
import {
  createInventoryRouter,
  createItemsRouter,
  createPurchaseOrdersRouter,
  createSuppliersRouter,
  createWarehousesRouter,
} from './modules/procurement/procurement.routes';
import { CustomersService } from './modules/customers/customers.service';
import { createCustomersRouter } from './modules/customers/customers.routes';
import { ReportTemplatesService } from './modules/templates/report-templates.service';
import { createTemplatesRouter } from './modules/templates/templates.routes';
import { seedDemoData } from './database/demo-seed';
import path from 'node:path';
import fs from 'node:fs';

export async function createApp(): Promise<Express> {
  const config = loadConfig();
  await connectDatabase();
  console.log(
    config.mongodb.memory
      ? 'MongoDB: in-memory replica set'
      : `MongoDB: connected via MONGODB_URI (${config.mongodb.uri.replace(/\/\/.*@/, '//***@')})`,
  );

  const usersService = new UsersService();
  const authService = new AuthService(usersService);
  await authService.bootstrapAdmin();

  const accountsService = new AccountsService();
  await accountsService.seedDefaults();
  const projectsService = new ProjectsService();
  const auditService = new AuditService();
  const approvalService = new ApprovalService(projectsService, auditService);
  const ocrService = new OcrService();
  const customersService = new CustomersService();
  const journalService = new JournalService(
    accountsService,
    projectsService,
    auditService,
    usersService,
    customersService,
  );
  const ledgerService = new LedgerService();
  const bankingService = new BankingService(
    accountsService,
    journalService,
    ledgerService,
  );
  await bankingService.seedDefaults();
  const advancesService = new AdvancesService(
    journalService,
    projectsService,
    accountsService,
    bankingService,
    usersService,
    approvalService,
  );
  const procurementService = new ProcurementService(
    journalService,
    projectsService,
    bankingService,
  );
  await procurementService.seedDefaults();
  const arApService = new ArApService(
    journalService,
    projectsService,
    accountsService,
    bankingService,
  );
  journalService.setArApHooks({
    onManualPosted: (journal, userId) =>
      arApService.syncFromManualJournal(journal, userId),
    assertJournalReversible: (journalId) =>
      arApService.assertLinkedJournalReversible(journalId),
    onJournalReversed: (journalId, userId) =>
      arApService.voidLinkedToJournal(journalId, userId),
  });
  const payrollService = new PayrollService(
    journalService,
    projectsService,
    bankingService,
    usersService,
  );
  const analyticsService = new AnalyticsService(ledgerService, bankingService);
  const employeesService = new EmployeesService(usersService);
  const templatesService = new ReportTemplatesService();

  if (!config.mongodb.memory) {
    await seedDemoData({
      usersService,
      bankingService,
      journalService,
      arApService,
    });
  }

  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(path.join(uploadsRoot, 'logos'), { recursive: true });
  app.use('/uploads', express.static(uploadsRoot));

  app.use('/api/v1/health', createHealthRouter());
  app.use('/api/v1/auth', createAuthRouter(authService, usersService));
  app.use('/api/v1/users', createUsersRouter(usersService, authService));
  app.use(
    '/api/v1/employees',
    createEmployeesRouter(employeesService, advancesService, authService, usersService),
  );
  app.use(
    '/api/v1/customers',
    createCustomersRouter(customersService, authService, usersService),
  );
  app.use(
    '/api/v1/accounts',
    createAccountsRouter(
      accountsService,
      authService,
      usersService,
      journalService,
    ),
  );
  app.use(
    '/api/v1/journals',
    createJournalsRouter(
      journalService,
      authService,
      usersService,
      approvalService,
    ),
  );
  app.use(
    '/api/v1/ledgers',
    createLedgersRouter(ledgerService, authService, usersService),
  );
  app.use(
    '/api/v1/reports',
    createReportsRouter(ledgerService, authService, usersService),
  );
  app.use(
    '/api/v1/templates',
    createTemplatesRouter(templatesService, authService, usersService),
  );
  app.use(
    '/api/v1/projects',
    createProjectsRouter(projectsService, authService, usersService),
  );
  app.use(
    '/api/v1/treasury',
    createTreasuryRouter(
      bankingService,
      ledgerService,
      authService,
      usersService,
    ),
  );
  app.use(
    '/api/v1/transfers',
    createTransfersRouter(bankingService, authService, usersService),
  );
  app.use(
    '/api/v1/reconciliations',
    createReconciliationsRouter(bankingService, authService, usersService),
  );
  app.use(
    '/api/v1/advances',
    createAdvancesRouter(advancesService, authService, usersService),
  );
  app.use(
    '/api/v1/receivables',
    createReceivablesRouter(arApService, authService, usersService),
  );
  app.use(
    '/api/v1/payables',
    createPayablesRouter(arApService, authService, usersService),
  );
  app.use(
    '/api/v1/payroll',
    createPayrollRouter(payrollService, authService, usersService),
  );
  app.use(
    '/api/v1/audit',
    createAuditRouter(auditService, authService, usersService),
  );
  app.use(
    '/api/v1/approvals',
    createApprovalsRouter(approvalService, authService, usersService),
  );
  app.use(
    '/api/v1/ocr',
    createOcrRouter(ocrService, authService, usersService),
  );
  app.use(
    '/api/v1/analytics',
    createAnalyticsRouter(analyticsService, authService, usersService),
  );
  app.use(
    '/api/v1/suppliers',
    createSuppliersRouter(
      procurementService,
      authService,
      usersService,
      arApService,
    ),
  );
  app.use(
    '/api/v1/items',
    createItemsRouter(procurementService, authService, usersService),
  );
  app.use(
    '/api/v1/warehouses',
    createWarehousesRouter(procurementService, authService, usersService),
  );
  app.use(
    '/api/v1/purchase-orders',
    createPurchaseOrdersRouter(procurementService, authService, usersService),
  );
  app.use(
    '/api/v1/inventory',
    createInventoryRouter(procurementService, authService, usersService),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
