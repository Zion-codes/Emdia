import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import { generateUuid, nowIsoUtc } from "../utils";
import { createCategory } from "./categories";
import { settleInstallment, type InstallmentStatus } from "./installments";
import { createOwner, getSelfOwner } from "./owners";
import {
  type AmountMode,
  createSplitTransaction,
  createTransaction,
  deleteTransaction,
  deleteTransactionGroup,
  findDuplicateTransactions,
  getTransactionById,
  getTransactionGroup,
  listTransactions,
  type RemainderDistribution,
  type TransactionSortBy,
  type TransactionSortOrder,
  updateTransaction,
} from "./transactions";

async function insertInvoice(
  db: SQLite.SQLiteDatabase,
  name: string
): Promise<string> {
  const id = generateUuid();
  const timestamp = nowIsoUtc();
  await db.runAsync(
    `INSERT INTO invoices (
       id, name, limit_amount, color, due_day, closing_day, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 500000, '#2563EB', 10, 3, ?, ?, NULL)`,
    id,
    name,
    timestamp,
    timestamp
  );
  return id;
}

describe("transactions repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("creates single, installment (total and per_installment), and recurring transactions", async () => {
    const selfOwner = await getSelfOwner(db);
    const category = await createCategory(db, { name: "Moradia" });
    const invoiceId = await insertInvoice(db, "Cartão Nubank");

    const single = await createTransaction(db, {
      name: "  Salário  ",
      type: "INCOME",
      amount: 5000,
      dueDate: "2026-01-05",
      ownerId: selfOwner!.id,
      recurrence: true,
      active: false,
      notes: "  Folha mensal  ",
    });

    expect(single.name).toBe("Salário");
    expect(single.type).toBe("INCOME");
    expect(single.amount).toBe(5000);
    expect(single.recurrence).toBe(true);
    expect(single.active).toBe(false);
    expect(single.notes).toBe("Folha mensal");
    expect(single.installments).toHaveLength(1);
    expect(single.installments[0].dueDate).toBe("2026-01-05");

    const parcelledTotal = await createTransaction(db, {
      name: "Celular",
      type: "EXPENSE",
      amount: 100.02,
      dueDate: "2026-01-31",
      ownerId: selfOwner!.id,
      categoryId: category.id,
      invoiceId,
      installmentsCount: 4,
      amountMode: "total",
      remainderDistribution: "last",
      notes: "   ",
    });

    expect(parcelledTotal.amount).toBe(100.02);
    expect(parcelledTotal.categoryId).toBe(category.id);
    expect(parcelledTotal.invoiceId).toBe(invoiceId);
    expect(parcelledTotal.notes).toBeNull();
    expect(parcelledTotal.installments.map((i) => i.amount)).toEqual([
      25, 25, 25.01, 25.01,
    ]);
    expect(parcelledTotal.installments.map((i) => i.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);

    const perInstallment = await createTransaction(db, {
      name: "Curso",
      type: "EXPENSE",
      amount: 150,
      dueDate: "2026-03-10",
      ownerId: selfOwner!.id,
      installmentsCount: 3,
      amountMode: "per_installment",
    });

    expect(perInstallment.amount).toBe(450);
    expect(perInstallment.installments.map((i) => i.amount)).toEqual([
      150, 150, 150,
    ]);
  });

  it("validates inputs, foreign keys, recurrence/installment conflict, and duplicates", async () => {
    const selfOwner = await getSelfOwner(db);

    await expect(
      createTransaction(db, {
        name: "   ",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
      })
    ).rejects.toThrow("O nome do lançamento é obrigatório.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 100,
        dueDate: "2026-03-01",
        ownerId: selfOwner!.id,
        installmentsCount: 361,
      })
    ).rejects.toThrow("A quantidade de parcelas não pode exceder 360.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 90071992547409,
        dueDate: "2026-03-01",
        ownerId: selfOwner!.id,
        installmentsCount: 2,
        amountMode: "per_installment",
      })
    ).rejects.toThrow("O valor total das parcelas excede o limite seguro.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 100,
        dueDate: "2026-03-01",
        ownerId: selfOwner!.id,
        amountMode: "invalid" as AmountMode,
      })
    ).rejects.toThrow("Modo de valor inválido. Use total ou per_installment.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 100,
        dueDate: "2026-03-01",
        ownerId: selfOwner!.id,
        remainderDistribution: "middle" as RemainderDistribution,
      })
    ).rejects.toThrow("Distribuição de centavos inválida. Use last ou first.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "INVALID" as "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
      })
    ).rejects.toThrow("O tipo do lançamento deve ser INCOME ou EXPENSE.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: "   ",
      })
    ).rejects.toThrow("O responsável é obrigatório.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
        installmentsCount: 0,
      })
    ).rejects.toThrow(
      "A quantidade de parcelas deve ser um inteiro maior ou igual a 1."
    );

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
        installmentsCount: 2,
        recurrence: true,
      })
    ).rejects.toThrow("Lançamentos recorrentes não podem ser parcelados.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 0.02,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
        installmentsCount: 3,
      })
    ).rejects.toThrow(
      "O valor total deve ser de pelo menos 1 centavo por parcela."
    );

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: "missing-owner",
      })
    ).rejects.toThrow("Responsável não encontrado.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
        categoryId: "missing-category",
      })
    ).rejects.toThrow("Categoria não encontrada.");

    await expect(
      createTransaction(db, {
        name: "Teste",
        type: "EXPENSE",
        amount: 10,
        dueDate: "2026-01-10",
        ownerId: selfOwner!.id,
        invoiceId: "missing-invoice",
      })
    ).rejects.toThrow("Fatura não encontrada.");

    await createTransaction(db, {
      name: "Café da Manhã",
      type: "EXPENSE",
      amount: 35,
      dueDate: "2026-05-10",
      ownerId: selfOwner!.id,
    });

    const foundDuplicates = await findDuplicateTransactions(db, {
      name: "  café da manhã ",
      amount: 35,
      dueDate: "2026-05-10",
      ownerId: selfOwner!.id,
    });
    expect(foundDuplicates).toHaveLength(1);

    await expect(
      createTransaction(db, {
        name: "café da manhã",
        type: "EXPENSE",
        amount: 35,
        dueDate: "2026-05-10",
        ownerId: selfOwner!.id,
      })
    ).rejects.toThrow(
      "Já existe um lançamento semelhante para este responsável, valor e vencimento."
    );

    const allowedDuplicate = await createTransaction(db, {
      name: "café da manhã",
      type: "EXPENSE",
      amount: 35,
      dueDate: "2026-05-10",
      ownerId: selfOwner!.id,
      allowDuplicate: true,
    });
    expect(allowedDuplicate.id).toBeDefined();
  });

  it("creates split transactions atomically and rolls back on failure", async () => {
    const selfOwner = await getSelfOwner(db);
    const friendA = await createOwner(db, { name: "Ana" });
    const friendB = await createOwner(db, { name: "Bruno" });

    await expect(
      createSplitTransaction(db, {
        name: "Jantar",
        type: "EXPENSE",
        totalAmount: 100,
        dueDate: "2026-06-10",
        parts: [
          { ownerId: selfOwner!.id, amount: 50000000000000 },
          { ownerId: friendA.id, amount: 50000000000000 },
        ],
      })
    ).rejects.toThrow("A soma das partes excede o limite seguro.");

    await expect(
      createSplitTransaction(db, {
        name: "Jantar",
        type: "EXPENSE",
        totalAmount: 100,
        dueDate: "2026-06-10",
        parts: [{ ownerId: selfOwner!.id, amount: 100 }],
      })
    ).rejects.toThrow("A divisão de contas exige entre 2 e 10 responsáveis.");

    await expect(
      createSplitTransaction(db, {
        name: "Jantar",
        type: "EXPENSE",
        totalAmount: 100,
        dueDate: "2026-06-10",
        parts: Array.from({ length: 11 }, () => ({
          ownerId: selfOwner!.id,
          amount: 10,
        })),
      })
    ).rejects.toThrow("A divisão de contas exige entre 2 e 10 responsáveis.");

    await expect(
      createSplitTransaction(db, {
        name: "Jantar",
        type: "EXPENSE",
        totalAmount: 100,
        dueDate: "2026-06-10",
        parts: [
          { ownerId: selfOwner!.id, amount: 50 },
          { ownerId: selfOwner!.id, amount: 50 },
        ],
      })
    ).rejects.toThrow("Os responsáveis da divisão devem ser distintos.");

    await expect(
      createSplitTransaction(db, {
        name: "Jantar",
        type: "EXPENSE",
        totalAmount: 100,
        dueDate: "2026-06-10",
        parts: [
          { ownerId: selfOwner!.id, amount: 60 },
          { ownerId: friendA.id, amount: 39.99 },
        ],
      })
    ).rejects.toThrow(
      "A soma das partes deve ser exatamente igual ao valor total."
    );

    await expect(
      createSplitTransaction(db, {
        name: "Jantar",
        type: "EXPENSE",
        totalAmount: 100,
        dueDate: "2026-06-10",
        parts: [
          { ownerId: selfOwner!.id, amount: 50 },
          { ownerId: "missing-owner", amount: 50 },
        ],
      })
    ).rejects.toThrow("Responsável não encontrado.");

    const afterRollback = await listTransactions(db);
    expect(afterRollback).toHaveLength(0);

    const created = await createSplitTransaction(db, {
      name: "Compra Compartilhada",
      type: "EXPENSE",
      totalAmount: 300,
      dueDate: "2026-08-15",
      parts: [
        {
          ownerId: selfOwner!.id,
          amount: 100,
          installmentsCount: 2,
          amountMode: "total",
        },
        {
          ownerId: friendA.id,
          amount: 50,
          installmentsCount: 2,
          amountMode: "per_installment",
        },
        {
          ownerId: friendB.id,
          amount: 100,
          installmentsCount: 3,
          remainderDistribution: "first",
        },
      ],
    });

    expect(created).toHaveLength(3);
    const groupId = created[0].groupId as string;
    expect(created.every((tx) => tx.groupId === groupId)).toBe(true);
    expect(created[2].installments.map((i) => i.amount)).toEqual([
      33.34, 33.33, 33.33,
    ]);

    const group = await getTransactionGroup(db, groupId);
    expect(group).toHaveLength(3);
    expect(await getTransactionGroup(db, "missing-group")).toEqual([]);

    await expect(getTransactionGroup(db, "   ")).rejects.toThrow(
      "O identificador do grupo é obrigatório."
    );
  });

  it("gets, updates, and soft deletes single transactions and groups", async () => {
    const selfOwner = await getSelfOwner(db);
    const otherOwner = await createOwner(db, { name: "Carlos" });
    const category = await createCategory(db, { name: "Transporte" });
    const invoiceId = await insertInvoice(db, "Cartão Inter");

    expect(await getTransactionById(db, "missing")).toBeNull();

    const created = await createTransaction(db, {
      name: "Uber",
      type: "EXPENSE",
      amount: 45,
      dueDate: "2026-04-10",
      ownerId: selfOwner!.id,
    });

    const fetched = await getTransactionById(db, created.id);
    expect(fetched?.id).toBe(created.id);

    const updated = await updateTransaction(db, created.id, {
      name: "Uber Trabalho",
      type: "EXPENSE",
      categoryId: category.id,
      ownerId: otherOwner.id,
      invoiceId,
      recurrence: true,
      active: false,
      notes: "Reembolsável",
    });

    expect(updated.name).toBe("Uber Trabalho");
    expect(updated.categoryId).toBe(category.id);
    expect(updated.ownerId).toBe(otherOwner.id);
    expect(updated.invoiceId).toBe(invoiceId);
    expect(updated.recurrence).toBe(true);
    expect(updated.active).toBe(false);
    expect(updated.notes).toBe("Reembolsável");

    const updatedNoChanges = await updateTransaction(db, created.id, {});
    expect(updatedNoChanges.name).toBe("Uber Trabalho");

    const updatedToggled = await updateTransaction(db, created.id, {
      recurrence: false,
      active: true,
    });
    expect(updatedToggled.recurrence).toBe(false);
    expect(updatedToggled.active).toBe(true);

    await expect(getTransactionById(db, "   ")).rejects.toThrow(
      "O identificador do lançamento é obrigatório."
    );

    await expect(updateTransaction(db, "   ", { name: "X" })).rejects.toThrow(
      "O identificador do lançamento é obrigatório."
    );

    await expect(deleteTransaction(db, "   ")).rejects.toThrow(
      "O identificador do lançamento é obrigatório."
    );

    await expect(
      updateTransaction(db, "missing", { name: "X" })
    ).rejects.toThrow("Lançamento não encontrado.");

    const parcelled = await createTransaction(db, {
      name: "Sofá",
      type: "EXPENSE",
      amount: 600,
      dueDate: "2026-04-10",
      ownerId: selfOwner!.id,
      installmentsCount: 2,
    });

    await expect(
      updateTransaction(db, parcelled.id, { recurrence: true })
    ).rejects.toThrow("Lançamentos recorrentes não podem ser parcelados.");

    await deleteTransaction(db, created.id);
    expect(await getTransactionById(db, created.id)).toBeNull();

    await expect(deleteTransaction(db, created.id)).rejects.toThrow(
      "Lançamento não encontrado."
    );

    const split = await createSplitTransaction(db, {
      name: "Aluguel",
      type: "EXPENSE",
      totalAmount: 1000,
      dueDate: "2026-09-10",
      parts: [
        { ownerId: selfOwner!.id, amount: 500 },
        { ownerId: otherOwner.id, amount: 500 },
      ],
    });
    const groupId = split[0].groupId as string;

    await deleteTransactionGroup(db, groupId);
    expect(await getTransactionGroup(db, groupId)).toEqual([]);

    await expect(deleteTransactionGroup(db, groupId)).rejects.toThrow(
      "Grupo de lançamentos não encontrado."
    );

    await expect(deleteTransactionGroup(db, "  ")).rejects.toThrow(
      DatabaseError
    );
  });

  it("lists transactions with filters, escaped search, includeOverdue, and sorting", async () => {
    const selfOwner = await getSelfOwner(db);
    const friend = await createOwner(db, { name: "Duda" });
    const catFood = await createCategory(db, { name: "Alimentação" });
    const invoiceId = await insertInvoice(db, "Visa");

    const overdueTx = await createTransaction(db, {
      name: "100% Supermercado_Teste",
      type: "EXPENSE",
      amount: 120,
      dueDate: "2026-02-10",
      ownerId: selfOwner!.id,
      categoryId: catFood.id,
      invoiceId,
    });

    const paidTx = await createTransaction(db, {
      name: "Academia",
      type: "EXPENSE",
      amount: 90,
      dueDate: "2026-03-05",
      ownerId: selfOwner!.id,
    });
    await settleInstallment(db, paidTx.installments[0].id, {
      confirmed: true,
      paidAt: "2026-03-04",
    });

    const incomeTx = await createTransaction(db, {
      name: "Bônus",
      type: "INCOME",
      amount: 800,
      dueDate: "2026-03-20",
      ownerId: friend.id,
    });

    const split = await createSplitTransaction(db, {
      name: "Pizza",
      type: "EXPENSE",
      totalAmount: 100,
      dueDate: "2026-03-15",
      parts: [
        { ownerId: selfOwner!.id, amount: 50 },
        { ownerId: friend.id, amount: 50 },
      ],
    });
    const groupId = split[0].groupId as string;

    const referenceDate = new Date(2026, 2, 18);

    const monthWithOverdue = await listTransactions(db, {
      month: "2026-03",
      includeOverdue: true,
      referenceDate,
      sortBy: "overdue_first",
      sortOrder: "asc",
    });
    expect(monthWithOverdue[0].transactionId).toBe(overdueTx.id);
    expect(monthWithOverdue[0].isOverdue).toBe(true);

    const monthOnly = await listTransactions(db, {
      month: "2026-03",
      includeOverdue: false,
      referenceDate,
    });
    expect(monthOnly.some((item) => item.transactionId === overdueTx.id)).toBe(
      false
    );

    const escapedSearch = await listTransactions(db, {
      search: "100% Supermercado_Teste",
    });
    expect(escapedSearch).toHaveLength(1);
    expect(escapedSearch[0].transactionId).toBe(overdueTx.id);

    const blankSearch = await listTransactions(db, {
      search: "   ",
      sortBy: "name",
      sortOrder: "desc",
    });
    expect(blankSearch.length).toBeGreaterThanOrEqual(4);

    const filteredByAll = await listTransactions(db, {
      categoryId: catFood.id,
      ownerId: selfOwner!.id,
      invoiceId,
      type: "EXPENSE",
      status: "PENDING",
      sortBy: "due_date",
      sortOrder: "desc",
    });
    expect(filteredByAll).toHaveLength(1);
    expect(filteredByAll[0].categoryName).toBe("Alimentação");
    expect(filteredByAll[0].invoiceName).toBe("Visa");

    const filteredByGroup = await listTransactions(db, {
      groupId,
      sortBy: "overdue_first",
      sortOrder: "desc",
    });
    expect(filteredByGroup).toHaveLength(2);

    const filteredIncome = await listTransactions(db, {
      type: "INCOME",
      ownerId: friend.id,
    });
    expect(filteredIncome).toHaveLength(1);
    expect(filteredIncome[0].transactionId).toBe(incomeTx.id);

    await expect(
      listTransactions(db, { status: "CANCELLED" as InstallmentStatus })
    ).rejects.toThrow("Status da parcela inválido. Use PENDING ou PAID.");

    await expect(
      listTransactions(db, { sortBy: "amount" as TransactionSortBy })
    ).rejects.toThrow("Campo de ordenação inválido.");

    await expect(
      listTransactions(db, { sortOrder: "random" as TransactionSortOrder })
    ).rejects.toThrow("Direção de ordenação inválida. Use asc ou desc.");
  });
});
