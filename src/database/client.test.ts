import * as SQLite from "expo-sqlite";
import { closeDatabase, DATABASE_NAME, openDatabase } from "./client";

describe("database client", () => {
  afterEach(async () => {
    await closeDatabase();
  });

  it("opens database with foreign keys and WAL enabled as singleton", async () => {
    const db1 = await openDatabase();
    const db2 = await openDatabase();

    expect(db1).toBe(db2);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
    expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith(DATABASE_NAME);
    expect(db1.execAsync).toHaveBeenCalledWith(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;"
    );
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

  it("resets singleton when initialization fails", async () => {
    const openMock = jest.mocked(SQLite.openDatabaseAsync);
    openMock.mockRejectedValueOnce(new Error("open failed"));

    await expect(openDatabase()).rejects.toThrow("open failed");

    const db = await openDatabase();
    expect(db).toBeDefined();
    expect(openMock).toHaveBeenCalledTimes(2);
  });
});
