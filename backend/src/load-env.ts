import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Load `.env` before config validation.
 * PM2 runs `dist/main.js`; dotenv's default cwd lookup often misses `backend/.env`.
 */
export function loadEnvFile(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '.env'),
  ];
  const envPath = candidates.find((filePath) => fs.existsSync(filePath));
  if (envPath) {
    dotenv.config({ path: envPath });
    return;
  }
  dotenv.config();
}

loadEnvFile();
