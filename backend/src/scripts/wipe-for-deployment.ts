/**
 * Wipe business data before a deployment but keep user accounts (logins, roles,
 * permissions). The next API start re-seeds the Chart of Accounts, treasury and
 * warehouse defaults; the bootstrap admin is skipped because users still exist.
 *
 * Usage (from backend/):
 *   npm run wipe:deploy                            # asks you to type the database name
 *   npm run wipe:deploy:prod                       # same, on the server (compiled dist)
 *   WIPE_DRY_RUN=true npm run wipe:deploy          # list what would be dropped
 *   WIPE_CONFIRM=YES npm run wipe:deploy:prod      # non-interactive (scripts / CI)
 *
 * WIPE_KEEP adds more collections to keep, comma-separated (users and
 * employees are always kept).
 */
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../config';
import { connectDatabase, disconnectDatabase } from '../database/connection';
import mongoose from 'mongoose';

const ALWAYS_KEEP = ['users', 'employees'];

function keepList(): Set<string> {
  const extra = (process.env.WIPE_KEEP ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return new Set([...ALWAYS_KEEP, ...extra]);
}

async function confirmByTypingName(databaseName: string): Promise<boolean> {
  if (process.env.WIPE_CONFIRM === 'YES') return true;
  if (!process.stdin.isTTY) {
    throw new Error(
      'Refusing wipe without a terminal. Set WIPE_CONFIRM=YES to run non-interactively.',
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `\nThis permanently deletes the data above. Type the database name (${databaseName}) to continue: `,
    );
    return answer.trim() === databaseName;
  } finally {
    rl.close();
  }
}

async function main() {
  loadConfig();
  const dryRun = process.env.WIPE_DRY_RUN === 'true';

  await connectDatabase();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No database connection');
  }

  const keep = keepList();
  const collections = (await db.listCollections().toArray()).filter(
    (col) => !col.name.startsWith('system.'),
  );
  const toDrop = collections.filter((col) => !keep.has(col.name));
  const kept = collections.filter((col) => keep.has(col.name));

  console.log(`Database: ${db.databaseName} (${mongoose.connection.host})`);
  for (const col of kept) {
    const count = await db.collection(col.name).countDocuments();
    console.log(`Keeping: ${col.name} (${count} document(s))`);
  }

  for (const col of toDrop) console.log(`Will drop: ${col.name}`);

  if (dryRun) {
    console.log(`Dry run: ${toDrop.length} collection(s) would be dropped.`);
    await disconnectDatabase();
    return;
  }

  if (!(await confirmByTypingName(db.databaseName))) {
    console.log('Name did not match. Nothing was deleted.');
    await disconnectDatabase();
    return;
  }

  for (const col of toDrop) {
    await db.dropCollection(col.name);
    console.log(`Dropped: ${col.name}`);
  }

  console.log(
    `Wiped ${toDrop.length} collection(s), kept ${kept.length}. Restart the API to re-seed the Chart of Accounts. Everyone must sign in again.`,
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
