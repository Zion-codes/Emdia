import * as SQLite from "expo-sqlite";
import { closeDatabase, DATABASE_NAME, openDatabase } from "./client";
import * as migrations from "./migrations";
import * as seed from "./seed";

describe("database client", () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await closeDatabase();
  });

  it("opens database with pragmas, migrations, and seed as singleton", async () => {
    const runMigrationsSpy = jest.spyOn(migrations, "runMigrations");
    const seedDatabaseSpy = jest.spyOn(seed, "seedDatabase");

    const db1 = await openDatabase();
    const db2 = await openDatabase();

    expect(db1).toBe(db2);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(DATABASE_NAME);
    expect(db1.execAsync).toHaveBeenCalledWith(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;"
    );
    expect(runMigrationsSpy).toHaveBeenCalledTimes(1);
    expect(runMigrationsSpy).toHaveBeenCalledWith(db1);
    expect(seedDatabaseSpy).toHaveBeenCalledTimes(1);
    expect(seedDatabaseSpy).toHaveBeenCalledWith(db1);
  });

  it("closes open database and allows reopening", async () => {
    const db1 = await openDatabase();
    await closeDatabase();

    expect(db1.closeAsync).toHaveBeenCalledTimes(1);

    await closeDatabase();
    const db2 = await openDatabase();

    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(2);
    expect(db2).not.toBe(db1);
  });

  it("resets singleton when openDatabaseAsync fails", async () => {
    const openMock = jest.mocked(SQLite.openDatabaseAsync);
    openMock.mockRejectedValueOnce(new Error("open failed"));

    await expect(openDatabase()).rejects.toThrow("open failed");

    const db = await openDatabase();
    expect(db).toBeDefined();
    expect(openMock).toHaveBeenCalledTimes(2);
  });

  it("closes database and resets singleton when migration or seed fails", async () => {
    const mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn().mockResolvedValue({ user_version: 0 }),
      getAllAsync: jest.fn().mockResolvedValue([]),
      runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
      withExclusiveTransactionAsync: jest.fn(),
      closeAsync: jest.fn().mockRejectedValue(new Error("close failed")),
    } as unknown as SQLite.SQLiteDatabase;

    const openMock = jest.mocked(SQLite.openDatabaseAsync);
    openMock.mockResolvedValueOnce(mockDb);

    jest
      .spyOn(migrations, "runMigrations")
      .mockRejectedValueOnce(new Error("migration failed"));

    await expect(openDatabase()).rejects.toThrow("migration failed");
    expect(mockDb.closeAsync).toHaveBeenCalledTimes(1);

    const db = await openDatabase();
    expect(db).not.toBe(mockDb);
    expect(openMock).toHaveBeenCalledTimes(2);
  });
});
