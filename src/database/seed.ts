import * as SQLite from "expo-sqlite";
import { generateUuid, nowIsoUtc } from "./utils";

export const DEFAULT_SELF_OWNER_NAME = "EU";

export async function seedDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const timestamp = nowIsoUtc();
  const ownerId = generateUuid();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO owners (id, name, is_self, created_at, updated_at, deleted_at)
       SELECT ?, ?, 1, ?, ?, NULL
       WHERE NOT EXISTS (
         SELECT 1 FROM owners WHERE is_self = 1 AND deleted_at IS NULL
       )`,
      ownerId,
      DEFAULT_SELF_OWNER_NAME,
      timestamp,
      timestamp
    );
  });
}
