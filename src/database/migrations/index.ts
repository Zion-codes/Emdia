import * as SQLite from "expo-sqlite";
import { migration001InitialSchema } from "./001_initial_schema";
import { Migration } from "./types";

export const MIGRATIONS: readonly Migration[] = [migration001InitialSchema];

function validateMigrations(migrations: readonly Migration[]): void {
  let previousVersion = 0;

  for (const migration of migrations) {
    if (
      !Number.isInteger(migration.version) ||
      migration.version < 1 ||
      migration.version <= previousVersion
    ) {
      throw new Error(
        `Invalid migration version ${migration.version} (${migration.name}); expected strictly ascending positive integer`
      );
    }

    previousVersion = migration.version;
  }
}

export async function getDatabaseVersion(
  db: SQLite.SQLiteDatabase
): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  return row?.user_version ?? 0;
}

export async function runMigrations(
  db: SQLite.SQLiteDatabase,
  migrations: readonly Migration[] = MIGRATIONS
): Promise<number> {
  validateMigrations(migrations);

  let currentVersion = await getDatabaseVersion(db);

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    await db.withExclusiveTransactionAsync(async (txn) => {
      await migration.up(txn);
      await txn.execAsync(`PRAGMA user_version = ${migration.version}`);
    });

    currentVersion = migration.version;
  }

  return currentVersion;
}
