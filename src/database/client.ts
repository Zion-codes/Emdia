import * as SQLite from "expo-sqlite";

export const DATABASE_NAME = "emdia.db";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initializeDatabase(): Promise<SQLite.SQLiteDatabase> {
  try {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    return db;
  } catch (error) {
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
