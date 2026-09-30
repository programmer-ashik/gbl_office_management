/**
 * Wipe all MongoDB collections so the next API start is a clean production boot:
 * Chart of Accounts + bootstrap admin + treasury/warehouse defaults only.
 *
 * Usage (from backend/):
 *   WIPE_CONFIRM=YES npm run wipe:production
 *
 * Refuses to run unless NODE_ENV=production or ALLOW_WIPE=true.
 */
import { loadConfig } from '../config';
import { connectDatabase, disconnectDatabase } from '../database/connection';
import mongoose from 'mongoose';

async function main() {
  const config = loadConfig();
  const allow =
    process.env.WIPE_CONFIRM === 'YES' &&
    (config.nodeEnv === 'production' || process.env.ALLOW_WIPE === 'true');

  if (!allow) {
    throw new Error(
      'Refusing wipe. Set WIPE_CONFIRM=YES and either NODE_ENV=production or ALLOW_WIPE=true',
    );
  }

  await connectDatabase();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database connection');
  }

  const collections = await db.listCollections().toArray();
  for (const col of collections) {
    await db.dropCollection(col.name);
    console.log(`Dropped collection: ${col.name}`);
  }

  console.log(
    `Wiped ${collections.length} collection(s). Restart the API to seed CoA and create bootstrap admin.`,
  );
  await disconnectDatabase();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await disconnectDatabase();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
