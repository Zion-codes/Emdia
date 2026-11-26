import * as SQLite from "expo-sqlite";
import { seedDatabase } from "../seed";
import { getDatabaseVersion, runMigrations } from "./index";
import { Migration } from "./types";

interface NodeStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

interface NodeDatabaseSync {
  exec: (sql: string) => void;
  prepare: (sql: string) => NodeStatement;
  close: () => void;
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string) => NodeDatabaseSync;
}

function loadNodeSqlite(): NodeSqliteModule {
  return jest.requireActual("node:sqlite") as NodeSqliteModule;
}

function createSqliteAdapter(syncDb: NodeDatabaseSync): SQLite.SQLiteDatabase {
  const adapter = {
    execAsync: async (source: string): Promise<void> => {
      syncDb.exec(source);
    },
    getFirstAsync: async <T>(
      source: string,
      ...params: unknown[]
    ): Promise<T | null> => {
      const row = syncDb.prepare(source).get(...params) as T | undefined;
      return row ?? null;
    },
    getAllAsync: async <T>(
      source: string,
      ...params: unknown[]
    ): Promise<T[]> => {
      return syncDb.prepare(source).all(...params) as T[];
    },
    runAsync: async (
      source: string,
      ...params: unknown[]
    ): Promise<SQLite.SQLiteRunResult> => {
      const result = syncDb.prepare(source).run(...params);
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    withExclusiveTransactionAsync: async (
      task: (txn: SQLite.SQLiteDatabase) => Promise<void>
    ): Promise<void> => {
      syncDb.exec("BEGIN EXCLUSIVE");
      try {
        await task(adapter as unknown as SQLite.SQLiteDatabase);
        syncDb.exec("COMMIT");
      } catch (error) {
        syncDb.exec("ROLLBACK");
        throw error;
      }
    },
    closeAsync: async (): Promise<void> => {
      syncDb.close();
    },
  };

  return adapter as unknown as SQLite.SQLiteDatabase;
}

describe("001_initial_schema integration", () => {
  const { DatabaseSync } = loadNodeSqlite();
  let syncDb: NodeDatabaseSync;
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    syncDb = new DatabaseSync(":memory:");
    db = createSqliteAdapter(syncDb);
    await db.execAsync("PRAGMA foreign_keys = ON;");
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("creates all 10 tables, enforces constraints and partial unique indexes, and seeds idempotently", async () => {
    const version = await runMigrations(db);
    expect(version).toBe(1);
    expect(await getDatabaseVersion(db)).toBe(1);

    expect(await runMigrations(db)).toBe(1);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    expect(tables.map((t) => t.name)).toEqual([
      "app_settings",
      "categories",
      "category_budgets",
      "goals",
      "installments",
      "investment_contributions",
      "investments",
      "invoices",
      "owners",
      "transactions",
    ]);

    await seedDatabase(db);
    await seedDatabase(db);

    const selfOwners = await db.getAllAsync<{ id: string; name: string }>(
      "SELECT id, name FROM owners WHERE is_self = 1 AND deleted_at IS NULL"
    );
    expect(selfOwners).toHaveLength(1);
    expect(selfOwners[0]?.name).toBe("EU");

    await expect(
      db.runAsync(
        `INSERT INTO owners (id, name, is_self, created_at, updated_at)
         VALUES ('owner-dup', 'Outro EU', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
    ).rejects.toThrow();

    await expect(
      db.runAsync(
        `INSERT INTO transactions (id, name, type, amount, owner_id, created_at, updated_at)
         VALUES ('tx-fk', 'Teste', 'EXPENSE', 100, 'missing-owner', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
    ).rejects.toThrow();

    await expect(
      db.runAsync(
        `INSERT INTO transactions (id, name, type, amount, owner_id, created_at, updated_at)
         VALUES ('tx-amt', 'Teste', 'EXPENSE', 0, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
        selfOwners[0].id
      )
    ).rejects.toThrow();

    await expect(
      db.runAsync(
        `INSERT INTO invoices (id, name, due_day, created_at, updated_at)
         VALUES ('inv-bad', 'Cartao', 32, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
    ).rejects.toThrow();

    await db.runAsync(
      `INSERT INTO categories (id, name, color, icon, created_at, updated_at)
       VALUES ('cat-1', 'Moradia', '#000000', 'home', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );

    await db.runAsync(
      `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
       VALUES ('cb-1', 'cat-1', '2026-01', 1000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')`
    );

    await db.runAsync(
      `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
       VALUES ('cb-2', 'cat-1', '2026-01', 2000, '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z', NULL)`
    );

    await expect(
      db.runAsync(
        `INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
         VALUES ('cb-3', 'cat-1', '2026-01', 3000, '2026-01-04T00:00:00.000Z', '2026-01-04T00:00:00.000Z', NULL)`
      )
    ).rejects.toThrow();

    await db.runAsync(
      `INSERT INTO transactions (id, name, type, amount, owner_id, created_at, updated_at)
       VALUES ('tx-1', 'Aluguel', 'EXPENSE', 250000, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
      selfOwners[0].id
    );

    await expect(
      db.runAsync(
        `INSERT INTO installments (id, transaction_id, number, amount, paid_amount, due_date, created_at, updated_at)
         VALUES ('inst-bad', 'tx-1', 1, 100, 150, '2026-01-10', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
    ).rejects.toThrow();

    await db.runAsync(
      `INSERT INTO installments (id, transaction_id, number, amount, paid_amount, due_date, created_at, updated_at)
       VALUES ('inst-1', 'tx-1', 1, 250000, 0, '2026-01-10', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
    );

    await expect(
      db.runAsync(
        `INSERT INTO installments (id, transaction_id, number, amount, paid_amount, due_date, created_at, updated_at)
         VALUES ('inst-2', 'tx-1', 1, 250000, 0, '2026-01-10', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
      )
    ).rejects.toThrow();

    await db.runAsync(
      `INSERT INTO goals (id, since, amount, created_at, updated_at, deleted_at)
       VALUES ('goal-1', '2026-01', 500000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`
    );

    await expect(
      db.runAsync(
        `INSERT INTO goals (id, since, amount, created_at, updated_at, deleted_at)
         VALUES ('goal-2', '2026-01', 600000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`
      )
    ).rejects.toThrow();
  });

  it("rolls back failed migration without updating user_version", async () => {
    const failingMigrations: readonly Migration[] = [
      {
        version: 1,
        name: "broken_migration",
        async up(txn): Promise<void> {
          await txn.execAsync(
            "CREATE TABLE temp_table (id TEXT PRIMARY KEY NOT NULL);"
          );
          throw new Error("migration boom");
        },
      },
    ];

    await expect(runMigrations(db, failingMigrations)).rejects.toThrow(
      "migration boom"
    );
    expect(await getDatabaseVersion(db)).toBe(0);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'temp_table'"
    );
    expect(tables).toHaveLength(0);
  });
});
