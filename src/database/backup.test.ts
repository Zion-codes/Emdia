import * as SQLite from "expo-sqlite";
import { createTestDatabase } from "../../tests/helpers/inMemorySqlite";
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupPayloadV1,
  exportDatabaseBackup,
  getUtf8ByteLength,
  MAX_BACKUP_FILE_SIZE_BYTES,
  parseAndValidateBackup,
  restoreDatabaseBackup,
  summarizeBackup,
} from "./backup";
import { DatabaseError } from "./errors";
import * as recurrenceModule from "./recurrence";

async function seedFullSample(db: SQLite.SQLiteDatabase): Promise<void> {
  const ts = "2026-01-10T10:00:00.000Z";
  await db.execAsync(`
    INSERT INTO categories (id, name, color, icon, created_at, updated_at, deleted_at)
    VALUES
      ('cat-1', 'Moradia', '#112233', 'home', '${ts}', '${ts}', NULL),
      ('cat-deleted', 'Antiga', NULL, NULL, '${ts}', '${ts}', '${ts}');

    INSERT INTO owners (id, name, is_self, created_at, updated_at, deleted_at)
    VALUES
      ('owner-other', 'Maria', 0, '${ts}', '${ts}', NULL);

    INSERT INTO invoices (id, name, limit_amount, color, due_day, closing_day, created_at, updated_at, deleted_at)
    VALUES
      ('inv-1', 'Nubank', 500000, '#8A05BE', 10, 3, '${ts}', '${ts}', NULL),
      ('inv-2', 'Sem Fechamento', 100000, NULL, 15, NULL, '${ts}', '${ts}', NULL);

    INSERT INTO goals (id, since, amount, created_at, updated_at, deleted_at)
    VALUES
      ('goal-1', '2026-01', 150000, '${ts}', '${ts}', NULL),
      ('goal-deleted', '2026-01', 120000, '${ts}', '${ts}', '${ts}');

    INSERT INTO investments (id, name, type, institution, current_balance, notes, created_at, updated_at, deleted_at)
    VALUES
      ('invest-1', 'Tesouro Selic', 'Renda Fixa', 'XP', 250000, 'Reserva', '${ts}', '${ts}', NULL);

    INSERT INTO app_settings (key, value, created_at, updated_at, deleted_at)
    VALUES
      ('currency', 'BRL', '${ts}', '${ts}', NULL);

    INSERT INTO category_budgets (id, category_id, month, amount, created_at, updated_at, deleted_at)
    VALUES
      ('budget-1', 'cat-1', '2026-01', 200000, '${ts}', '${ts}', NULL),
      ('budget-deleted', 'cat-1', '2026-01', 150000, '${ts}', '${ts}', '${ts}');

    INSERT INTO transactions (id, name, type, amount, category_id, owner_id, invoice_id, group_id, installments_count, recurrence, active, notes, created_at, updated_at, deleted_at)
    VALUES
      ('tx-1', 'Aluguel', 'EXPENSE', 180000, 'cat-1', 'owner-other', 'inv-1', NULL, 1, 1, 1, 'Mensal', '${ts}', '${ts}', NULL),
      ('tx-2', 'Sem Categoria', 'INCOME', 50000, NULL, 'owner-other', NULL, 'grp-1', 1, 0, 1, NULL, '${ts}', '${ts}', '${ts}');

    INSERT INTO installments (id, transaction_id, number, amount, paid_amount, due_date, paid_at, status, created_at, updated_at, deleted_at)
    VALUES
      ('inst-1', 'tx-1', 1, 180000, 180000, '2026-01-10', '2026-01-10T12:00:00.000Z', 'PAID', '${ts}', '${ts}', NULL),
      ('inst-deleted', 'tx-1', 1, 180000, 0, '2026-01-10', NULL, 'PENDING', '${ts}', '${ts}', '${ts}');

    INSERT INTO investment_contributions (id, investment_id, amount, contributed_at, notes, created_at, updated_at, deleted_at)
    VALUES
      ('contrib-1', 'invest-1', 50000, '2026-01-05', 'Aporte inicial', '${ts}', '${ts}', NULL);
  `);
}

