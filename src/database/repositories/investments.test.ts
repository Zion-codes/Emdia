import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../../tests/helpers/inMemorySqlite";
import { DatabaseError } from "../errors";
import {
  createContribution,
  createInvestment,
  deleteContribution,
  deleteInvestment,
  getContributionById,
  getInvestmentById,
  listContributions,
  listInvestments,
  updateContribution,
  updateInvestment,
} from "./investments";

describe("investments repository", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("creates, lists, gets, and updates investments keeping currentBalance manual", async () => {
    const cdb = await createInvestment(db, {
      name: " CDB Banco X ",
      type: "Renda Fixa",
      institution: "Banco X",
      currentBalance: 1500,
      notes: "Liquidez diária",
    });
    const stocks = await createInvestment(db, {
      name: "ações",
    });

    expect(cdb.name).toBe("CDB Banco X");
    expect(cdb.currentBalance).toBe(1500);
    expect(stocks.currentBalance).toBe(0);
    expect(stocks.type).toBeNull();

    const list = await listInvestments(db);
    expect(list.map((i) => i.name)).toEqual(["ações", "CDB Banco X"]);

    const updatedName = await updateInvestment(db, stocks.id, {
      name: " Ações Brasil ",
    });
    expect(updatedName.name).toBe("Ações Brasil");
    expect(updatedName.currentBalance).toBe(0);

    const updatedBalance = await updateInvestment(db, stocks.id, {
      type: "Renda Variável",
      institution: "Corretora Y",
      currentBalance: 3200.5,
      notes: "Carteira",
    });
    expect(updatedBalance.currentBalance).toBe(3200.5);
    expect(updatedBalance.type).toBe("Renda Variável");
    expect(updatedBalance.institution).toBe("Corretora Y");
    expect(updatedBalance.notes).toBe("Carteira");

    expect(await getInvestmentById(db, "missing")).toBeNull();
    await expect(createInvestment(db, { name: "  " })).rejects.toThrow(
      DatabaseError
    );
    await expect(
      updateInvestment(db, "missing", { name: "Teste" })
    ).rejects.toThrow("Investimento não encontrado.");
  });

  it("manages contributions independently from currentBalance and aggregates totals", async () => {
    const investment = await createInvestment(db, {
      name: "Tesouro Selic",
      currentBalance: 1000,
    });

    const c1 = await createContribution(db, {
      investmentId: investment.id,
      amount: 250,
      contributedAt: "2026-02-10",
      notes: "Aporte fevereiro",
    });
    const c2 = await createContribution(db, {
      investmentId: investment.id,
      amount: 350.5,
      contributedAt: "2026-03-10T12:00:00Z",
    });

    expect(c2.contributedAt).toBe("2026-03-10");
    expect(c2.notes).toBeNull();

    const afterContributions = await getInvestmentById(db, investment.id);
    expect(afterContributions?.currentBalance).toBe(1000);
    expect(afterContributions?.totalContributed).toBe(600.5);
    expect(afterContributions?.contributionsCount).toBe(2);

    const contributions = await listContributions(db, investment.id);
    expect(contributions.map((c) => c.id)).toEqual([c2.id, c1.id]);

    const fetchedContribution = await getContributionById(db, c1.id);
    expect(fetchedContribution?.amount).toBe(250);
    expect(await getContributionById(db, "missing")).toBeNull();

    const updatedAmount = await updateContribution(db, c1.id, {
      amount: 300,
    });
    expect(updatedAmount.amount).toBe(300);
    expect(updatedAmount.contributedAt).toBe("2026-02-10");

    const updatedMeta = await updateContribution(db, c1.id, {
      contributedAt: "2026-02-15",
      notes: null,
    });
    expect(updatedMeta.contributedAt).toBe("2026-02-15");
    expect(updatedMeta.notes).toBeNull();

    await deleteContribution(db, c2.id);
    expect(await getContributionById(db, c2.id)).toBeNull();

    const afterDeleteContribution = await getInvestmentById(db, investment.id);
    expect(afterDeleteContribution?.totalContributed).toBe(300);
    expect(afterDeleteContribution?.contributionsCount).toBe(1);

    await expect(
      updateContribution(db, "missing", { amount: 100 })
    ).rejects.toThrow("Aporte não encontrado.");
    await expect(deleteContribution(db, "missing")).rejects.toThrow(
      "Aporte não encontrado."
    );
  });

  it("soft-deletes investment and cascades soft delete to active contributions", async () => {
    const investment = await createInvestment(db, { name: "FIIs" });
    const contribution = await createContribution(db, {
      investmentId: investment.id,
      amount: 500,
      contributedAt: "2026-03-01",
    });

    await deleteInvestment(db, investment.id);

    expect(await getInvestmentById(db, investment.id)).toBeNull();
    expect(await getContributionById(db, contribution.id)).toBeNull();

    await expect(deleteInvestment(db, investment.id)).rejects.toThrow(
      "Investimento não encontrado."
    );
  });
});
