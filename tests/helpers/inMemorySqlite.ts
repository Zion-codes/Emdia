import * as SQLite from "expo-sqlite";
import { runMigrations } from "../../src/database/migrations";
import { seedDatabase } from "../../src/database/seed";

type SqliteBindValue = null | number | bigint | string | Uint8Array;
type SqliteBindRecord = Record<string, SqliteBindValue>;
type NativeBindParam = SqliteBindValue | SqliteBindRecord;

interface NativeSqliteStatement {
  run(...params: NativeBindParam[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
  get(...params: NativeBindParam[]): unknown;
  all(...params: NativeBindParam[]): unknown[];
}

interface NativeSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): NativeSqliteStatement;
  close(): void;
}

type BindInput = SqliteBindValue | SqliteBindRecord | SqliteBindValue[];

function loadDatabaseSync(): new (location: string) => NativeSqliteDatabase {
  const proc = (
    globalThis as unknown as {
      process: { getBuiltinModule: (name: string) => unknown };
    }
  ).process;
  const sqliteModule = proc.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (location: string) => NativeSqliteDatabase;
  };
  return sqliteModule.DatabaseSync;
}

function isSqliteBindValue(value: unknown): value is SqliteBindValue {
  return (
    value === null ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  );
}

function isSqliteBindRecord(value: unknown): value is SqliteBindRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Uint8Array
  ) {
    return false;
  }

  return Object.values(value).every(isSqliteBindValue);
}

function normalizeBindArgs(args: BindInput[]): NativeBindParam[] {
  if (args.length === 0) {
    return [];
  }

  if (args.length === 1) {
    const first = args[0];
    if (Array.isArray(first)) {
      if (!first.every(isSqliteBindValue)) {
        throw new TypeError("Invalid SQLite bind value in array");
      }
      return first;
    }
    if (isSqliteBindRecord(first)) {
      return [first];
    }
  }

  if (!args.every(isSqliteBindValue)) {
    throw new TypeError("Invalid SQLite bind argument");
  }

  return args;
}

export function createInMemorySqliteAdapter(): SQLite.SQLiteDatabase {
  const DatabaseSync = loadDatabaseSync();
  const nativeDb = new DatabaseSync(":memory:");
  let transactionDepth = 0;

  const adapter = {
    async execAsync(source: string): Promise<void> {
      nativeDb.exec(source);
    },

    async runAsync(
      source: string,
      ...params: BindInput[]
    ): Promise<SQLite.SQLiteRunResult> {
      const statement = nativeDb.prepare(source);
      const result = statement.run(...normalizeBindArgs(params));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      } as SQLite.SQLiteRunResult;
    },

    async getFirstAsync<T>(
      source: string,
      ...params: BindInput[]
    ): Promise<T | null> {
      const statement = nativeDb.prepare(source);
      const row = statement.get(...normalizeBindArgs(params));
      return (row ?? null) as T | null;
    },

    async getAllAsync<T>(source: string, ...params: BindInput[]): Promise<T[]> {
      const statement = nativeDb.prepare(source);
      const rows = statement.all(...normalizeBindArgs(params));
      return rows as T[];
    },

    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      if (transactionDepth > 0) {
        await task();
        return;
      }

      transactionDepth += 1;
      nativeDb.exec("BEGIN");
      try {
        await task();
        nativeDb.exec("COMMIT");
      } catch (error) {
        nativeDb.exec("ROLLBACK");
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },

    async withExclusiveTransactionAsync(
      task: (txn: SQLite.SQLiteDatabase) => Promise<void>
    ): Promise<void> {
      if (transactionDepth > 0) {
        await task(adapter as unknown as SQLite.SQLiteDatabase);
        return;
      }

      transactionDepth += 1;
      nativeDb.exec("BEGIN IMMEDIATE");
      try {
        await task(adapter as unknown as SQLite.SQLiteDatabase);
        nativeDb.exec("COMMIT");
      } catch (error) {
        nativeDb.exec("ROLLBACK");
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },

    async closeAsync(): Promise<void> {
      nativeDb.close();
    },
  };

  return adapter as unknown as SQLite.SQLiteDatabase;
}

export async function createTestDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = createInMemorySqliteAdapter();
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await runMigrations(db);
  await seedDatabase(db);
  return db;
}