describe("database backup", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("exports all 10 tables including soft-deleted records inside a transaction and summarizes counts", async () => {
    await seedFullSample(db);
    const txSpy = jest.spyOn(db, "withTransactionAsync");

    const payload = await exportDatabaseBackup(db);

    expect(txSpy).toHaveBeenCalledTimes(1);
    txSpy.mockRestore();

    expect(payload.app).toBe(BACKUP_APP);
    expect(payload.format).toBe(BACKUP_FORMAT);
    expect(payload.backupVersion).toBe(BACKUP_VERSION);
    expect(payload.schemaVersion).toBe(1);
    expect(payload.exportedAt).toBeTruthy();

    expect(payload.data.categories).toHaveLength(2);
    expect(
      payload.data.categories.some((item) => item.deleted_at !== null)
    ).toBe(true);
    expect(payload.data.owners).toHaveLength(2);
    expect(payload.data.invoices).toHaveLength(2);
    expect(payload.data.goals).toHaveLength(2);
    expect(payload.data.investments).toHaveLength(1);
    expect(payload.data.app_settings).toHaveLength(1);
    expect(payload.data.category_budgets).toHaveLength(2);
    expect(payload.data.transactions).toHaveLength(2);
    expect(payload.data.installments).toHaveLength(2);
    expect(payload.data.investment_contributions).toHaveLength(1);

    const summary = summarizeBackup(payload);
    expect(summary.schemaVersion).toBe(1);
    expect(summary.backupVersion).toBe(1);
    expect(summary.totalRecords).toBe(17);
    expect(summary.counts.transactions).toBe(2);
  });

  it("parses and validates a valid exported backup", async () => {
    await seedFullSample(db);
    const payload = await exportDatabaseBackup(db);

    const validated = parseAndValidateBackup(JSON.stringify(payload));
    expect(validated).toEqual(payload);
  });

  it("rejects malformed headers, invalid row types, broken FKs and invalid self owners", async () => {
    await seedFullSample(db);
    const base = await exportDatabaseBackup(db);

    const expectValidationError = (fn: () => unknown): void => {
      try {
        fn();
        throw new Error("Expected DatabaseError");
      } catch (error) {
        expect(error).toBeInstanceOf(DatabaseError);
        expect((error as DatabaseError).code).toBe("VALIDATION_ERROR");
      }
    };

    expectValidationError(() => parseAndValidateBackup("   "));
    expectValidationError(() =>
      parseAndValidateBackup("x".repeat(MAX_BACKUP_FILE_SIZE_BYTES + 1))
    );
    expect(getUtf8ByteLength("aá€🚀\uD800")).toBe(1 + 2 + 3 + 4 + 3);
    expectValidationError(() =>
      parseAndValidateBackup("🚀".repeat(5 * 1024 * 1024 + 1))
    );
    expectValidationError(() => parseAndValidateBackup("{invalid-json"));
    expectValidationError(() => parseAndValidateBackup("[]"));
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, app: "other" }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, format: "other" }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, backupVersion: 2 }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, schemaVersion: 0 }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, schemaVersion: 2 }), 1)
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, schemaVersion: 1.5 }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, exportedAt: "" }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify({ ...base, data: null }))
    );
    expectValidationError(() =>
      parseAndValidateBackup(
        JSON.stringify({
          ...base,
          data: { ...base.data, categories: "invalid" },
        })
      )
    );
    expectValidationError(() =>
      parseAndValidateBackup(
        JSON.stringify({
          ...base,
          data: { ...base.data, categories: [null] },
        })
      )
    );

    const clone = (): BackupPayloadV1 =>
      JSON.parse(JSON.stringify(base)) as BackupPayloadV1;

    const badString = clone();
    badString.data.app_settings[0].value = 123 as unknown as string;
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badString))
    );

    const badNullable = clone();
    badNullable.data.categories[0].color = 99 as unknown as string;
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badNullable))
    );

    const badBinary = clone();
    badBinary.data.owners[0].is_self = 2;
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badBinary))
    );

    const badDueDay = clone();
    badDueDay.data.invoices[0].due_day = 32;
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badDueDay))
    );

    const badClosingDay = clone();
    badClosingDay.data.invoices[0].closing_day = 0;
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badClosingDay))
    );

    const badTxType = clone();
    badTxType.data.transactions[0].type = "TRANSFER" as "INCOME";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badTxType))
    );

    const badInstallmentStatus = clone();
    badInstallmentStatus.data.installments[0].status = "OVERDUE" as "PENDING";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badInstallmentStatus))
    );

    const badPaidAmount = clone();
    badPaidAmount.data.installments[0].paid_amount = 999999;
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badPaidAmount))
    );

    const noSelfOwner = clone();
    noSelfOwner.data.owners = noSelfOwner.data.owners.map((owner) => ({
      ...owner,
      is_self: 0,
    }));
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(noSelfOwner))
    );

    const twoSelfOwners = clone();
    twoSelfOwners.data.owners = twoSelfOwners.data.owners.map((owner) => ({
      ...owner,
      is_self: 1,
    }));
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(twoSelfOwners))
    );

    const brokenBudgetFk = clone();
    brokenBudgetFk.data.category_budgets[0].category_id = "missing-cat";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(brokenBudgetFk))
    );

    const brokenTxOwnerFk = clone();
    brokenTxOwnerFk.data.transactions[0].owner_id = "missing-owner";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(brokenTxOwnerFk))
    );

    const brokenTxCategoryFk = clone();
    brokenTxCategoryFk.data.transactions[0].category_id = "missing-cat";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(brokenTxCategoryFk))
    );

    const brokenTxInvoiceFk = clone();
    brokenTxInvoiceFk.data.transactions[0].invoice_id = "missing-inv";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(brokenTxInvoiceFk))
    );

    const brokenInstallmentFk = clone();
    brokenInstallmentFk.data.installments[0].transaction_id = "missing-tx";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(brokenInstallmentFk))
    );

    const brokenContributionFk = clone();
    brokenContributionFk.data.investment_contributions[0].investment_id =
      "missing-invest";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(brokenContributionFk))
    );

    const badGoalSince = clone();
    badGoalSince.data.goals[0].since = "2026-13";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badGoalSince))
    );

    const badBudgetMonth = clone();
    badBudgetMonth.data.category_budgets[0].month = "2026-00";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badBudgetMonth))
    );

    const badInstallmentDueDate = clone();
    badInstallmentDueDate.data.installments[0].due_date = "2026-02-30";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badInstallmentDueDate))
    );

    const oldInstallmentYear = clone();
    oldInstallmentYear.data.installments[0].due_date = "1969-12-31";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(oldInstallmentYear))
    );

    const futureInstallmentYear = clone();
    futureInstallmentYear.data.installments[0].due_date = "2101-01-01";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(futureInstallmentYear))
    );

    const badIsoTimestamp = clone();
    badIsoTimestamp.data.categories[0].created_at = "not-a-date";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badIsoTimestamp))
    );

    const badNullableIso = clone();
    badNullableIso.data.installments[0].paid_at = "2026-99-99T00:00:00.000Z";
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(badNullableIso))
    );

    const dupCategoryId = clone();
    dupCategoryId.data.categories.push({ ...dupCategoryId.data.categories[0] });
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(dupCategoryId))
    );

    const dupSettingKey = clone();
    dupSettingKey.data.app_settings.push({
      ...dupSettingKey.data.app_settings[0],
    });
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(dupSettingKey))
    );

    const dupActiveGoal = clone();
    dupActiveGoal.data.goals.push({
      ...dupActiveGoal.data.goals[0],
      id: "goal-2",
    });
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(dupActiveGoal))
    );

    const dupActiveBudget = clone();
    dupActiveBudget.data.category_budgets.push({
      ...dupActiveBudget.data.category_budgets[0],
      id: "budget-2",
    });
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(dupActiveBudget))
    );

    const dupActiveInstallment = clone();
    dupActiveInstallment.data.installments.push({
      ...dupActiveInstallment.data.installments[0],
      id: "inst-2",
    });
    expectValidationError(() =>
      parseAndValidateBackup(JSON.stringify(dupActiveInstallment))
    );
  });

  it("rolls back entire restore when recurring installment step fails inside transaction", async () => {
    await seedFullSample(db);
    const backup = await exportDatabaseBackup(db);

    await db.execAsync(`
      DELETE FROM investment_contributions;
      DELETE FROM installments;
      DELETE FROM transactions;
      DELETE FROM category_budgets;
      DELETE FROM app_settings;
      DELETE FROM investments;
      DELETE FROM goals;
      DELETE FROM invoices;
      DELETE FROM categories;
      INSERT INTO categories (id, name, color, icon, created_at, updated_at, deleted_at)
      VALUES ('keep-me', 'Preservada', NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL);
    `);

    const recurrenceSpy = jest
      .spyOn(recurrenceModule, "ensureRecurringInstallmentsInTransaction")
      .mockRejectedValueOnce(new Error("recurrence failure"));

    await expect(restoreDatabaseBackup(db, backup)).rejects.toThrow(
      "recurrence failure"
    );

    const preserved = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM categories WHERE id = 'keep-me'"
    );
    expect(preserved?.id).toBe("keep-me");
    recurrenceSpy.mockRestore();
  });

  it("restores all tables atomically, replaces previous data and runs recurring installment check", async () => {
    await seedFullSample(db);
    const backup = await exportDatabaseBackup(db);

    await db.execAsync(`
      DELETE FROM investment_contributions;
      DELETE FROM installments;
      DELETE FROM transactions;
      DELETE FROM category_budgets;
      DELETE FROM app_settings;
      DELETE FROM investments;
      DELETE FROM goals;
      DELETE FROM invoices;
      DELETE FROM categories;
      INSERT INTO categories (id, name, color, icon, created_at, updated_at, deleted_at)
      VALUES ('extra-cat', 'Temporária', NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL);
    `);

    const result = await restoreDatabaseBackup(db, backup, {
      referenceDate: new Date("2026-03-15T12:00:00.000Z"),
    });

    expect(result.schemaVersion).toBe(1);
    expect(result.restoredCounts.categories).toBe(2);
    expect(result.restoredCounts.transactions).toBe(2);
    expect(result.recurrence.createdInstallmentsCount).toBe(2);

    const extraCat = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM categories WHERE id = 'extra-cat'"
    );
    expect(extraCat).toBeNull();

    const restoredInstallments = await db.getAllAsync<{
      number: number;
      due_date: string;
    }>(
      "SELECT number, due_date FROM installments WHERE deleted_at IS NULL ORDER BY number ASC"
    );
    expect(restoredInstallments).toHaveLength(3);
    expect(restoredInstallments.map((item) => item.number)).toEqual([1, 2, 3]);
  });

  it("rejects restore when backup schemaVersion differs from database version without overwriting data", async () => {
    await seedFullSample(db);
    const backup = await exportDatabaseBackup(db);
    const mismatchedPayload: BackupPayloadV1 = {
      ...backup,
      schemaVersion: 2,
    };

    await expect(
      restoreDatabaseBackup(db, mismatchedPayload)
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    const preserved = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM categories WHERE id = 'cat-1'"
    );
    expect(preserved?.id).toBe("cat-1");
  });
});
