import * as SQLite from "expo-sqlite";
import { DEFAULT_SELF_OWNER_NAME, seedDatabase } from "./seed";

describe("seedDatabase", () => {
  it("inserts default self owner idempotently inside exclusive transaction", async () => {
    const runAsync = jest
      .fn()
      .mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    const withExclusiveTransactionAsync = jest.fn(
      async (task: (txn: SQLite.SQLiteDatabase) => Promise<void>) => {
        await task({ runAsync } as unknown as SQLite.SQLiteDatabase);
      }
    );

    const db = {
      withExclusiveTransactionAsync,
    } as unknown as SQLite.SQLiteDatabase;

    jest.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));

    await seedDatabase(db);

    expect(withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(runAsync).toHaveBeenCalledTimes(1);
    const [sql, id, name, createdAt, updatedAt] = runAsync.mock.calls[0] as [
      string,
      string,
      string,
      string,
      string,
    ];
    expect(sql).toContain("INSERT INTO owners");
    expect(sql).toContain("WHERE NOT EXISTS");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(name).toBe(DEFAULT_SELF_OWNER_NAME);
    expect(createdAt).toBe("2026-06-01T10:00:00.000Z");
    expect(updatedAt).toBe("2026-06-01T10:00:00.000Z");
  });
});
