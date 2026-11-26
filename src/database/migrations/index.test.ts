import * as SQLite from "expo-sqlite";
import { getDatabaseVersion, MIGRATIONS, runMigrations } from "./index";
import { Migration } from "./types";

function createMockDb(
  initialVersion: number | null = 0
): SQLite.SQLiteDatabase {
  const db = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest
      .fn()
      .mockResolvedValue(
        initialVersion === null ? null : { user_version: initialVersion }
      ),
    withExclusiveTransactionAsync: jest.fn(
      async (task: (txn: SQLite.SQLiteDatabase) => Promise<void>) => {
        await task(db as unknown as SQLite.SQLiteDatabase);
      }
    ),
  };
  return db as unknown as SQLite.SQLiteDatabase;
}

describe("database migrations", () => {
  it("reads database version with fallback to 0 when pragma returns null", async () => {
    const dbWithNull = createMockDb(null);
    expect(await getDatabaseVersion(dbWithNull)).toBe(0);

    const dbWithVersion = createMockDb(3);
    expect(await getDatabaseVersion(dbWithVersion)).toBe(3);
  });

  it("validates migration versions are strictly ascending positive integers", async () => {
    const db = createMockDb(0);

    await expect(
      runMigrations(db, [
        { version: 0, name: "zero", up: jest.fn() },
      ] as readonly Migration[])
    ).rejects.toThrow("Invalid migration version 0 (zero)");

    await expect(
      runMigrations(db, [
        { version: 1.5, name: "float", up: jest.fn() },
      ] as readonly Migration[])
    ).rejects.toThrow("Invalid migration version 1.5 (float)");

    await expect(
      runMigrations(db, [
        { version: 2, name: "second", up: jest.fn() },
        { version: 1, name: "first", up: jest.fn() },
      ])
    ).rejects.toThrow("Invalid migration version 1 (first)");

    await expect(
      runMigrations(db, [
        { version: 1, name: "first", up: jest.fn() },
        { version: 1, name: "duplicate", up: jest.fn() },
      ])
    ).rejects.toThrow("Invalid migration version 1 (duplicate)");
  });

  it("skips applied migrations and executes pending ones in transactions", async () => {
    const db = createMockDb(1);
    const up1 = jest.fn().mockResolvedValue(undefined);
    const up2 = jest.fn().mockResolvedValue(undefined);

    const finalVersion = await runMigrations(db, [
      { version: 1, name: "first", up: up1 },
      { version: 2, name: "second", up: up2 },
    ]);

    expect(finalVersion).toBe(2);
    expect(up1).not.toHaveBeenCalled();
    expect(up2).toHaveBeenCalledTimes(1);
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(db.execAsync).toHaveBeenCalledWith("PRAGMA user_version = 2");
  });

  it("uses default MIGRATIONS list when omitted", async () => {
    const db = createMockDb(0);

    const finalVersion = await runMigrations(db);

    expect(finalVersion).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(db.execAsync).toHaveBeenCalledWith("PRAGMA user_version = 1");
  });
});
