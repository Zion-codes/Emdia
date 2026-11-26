import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";
import { seedDatabase } from "./seed";

export const DATABASE_NAME = "emdia.db";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  let db: SQLite.SQLiteDatabase | null = null;

  try {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    await runMigrations(db);
    await seedDatabase(db);
    return db;
  } catch (error) {
    if (db !== null) {
      await db.closeAsync().catch(() => undefined);
    }
    databasePromise = null;
    throw error;
  }
}

export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = initializeDatabase();
  }

  return databasePromise;
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) {
    return;
  }

  const current = databasePromise;
  databasePromise = null;
  const db = await current;
  await db.closeAsync();
}
