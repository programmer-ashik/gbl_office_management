import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replicaSet: MongoMemoryReplSet | undefined;

export async function getMemoryMongoUri(
  dbName = 'gbl_office',
): Promise<string> {
  if (!replicaSet) {
    replicaSet = await MongoMemoryReplSet.create({
      binary: { version: '7.0.14' },
      instanceOpts: [{ launchTimeout: 60_000 }],
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
  }

  return replicaSet.getUri(dbName);
}

export async function stopMemoryMongo(): Promise<void> {
  if (!replicaSet) {
    return;
  }

  await replicaSet.stop();
  replicaSet = undefined;
}
