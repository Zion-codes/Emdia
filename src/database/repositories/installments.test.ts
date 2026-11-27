import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import {
  getInstallmentById,
  listInstallmentsByTransaction,
  registerInstallmentPayment,
  revertInstallmentPayment,
  revertTransactionGroup,
  settleInstallment,
  settleTransactionGroup,
} from "./installments";
import { createOwner, getSelfOwner } from "./owners";
import {
  createSplitTransaction,
  createTransaction,
  deleteTransaction,
} from "./transactions";

describe("installments repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("gets installment by id with remainingAmount and isOverdue", async () => {
    const selfOwner = await getSelfOwner(db);
    const created = await createTransaction(db, {
      name: "Aluguel",
      type: "EXPENSE",
      amount: 1200,
      dueDate: "2026-03-10",
      ownerId: selfOwner!.id,
    });

    const installmentId = created.installments[0].id;
    const overdue = await getInstallmentById(
      db,
      installmentId,
      new Date(2026, 2, 15)
    );
    expect(overdue).not.toBeNull();
    expect(overdue?.amount).toBe(1200);
    expect(overdue?.paidAmount).toBe(0);
    expect(overdue?.remainingAmount).toBe(1200);
    expect(overdue?.isOverdue).toBe(true);

    const notOverdue = await getInstallmentById(
      db,
      installmentId,
      new Date(2026, 2, 10)
    );
    expect(notOverdue?.isOverdue).toBe(false);

    expect(await getInstallmentById(db, "missing-id")).toBeNull();

    await deleteTransaction(db, created.id);
    expect(await getInstallmentById(db, installmentId)).toBeNull();
  });

  it("lists installments by transaction ordered by number and throws NOT_FOUND for missing transaction", async () => {
    const selfOwner = await getSelfOwner(db);
    const created = await createTransaction(db, {
      name: "Notebook",
      type: "EXPENSE",
      amount: 3000,
      dueDate: "2026-01-31",
      ownerId: selfOwner!.id,
      installmentsCount: 3,
    });

    const list = await listInstallmentsByTransaction(
      db,
      created.id,
      new Date(2026, 1, 10)
    );
    expect(list.map((item) => item.number)).toEqual([1, 2, 3]);
    expect(list.map((item) => item.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(list[0].isOverdue).toBe(true);
    expect(list[1].isOverdue).toBe(false);

    await expect(
      listInstallmentsByTransaction(db, "missing-tx")
    ).rejects.toThrow("Lançamento não encontrado.");
  });

  it("registers partial and final payments and validates errors", async () => {
    const selfOwner = await getSelfOwner(db);
    const created = await createTransaction(db, {
      name: "Internet",
      type: "EXPENSE",
      amount: 100,
      dueDate: "2026-05-10",
      ownerId: selfOwner!.id,
    });

    const installmentId = created.installments[0].id;

    const partial = await registerInstallmentPayment(db, {
      installmentId,
      amount: 40,
    });
    expect(partial.paidAmount).toBe(40);
    expect(partial.remainingAmount).toBe(60);
    expect(partial.status).toBe("PENDING");
    expect(partial.paidAt).toBeNull();

    await expect(
      registerInstallmentPayment(db, {
        installmentId,
        amount: 61,
      })
    ).rejects.toThrow(
      "O valor do pagamento excede o saldo restante da parcela."
    );

    const completed = await registerInstallmentPayment(db, {
      installmentId,
      amount: 60,
      paidAt: "2026-05-09",
    });
    expect(completed.paidAmount).toBe(100);
    expect(completed.remainingAmount).toBe(0);
    expect(completed.status).toBe("PAID");
    expect(completed.paidAt).toBe("2026-05-09");
    expect(completed.isOverdue).toBe(false);

    await expect(
      registerInstallmentPayment(db, {
        installmentId,
        amount: 10,
      })
    ).rejects.toThrow("Esta parcela já está quitada.");

    await expect(
      registerInstallmentPayment(db, {
        installmentId: "missing-id",
        amount: 10,
      })
    ).rejects.toThrow("Parcela não encontrada.");

    await expect(
      registerInstallmentPayment(db, {
        installmentId,
        amount: 0,
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      registerInstallmentPayment(db, {
        installmentId: "   ",
        amount: 10,
      })
    ).rejects.toThrow("O identificador da parcela é obrigatório.");

    await expect(
      registerInstallmentPayment(db, {
        installmentId,
        amount: 10,
        paidAt: "invalid-date",
      })
    ).rejects.toThrow(DatabaseError);

    await expect(
      registerInstallmentPayment(db, {
        installmentId,
        amount: 10,
        paidAt: "2026-05-10Tqualquer-coisa",
      })
    ).rejects.toThrow("Data inválida. Use o formato AAAA-MM-DD.");

    await expect(
      registerInstallmentPayment(db, {
        installmentId,
        amount: 10,
        paidAt: "2026-05-10T25:00:00Z",
      })
    ).rejects.toThrow("Data inválida. Use o formato AAAA-MM-DD.");
  });

  it("settles and reverts an installment only when confirmed", async () => {
    const selfOwner = await getSelfOwner(db);
    const created = await createTransaction(db, {
      name: "Energia",
      type: "EXPENSE",
      amount: 250,
      dueDate: "2026-06-10",
      ownerId: selfOwner!.id,
    });

    const installmentId = created.installments[0].id;

    await expect(
      settleInstallment(db, installmentId, { confirmed: false })
    ).rejects.toThrow(
      "Confirmação explícita é obrigatória para quitar a parcela."
    );

    await expect(
      settleInstallment(db, "   ", { confirmed: true })
    ).rejects.toThrow("O identificador da parcela é obrigatório.");

    await expect(
      settleInstallment(db, installmentId, {
        confirmed: true,
        paidAt: "2026-05-10Tqualquer-coisa",
      })
    ).rejects.toThrow("Data inválida. Use o formato AAAA-MM-DD.");

    await expect(
      revertInstallmentPayment(db, "   ", { confirmed: true })
    ).rejects.toThrow("O identificador da parcela é obrigatório.");

    const settled = await settleInstallment(db, installmentId, {
      confirmed: true,
      paidAt: "2026-06-10T14:30:00-03:00",
    });
    expect(settled.status).toBe("PAID");
    expect(settled.paidAmount).toBe(250);
    expect(settled.remainingAmount).toBe(0);
    expect(settled.paidAt).toBe("2026-06-10T14:30:00-03:00");

    await expect(
      settleInstallment(db, installmentId, { confirmed: true })
    ).rejects.toThrow("Esta parcela já está quitada.");

    await expect(
      revertInstallmentPayment(db, installmentId, { confirmed: false })
    ).rejects.toThrow(
      "Confirmação explícita é obrigatória para reverter o pagamento."
    );

    const reverted = await revertInstallmentPayment(db, installmentId, {
      confirmed: true,
    });
    expect(reverted.status).toBe("PENDING");
    expect(reverted.paidAmount).toBe(0);
    expect(reverted.remainingAmount).toBe(250);
    expect(reverted.paidAt).toBeNull();

    await expect(
      revertInstallmentPayment(db, installmentId, { confirmed: true })
    ).rejects.toThrow("Esta parcela não possui pagamento para reverter.");

    await registerInstallmentPayment(db, {
      installmentId,
      amount: 50,
    });
    const revertedPartial = await revertInstallmentPayment(db, installmentId, {
      confirmed: true,
    });
    expect(revertedPartial.paidAmount).toBe(0);
    expect(revertedPartial.status).toBe("PENDING");
  });

  it("settles and reverts transaction groups with optional filters and validation", async () => {
    const selfOwner = await getSelfOwner(db);
    const friend = await createOwner(db, { name: "Marina" });

    const split = await createSplitTransaction(db, {
      name: "Viagem",
      type: "EXPENSE",
      totalAmount: 400,
      dueDate: "2026-07-15",
      parts: [
        { ownerId: selfOwner!.id, amount: 200, installmentsCount: 2 },
        { ownerId: friend.id, amount: 200, installmentsCount: 2 },
      ],
    });

    const groupId = split[0].groupId as string;

    await expect(
      settleTransactionGroup(db, groupId, { confirmed: false })
    ).rejects.toThrow(
      "Confirmação explícita é obrigatória para quitar o grupo."
    );

    await expect(
      revertTransactionGroup(db, groupId, { confirmed: false })
    ).rejects.toThrow(
      "Confirmação explícita é obrigatória para reverter o grupo."
    );

    await expect(
      settleTransactionGroup(db, "   ", { confirmed: true })
    ).rejects.toThrow("O identificador do grupo é obrigatório.");

    await expect(
      settleTransactionGroup(db, "missing-group", { confirmed: true })
    ).rejects.toThrow("Grupo de lançamentos não encontrado.");

    await expect(
      revertTransactionGroup(db, "missing-group", { confirmed: true })
    ).rejects.toThrow("Grupo de lançamentos não encontrado.");

    await expect(
      settleTransactionGroup(db, groupId, {
        confirmed: true,
        installmentNumber: 0,
      })
    ).rejects.toThrow(
      "O número da parcela deve ser um inteiro maior ou igual a 1."
    );

    await expect(
      settleTransactionGroup(db, groupId, {
        confirmed: true,
        installmentNumber: 99,
      })
    ).rejects.toThrow(
      "Nenhuma parcela encontrada para os critérios informados."
    );

    await expect(
      revertTransactionGroup(db, groupId, {
        confirmed: true,
        month: "2026-12",
      })
    ).rejects.toThrow(
      "Nenhuma parcela encontrada para os critérios informados."
    );

    const settledMonth = await settleTransactionGroup(db, groupId, {
      confirmed: true,
      month: "2026-07",
      paidAt: "2026-07-10",
    });
    expect(settledMonth).toHaveLength(2);
    expect(settledMonth.every((item) => item.status === "PAID")).toBe(true);
    expect(settledMonth.every((item) => item.paidAt === "2026-07-10")).toBe(
      true
    );

    const settledMonthAgain = await settleTransactionGroup(db, groupId, {
      confirmed: true,
      month: "2026-07",
    });
    expect(settledMonthAgain.every((item) => item.status === "PAID")).toBe(
      true
    );

    const revertedNumber = await revertTransactionGroup(db, groupId, {
      confirmed: true,
      installmentNumber: 1,
    });
    expect(revertedNumber).toHaveLength(2);
    expect(revertedNumber.every((item) => item.status === "PENDING")).toBe(
      true
    );

    const revertedAgain = await revertTransactionGroup(db, groupId, {
      confirmed: true,
      installmentNumber: 1,
    });
    expect(revertedAgain.every((item) => item.status === "PENDING")).toBe(true);

    await registerInstallmentPayment(db, {
      installmentId: revertedAgain[0].id,
      amount: 25,
    });
    const revertedWithPartial = await revertTransactionGroup(db, groupId, {
      confirmed: true,
      installmentNumber: 1,
    });
    expect(revertedWithPartial.every((item) => item.paidAmount === 0)).toBe(
      true
    );
  });
});
