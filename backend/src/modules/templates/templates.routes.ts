import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import { Role, ALL_ROLES } from '../../common/enums/role.enum';
import { badRequest } from '../../common/errors/app-error';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import { requireAuth } from '../../common/middleware/auth';
import { requireRoles } from '../../common/middleware/roles';
import { validateBody } from '../../common/middleware/validate';
import type { AuthService } from '../auth/auth.service';
import type { UsersService } from '../users/users.service';
import { SaveReportTemplateDto } from './dto/report-template.dto';
import type { ReportTemplatesService } from './report-templates.service';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'logos');

function ensureUploadDir(): void {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadDir();
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)
      ? ext
      : '.png';
    cb(null, `logo-${Date.now()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export function createTemplatesRouter(
  templatesService: ReportTemplatesService,
  authService: AuthService,
  usersService: UsersService,
) {
  const router = Router();
  const auth = requireAuth(authService, usersService);

  router.get(
    '/balance-sheet',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (_req, res) => {
      const template = await templatesService.getBalanceSheetTemplate();
      sendSuccess(res, template, 'Balance sheet template retrieved');
    }),
  );

  router.post(
    '/balance-sheet',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(SaveReportTemplateDto),
    asyncHandler(async (req, res) => {
      const template = await templatesService.saveBalanceSheetTemplate(
        req.body,
        req.user!.userId,
      );
      sendSuccess(res, template, 'Balance sheet template saved');
    }),
  );

  router.get(
    '/journal-voucher',
    auth,
    requireRoles(...ALL_ROLES),
    asyncHandler(async (_req, res) => {
      const template = await templatesService.getJournalVoucherTemplate();
      sendSuccess(res, template, 'Journal voucher template retrieved');
    }),
  );

  router.post(
    '/journal-voucher',
    auth,
    requireRoles(Role.ADMIN),
    validateBody(SaveReportTemplateDto),
    asyncHandler(async (req, res) => {
      const template = await templatesService.saveJournalVoucherTemplate(
        req.body,
        req.user!.userId,
      );
      sendSuccess(res, template, 'Journal voucher template saved');
    }),
  );

  router.post(
    '/upload-logo',
    auth,
    requireRoles(Role.ADMIN),
    (req, res, next) => {
      upload.single('logo')(req, res, (err: unknown) => {
        if (err) {
          next(
            badRequest(
              err instanceof Error ? err.message : 'Logo upload failed',
            ),
          );
          return;
        }
        next();
      });
    },
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw badRequest('Logo file is required (field name: logo)');
      }
      const url = `/uploads/logos/${req.file.filename}`;
      sendSuccess(res, { url }, 'Logo uploaded successfully', 201);
    }),
  );

  return router;
}

export { UPLOAD_DIR };
