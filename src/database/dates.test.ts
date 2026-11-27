import {
  addMonthsToDateKey,
  addMonthsToMonthKey,
  assertMonthKey,
  getMonthDateRange,
  isValidDateKey,
  isValidMonthKey,
  normalizeDateKey,
  toLocalDateKey,
} from "./dates";
import { DatabaseError } from "./errors";

describe("dates utilities", () => {
  describe("isValidMonthKey & assertMonthKey", () => {
    it("validates YYYY-MM month keys", () => {
      expect(isValidMonthKey("2026-01")).toBe(true);
      expect(isValidMonthKey("2026-12")).toBe(true);
      expect(isValidMonthKey("2026-00")).toBe(false);
      expect(isValidMonthKey("2026-13")).toBe(false);
      expect(isValidMonthKey("2026-1")).toBe(false);
      expect(isValidMonthKey("2026-01-01")).toBe(false);
    });

    it("trims and returns valid monthKey or throws VALIDATION_ERROR", () => {
      expect(assertMonthKey(" 2026-05 ")).toBe("2026-05");
      expect(() => assertMonthKey("2026-99")).toThrow(DatabaseError);
      expect(() => assertMonthKey("invalid")).toThrow(
        "Mês inválido. Use o formato AAAA-MM."
      );
    });
  });

  describe("isValidDateKey & normalizeDateKey", () => {
    it("validates calendar dates in YYYY-MM-DD format", () => {
      expect(isValidDateKey("2026-02-28")).toBe(true);
      expect(isValidDateKey("2024-02-29")).toBe(true);
      expect(isValidDateKey("2026-02-29")).toBe(false);
      expect(isValidDateKey("2026-04-31")).toBe(false);
      expect(isValidDateKey("2026-13-01")).toBe(false);
      expect(isValidDateKey("not-a-date")).toBe(false);
    });

    it("normalizes YYYY-MM-DD and ISO datetime strings", () => {
      expect(normalizeDateKey(" 2026-03-15 ")).toBe("2026-03-15");
      expect(normalizeDateKey("2026-03-15T14:30:00.000Z")).toBe("2026-03-15");
      expect(normalizeDateKey("2026-03-15T14:30:00-03:00")).toBe("2026-03-15");
      expect(() => normalizeDateKey("2026/03/15")).toThrow(
        "Data inválida. Use o formato AAAA-MM-DD."
      );
      expect(() => normalizeDateKey("2026-02-30T10:00:00Z")).toThrow(
        DatabaseError
      );
      expect(() => normalizeDateKey("2026-05-10Tqualquer-coisa")).toThrow(
        "Data inválida. Use o formato AAAA-MM-DD."
      );
      expect(() => normalizeDateKey("2026-05-10T25:00:00Z")).toThrow(
        "Data inválida. Use o formato AAAA-MM-DD."
      );
    });
  });

  describe("getMonthDateRange", () => {
    it("returns start and end dates including leap years", () => {
      expect(getMonthDateRange("2026-01")).toEqual({
        start: "2026-01-01",
        end: "2026-01-31",
      });
      expect(getMonthDateRange("2024-02")).toEqual({
        start: "2024-02-01",
        end: "2024-02-29",
      });
      expect(getMonthDateRange("2026-02")).toEqual({
        start: "2026-02-01",
        end: "2026-02-28",
      });
    });
  });

  describe("addMonthsToMonthKey", () => {
    it("adds positive and negative month deltas across year boundaries", () => {
      expect(addMonthsToMonthKey("2026-11", 2)).toBe("2027-01");
      expect(addMonthsToMonthKey("2026-01", -1)).toBe("2025-12");
      expect(addMonthsToMonthKey("2026-06", 0)).toBe("2026-06");
    });

    it("throws VALIDATION_ERROR for non-integer delta or out-of-range year", () => {
      expect(() => addMonthsToMonthKey("2026-06", 1.5)).toThrow(
        "Deslocamento de meses deve ser um número inteiro."
      );
      expect(() => addMonthsToMonthKey("0001-01", -1)).toThrow(
        "O ano resultante deve estar entre 0001 e 9999."
      );
      expect(() => addMonthsToMonthKey("9999-12", 1)).toThrow(
        "O ano resultante deve estar entre 0001 e 9999."
      );
    });
  });

  describe("addMonthsToDateKey", () => {
    it("adds months and clamps end-of-month dates including leap years", () => {
      expect(addMonthsToDateKey("2026-01-31", 1)).toBe("2026-02-28");
      expect(addMonthsToDateKey("2026-01-31", 2)).toBe("2026-03-31");
      expect(addMonthsToDateKey("2024-01-31", 1)).toBe("2024-02-29");
      expect(addMonthsToDateKey("2026-03-31", -1)).toBe("2026-02-28");
      expect(addMonthsToDateKey("2026-05-15", 0)).toBe("2026-05-15");
    });

    it("throws VALIDATION_ERROR for invalid dateKey or non-integer delta", () => {
      expect(() => addMonthsToDateKey("2026-02-29", 1)).toThrow(DatabaseError);
      expect(() => addMonthsToDateKey("invalid", 1)).toThrow(
        "Data inválida. Use o formato AAAA-MM-DD."
      );
      expect(() => addMonthsToDateKey("2026-01-15", 0.5)).toThrow(
        "Deslocamento de meses deve ser um número inteiro."
      );
    });
  });

  describe("toLocalDateKey", () => {
    it("formats a local Date as YYYY-MM-DD", () => {
      const date = new Date(2026, 2, 5, 23, 59, 59);
      expect(toLocalDateKey(date)).toBe("2026-03-05");
    });

    it("uses current date when omitted", () => {
      jest.setSystemTime(new Date(2026, 10, 26, 10, 0, 0));
      expect(toLocalDateKey()).toBe("2026-11-26");
    });
  });
});
