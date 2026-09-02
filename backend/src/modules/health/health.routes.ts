import { Router } from 'express';
import { sendSuccess } from '../../common/http/api-response';
import { asyncHandler } from '../../common/middleware/async-handler';
import {
  databaseReadyState,
  isDatabaseConnected,
  pingDatabase,
} from '../../database/connection';

export function createHealthRouter() {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const connected = isDatabaseConnected();
      let ping = false;
      if (connected) {
        try {
          ping = await pingDatabase();
        } catch {
          ping = false;
        }
      }

      sendSuccess(
        res,
        {
          status: connected && ping ? 'ok' : 'degraded',
          database: {
            connected,
            ping,
            readyState: databaseReadyState(),
          },
          service: 'gbl-office-api',
          timestamp: new Date().toISOString(),
        },
        'Service health retrieved successfully',
      );
    }),
  );

  return router;
}
