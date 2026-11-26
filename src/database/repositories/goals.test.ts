import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import {
  getGoalForMonth,
  listGoalHistory,
  removeGoalFromMonth,
  setGoalForMonth,
} from "./goals";

describe("goals repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("gets, sets, and avoids redundant historical goal records", async () => {
    expect(await getGoalForMonth(db, "2026-01")).toBeNull();

    expect(await setGoalForMonth(db, "2026-01", 5000)).toBe(5000);
    expect(await getGoalForMonth(db, "2026-02")).toBe(5000);

    expect(await setGoalForMonth(db, "2026-02", 5000)).toBe(5000);
    expect(await listGoalHistory(db)).toHaveLength(1);

    expect(await setGoalForMonth(db, "2026-03", 6000)).toBe(6000);
    expect(await setGoalForMonth(db, "2026-03", 6500)).toBe(6500);
    let history = await listGoalHistory(db);
    expect(history.map((item) => [item.since, item.amount])).toEqual([
      ["2026-03", 6500],
      ["2026-01", 5000],
    ]);

    expect(await setGoalForMonth(db, "2026-03", 5000)).toBe(5000);
    history = await listGoalHistory(db);
    expect(history.map((item) => [item.since, item.amount])).toEqual([
      ["2026-01", 5000],
    ]);
  });

  it("removes goal from a month, preserves prior months, and soft-deletes future records", async () => {
    await removeGoalFromMonth(db, "2026-01");
    expect(await listGoalHistory(db)).toHaveLength(0);

    await setGoalForMonth(db, "2026-01", 4000);
    await setGoalForMonth(db, "2026-03", 5000);
    await setGoalForMonth(db, "2026-05", 6000);

    await removeGoalFromMonth(db, "2026-03");

    expect(await getGoalForMonth(db, "2026-02")).toBe(4000);
    expect(await getGoalForMonth(db, "2026-03")).toBeNull();
    expect(await getGoalForMonth(db, "2026-05")).toBeNull();

    let history = await listGoalHistory(db);
    expect(history.map((item) => [item.since, item.amount])).toEqual([
      ["2026-03", 0],
      ["2026-01", 4000],
    ]);

    await removeGoalFromMonth(db, "2026-02");
    expect(await getGoalForMonth(db, "2026-01")).toBe(4000);
    expect(await getGoalForMonth(db, "2026-02")).toBeNull();
    history = await listGoalHistory(db);
    expect(history.map((item) => [item.since, item.amount])).toEqual([
      ["2026-02", 0],
      ["2026-01", 4000],
    ]);

    await removeGoalFromMonth(db, "2026-01");
    expect(await getGoalForMonth(db, "2026-01")).toBeNull();
    expect(await listGoalHistory(db)).toHaveLength(0);
  });
});
