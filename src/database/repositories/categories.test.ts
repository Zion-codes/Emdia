import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import {
  createCategory,
  deleteCategory,
  getCategoryBudgetForMonth,
  getCategoryById,
  listCategories,
  listCategoryBudgetHistory,
  removeCategoryBudget,
  setCategoryBudget,
  updateCategory,
} from "./categories";
import { getSelfOwner } from "./owners";

describe("categories repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("creates, lists, and gets categories ordered case-insensitively with optional budget", async () => {
    const food = await createCategory(db, {
      name: " Alimentação ",
      color: "#ff0000",
      icon: "utensils",
      budget: 800,
      month: "2026-03",
    });
    const transport = await createCategory(db, {
      name: "transporte",
      budget: 0,
      month: "2026-03",
    });
    const leisure = await createCategory(db, {
      name: "Lazer",
    });

    expect(food.name).toBe("Alimentação");
    expect(food.budget).toBe(800);
    expect(transport.budget).toBeNull();
    expect(leisure.budget).toBeNull();

    const list = await listCategories(db, { month: "2026-03" });
    expect(list.map((item) => item.name)).toEqual([
      "Alimentação",
      "Lazer",
      "transporte",
    ]);
    expect(list[0].budget).toBe(800);

    const fetched = await getCategoryById(db, food.id, { month: "2026-04" });
    expect(fetched?.budget).toBe(800);
    expect(await getCategoryById(db, "missing")).toBeNull();
  });

  it("uses current month by default when listing categories", async () => {
    jest.setSystemTime(new Date(2026, 4, 15));
    await createCategory(db, {
      name: "Saúde",
      budget: 500,
    });

    const list = await listCategories(db);
    expect(list).toHaveLength(1);
    expect(list[0].budget).toBe(500);
  });

  it("validates category name and updates fields", async () => {
    await expect(createCategory(db, { name: "   " })).rejects.toThrow(
      DatabaseError
    );

    const created = await createCategory(db, {
      name: "Moradia",
      color: "#111",
      icon: "home",
    });

    const updatedNameOnly = await updateCategory(db, created.id, {
      name: " Casa ",
    });
    expect(updatedNameOnly.name).toBe("Casa");
    expect(updatedNameOnly.color).toBe("#111");
    expect(updatedNameOnly.icon).toBe("home");

    const updatedMetaOnly = await updateCategory(db, created.id, {
      color: null,
      icon: "building",
    });
    expect(updatedMetaOnly.name).toBe("Casa");
    expect(updatedMetaOnly.color).toBeNull();
    expect(updatedMetaOnly.icon).toBe("building");

    await expect(
      updateCategory(db, "missing", { name: "Teste" })
    ).rejects.toThrow("Categoria não encontrada.");
    await expect(updateCategory(db, created.id, { name: "" })).rejects.toThrow(
      "O nome da categoria é obrigatório."
    );
  });

  it("deletes category in cascade, unlinking active transactions and soft-deleting budgets", async () => {
    const owner = await getSelfOwner(db);
    const category = await createCategory(db, {
      name: "Educação",
      budget: 400,
      month: "2026-01",
    });

    await db.runAsync(
      `INSERT INTO transactions (id, name, type, amount, category_id, owner_id, created_at, updated_at)
       VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?, ?)`,
      "tx-1",
      "Curso",
      10000,
      category.id,
      owner!.id,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );

    const beforeDelete = await getCategoryById(db, category.id, {
      month: "2026-01",
    });
    expect(beforeDelete?.transactionsCount).toBe(1);

    await deleteCategory(db, category.id);

    expect(await getCategoryById(db, category.id)).toBeNull();
    const tx = await db.getFirstAsync<{ category_id: string | null }>(
      "SELECT category_id FROM transactions WHERE id = ?",
      "tx-1"
    );
    expect(tx?.category_id).toBeNull();

    const activeBudgets = await db.getFirstAsync<{ total: number }>(
      "SELECT COUNT(*) AS total FROM category_budgets WHERE category_id = ? AND deleted_at IS NULL",
      category.id
    );
    expect(activeBudgets?.total).toBe(0);

    await expect(deleteCategory(db, category.id)).rejects.toThrow(
      "Categoria não encontrada."
    );
  });

  it("manages historical category budgets without redundant records", async () => {
    const category = await createCategory(db, { name: "Mercado" });

    expect(
      await getCategoryBudgetForMonth(db, category.id, "2026-01")
    ).toBeNull();

    expect(await setCategoryBudget(db, category.id, "2026-01", 1000)).toBe(
      1000
    );
    expect(await getCategoryBudgetForMonth(db, category.id, "2026-02")).toBe(
      1000
    );

    expect(await setCategoryBudget(db, category.id, "2026-02", 1000)).toBe(
      1000
    );
    let history = await listCategoryBudgetHistory(db, category.id);
    expect(history).toHaveLength(1);
    expect(history[0].month).toBe("2026-01");

    expect(await setCategoryBudget(db, category.id, "2026-03", 1200)).toBe(
      1200
    );
    expect(await setCategoryBudget(db, category.id, "2026-03", 1500)).toBe(
      1500
    );
    history = await listCategoryBudgetHistory(db, category.id);
    expect(history.map((item) => [item.month, item.amount])).toEqual([
      ["2026-03", 1500],
      ["2026-01", 1000],
    ]);

    expect(await setCategoryBudget(db, category.id, "2026-03", 1000)).toBe(
      1000
    );
    history = await listCategoryBudgetHistory(db, category.id);
    expect(history.map((item) => [item.month, item.amount])).toEqual([
      ["2026-01", 1000],
    ]);
  });

  it("removes category budget from a month while preserving prior months", async () => {
    const category = await createCategory(db, { name: "Assinaturas" });

    await removeCategoryBudget(db, category.id, "2026-01");
    expect(await listCategoryBudgetHistory(db, category.id)).toHaveLength(0);

    await setCategoryBudget(db, category.id, "2026-01", 200);
    await removeCategoryBudget(db, category.id, "2026-03");

    expect(await getCategoryBudgetForMonth(db, category.id, "2026-02")).toBe(
      200
    );
    expect(
      await getCategoryBudgetForMonth(db, category.id, "2026-03")
    ).toBeNull();

    await setCategoryBudget(db, category.id, "2026-03", 300);
    await removeCategoryBudget(db, category.id, "2026-03");
    expect(
      await getCategoryBudgetForMonth(db, category.id, "2026-03")
    ).toBeNull();

    await removeCategoryBudget(db, category.id, "2026-01");
    expect(
      await getCategoryBudgetForMonth(db, category.id, "2026-01")
    ).toBeNull();
  });
});
