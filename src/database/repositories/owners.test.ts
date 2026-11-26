import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import { createCategory } from "./categories";
import {
  buildOwnerShareSummary,
  createOwner,
  deleteOwner,
  getOwnerById,
  getOwnerStatement,
  getSelfOwner,
  listOwners,
  updateOwner,
} from "./owners";

describe("owners repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("lists seeded self owner first and manages CRUD with validations", async () => {
    const selfOwner = await getSelfOwner(db);
    expect(selfOwner).not.toBeNull();
    expect(selfOwner?.name).toBe("EU");
    expect(selfOwner?.isSelf).toBe(true);

    const ana = await createOwner(db, { name: " Ana " });
    const bruno = await createOwner(db, { name: "bruno" });

    expect(ana.name).toBe("Ana");
    expect(ana.isSelf).toBe(false);

    const all = await listOwners(db);
    expect(all.map((o) => o.name)).toEqual(["EU", "Ana", "bruno"]);

    expect((await getOwnerById(db, bruno.id))?.name).toBe("bruno");
    expect(await getOwnerById(db, "missing")).toBeNull();

    const updated = await updateOwner(db, bruno.id, { name: "Bruno Silva" });
    expect(updated.name).toBe("Bruno Silva");

    await expect(createOwner(db, { name: "  " })).rejects.toThrow(
      "O nome do responsável é obrigatório."
    );
    await expect(updateOwner(db, "missing", { name: "Teste" })).rejects.toThrow(
      "Responsável não encontrado."
    );
  });

  it("enforces delete rules: NOT_FOUND, FORBIDDEN for EU, CONFLICT for linked transactions, and soft delete otherwise", async () => {
    const selfOwner = (await getSelfOwner(db))!;
    const joao = await createOwner(db, { name: "João" });
    const maria = await createOwner(db, { name: "Maria" });

    await expect(deleteOwner(db, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await expect(deleteOwner(db, selfOwner.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: 'Não é possível excluir o responsável padrão "EU".',
    });

    await db.runAsync(
      `INSERT INTO transactions (id, name, type, amount, owner_id, created_at, updated_at)
       VALUES (?, ?, 'EXPENSE', ?, ?, ?, ?)`,
      "tx-joao",
      "Almoço",
      5000,
      joao.id,
      "2026-03-01T00:00:00.000Z",
      "2026-03-01T00:00:00.000Z"
    );

    await expect(deleteOwner(db, joao.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await deleteOwner(db, maria.id);
    expect(await getOwnerById(db, maria.id)).toBeNull();
  });

  it("handles getSelfOwner returning null when no active self owner exists", async () => {
    await db.runAsync(
      "UPDATE owners SET deleted_at = '2026-01-01T00:00:00.000Z'"
    );
    expect(await getSelfOwner(db)).toBeNull();
  });

  it("computes paginated owner statement across periods, filters, overdue ordering, and share summaries", async () => {
    const owner = await createOwner(db, { name: "Carlos" });
    const category = await createCategory(db, { name: "Mercado" });
    const refDate = new Date(2026, 2, 15, 12, 0, 0);

    await db.runAsync(
      `INSERT INTO invoices (id, name, limit_amount, due_day, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      "inv-1",
      "Nubank",
      500000,
      10,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z"
    );

    await db.runAsync(
      `INSERT INTO transactions (id, name, type, amount, category_id, owner_id, invoice_id, installments_count, created_at, updated_at)
       VALUES
         ('tx-1', 'Compra Supermercado', 'EXPENSE', 30000, ?, ?, 'inv-1', 2, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
         ('tx-2', 'Reembolso', 'INCOME', 10000, NULL, ?, NULL, 1, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
         ('tx-3', 'Internet', 'EXPENSE', 12000, NULL, ?, NULL, 1, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')`,
      category.id,
      owner.id,
      owner.id,
      owner.id
    );

    await db.runAsync(
      `INSERT INTO installments (id, transaction_id, number, amount, paid_amount, due_date, paid_at, status, created_at, updated_at)
       VALUES
         ('inst-1', 'tx-1', 1, 15000, 0, '2026-02-20', NULL, 'PENDING', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
         ('inst-2', 'tx-1', 2, 15000, 0, '2026-03-20', NULL, 'PENDING', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z'),
         ('inst-3', 'tx-2', 1, 10000, 10000, '2026-03-10', '2026-03-10T10:00:00.000Z', 'PAID', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'),
         ('inst-4', 'tx-3', 1, 12000, 0, '2026-04-05', NULL, 'PENDING', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z')`
    );

    const currentWithOverdue = await getOwnerStatement(db, {
      ownerId: owner.id,
      period: "current_month",
      includeOverdue: true,
      page: 1,
      pageSize: 2,
      referenceDate: refDate,
    });

    expect(currentWithOverdue.totals).toEqual({
      incomeTotal: 100,
      expenseTotal: 300,
      netTotal: -200,
      pendingTotal: 300,
      paidTotal: 100,
      overdueTotal: 150,
      totalCount: 3,
    });
    expect(currentWithOverdue.totalPages).toBe(2);
    expect(currentWithOverdue.items).toHaveLength(2);
    expect(currentWithOverdue.items[0].installmentId).toBe("inst-1");
    expect(currentWithOverdue.items[0].isOverdue).toBe(true);
    expect(currentWithOverdue.items[0].categoryName).toBe("Mercado");
    expect(currentWithOverdue.items[0].invoiceName).toBe("Nubank");
    expect(currentWithOverdue.items[1].installmentId).toBe("inst-3");

    const currentWithoutOverdue = await getOwnerStatement(db, {
      ownerId: owner.id,
      period: "current_month",
      includeOverdue: false,
      type: "EXPENSE",
      referenceDate: refDate,
    });
    expect(currentWithoutOverdue.items).toHaveLength(1);
    expect(currentWithoutOverdue.items[0].installmentId).toBe("inst-2");
    expect(currentWithoutOverdue.totals.incomeTotal).toBe(0);

    const nextMonth = await getOwnerStatement(db, {
      ownerId: owner.id,
      period: "next_month",
      referenceDate: refDate,
    });
    expect(nextMonth.items.map((i) => i.installmentId)).toEqual(["inst-4"]);

    const customRange = await getOwnerStatement(db, {
      ownerId: owner.id,
      period: "range",
      from: "2026-03-01",
      to: "2026-03-31",
      referenceDate: refDate,
    });
    expect(customRange.items).toHaveLength(2);

    const allPeriod = await getOwnerStatement(db, {
      ownerId: owner.id,
      period: "all",
      referenceDate: refDate,
    });
    expect(allPeriod.totals.totalCount).toBe(4);

    const totalSummary = buildOwnerShareSummary(currentWithOverdue, {
      mode: "total",
      periodLabel: "Março/2026",
    });
    expect(totalSummary).toContain("Resumo de Carlos (Março/2026)");
    expect(totalSummary).toContain("Receitas:");
    expect(totalSummary).toContain("Despesas:");
    expect(totalSummary).toContain("Em atraso:");
    expect(totalSummary).not.toContain("Lançamentos:");

    const detailedSummary = buildOwnerShareSummary(allPeriod, {
      mode: "detailed",
      periodLabel: "Todos",
    });
    expect(detailedSummary).toContain("Lançamentos:");
    expect(detailedSummary).toContain("• 20/02 - Compra Supermercado (1/2):");
    expect(detailedSummary).toContain("• 10/03 - Reembolso:");
    expect(detailedSummary).toContain("(1/2)");
    expect(detailedSummary).toContain("(Em atraso)");
    expect(detailedSummary).toContain("(Pago)");
    expect(detailedSummary).toContain("(Pendente)");

    const emptyStatement = await getOwnerStatement(db, {
      ownerId: owner.id,
      period: "range",
      from: "2025-01-01",
      to: "2025-01-31",
      referenceDate: refDate,
    });
    const emptyDetailedSummary = buildOwnerShareSummary(emptyStatement, {
      mode: "detailed",
      periodLabel: "Jan/2025",
    });
    expect(emptyDetailedSummary).toContain("Nenhum lançamento no período.");
    expect(emptyDetailedSummary).not.toContain("Receitas:");
    expect(emptyDetailedSummary).not.toContain("Despesas:");
    expect(emptyDetailedSummary).not.toContain("Em atraso:");
  });

  it("validates getOwnerStatement parameters", async () => {
    const selfOwner = (await getSelfOwner(db))!;

    await expect(
      getOwnerStatement(db, { ownerId: "missing", period: "all" })
    ).rejects.toThrow(DatabaseError);

    await expect(
      getOwnerStatement(db, { ownerId: selfOwner.id, period: "all", page: 0 })
    ).rejects.toThrow(
      "A página deve ser um número inteiro maior ou igual a 1."
    );

    await expect(
      getOwnerStatement(db, {
        ownerId: selfOwner.id,
        period: "all",
        pageSize: 0,
      })
    ).rejects.toThrow(
      "O tamanho da página deve ser um número inteiro maior ou igual a 1."
    );

    await expect(
      getOwnerStatement(db, { ownerId: selfOwner.id, period: "range" })
    ).rejects.toThrow("Informe as datas inicial e final do período.");

    await expect(
      getOwnerStatement(db, {
        ownerId: selfOwner.id,
        period: "range",
        from: "2026-04-10",
        to: "2026-04-01",
      })
    ).rejects.toThrow("A data inicial não pode ser maior que a data final.");
  });
});
