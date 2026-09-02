import mongoose from 'mongoose';
import { getConfig } from '../config';
import { getMemoryMongoUri, stopMemoryMongo } from './memory-mongo';

export async function connectDatabase(): Promise<void> {
  const config = getConfig();
  const uri = config.mongodb.memory
    ? await getMemoryMongoUri()
    : config.mongodb.uri;

  if (config.mongodb.memory) {
    console.log(
      'Connecting to in-memory MongoDB replica set (transactions enabled)',
    );
  }

  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri, {
    autoIndex: true,
  });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await stopMemoryMongo();
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function databaseReadyState(): number {
  return mongoose.connection.readyState;
}

export async function pingDatabase(): Promise<boolean> {
  if (!mongoose.connection.db) {
    return false;
  }
  await mongoose.connection.db.admin().command({ ping: 1 });
  return true;
}

function isTransientTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as {
    code?: number;
    errorLabels?: string[];
    hasErrorLabel?: (label: string) => boolean;
  };
  if (typeof err.hasErrorLabel === 'function') {
    return err.hasErrorLabel('TransientTransactionError');
  }
  if (err.errorLabels?.includes('TransientTransactionError')) {
    return true;
  }
  return err.code === 24;
}

export async function withTransaction<T>(
  work: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();

  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        session.startTransaction();
        const result = await work(session);
        await session.commitTransaction();
        return result;
      } catch (error) {
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        lastError = error;
        if (!isTransientTransactionError(error) || attempt === 4) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
    throw lastError;
  } finally {
    await session.endSession();
  }
}
