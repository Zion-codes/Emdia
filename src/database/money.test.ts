import { DatabaseError } from "./errors";
import { fromCents, toCents, toPositiveCents } from "./money";

describe("money utilities", () => {
  describe("toCents", () => {
    it("converts valid non-negative amounts to integer cents", () => {
      expect(toCents(0)).toBe(0);
      expect(toCents(10)).toBe(1000);
      expect(toCents(19.99)).toBe(1999);
      expect(toCents(1.005)).toBe(101);
    });

    it("throws VALIDATION_ERROR for non-finite or negative amounts", () => {
      expect(() => toCents(Number.NaN)).toThrow(DatabaseError);
      expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow(
        "Valor monetário inválido."
      );
      expect(() => toCents(-0.01)).toThrow("O valor não pode ser negativo.");
    });
  });

  describe("toPositiveCents", () => {
    it("converts valid positive amounts to integer cents", () => {
      expect(toPositiveCents(0.01)).toBe(1);
      expect(toPositiveCents(150.5)).toBe(15050);
    });

    it("throws VALIDATION_ERROR for non-finite, zero, negative, or sub-cent amounts", () => {
      expect(() => toPositiveCents(Number.NaN)).toThrow(
        "Valor monetário inválido."
      );
      expect(() => toPositiveCents(0)).toThrow(
        "O valor deve ser maior que zero."
      );
      expect(() => toPositiveCents(-5)).toThrow(
        "O valor deve ser maior que zero."
      );
      expect(() => toPositiveCents(0.001)).toThrow(
        "O valor deve ser maior que zero."
      );
    });
  });

  describe("fromCents", () => {
    it("converts integer cents back to decimal amounts", () => {
      expect(fromCents(0)).toBe(0);
      expect(fromCents(1999)).toBe(19.99);
      expect(fromCents(-500)).toBe(-5);
    });

    it("throws VALIDATION_ERROR for non-finite cents", () => {
      expect(() => fromCents(Number.NaN)).toThrow(
        "Valor em centavos inválido."
      );
      expect(() => fromCents(Number.NEGATIVE_INFINITY)).toThrow(DatabaseError);
    });
  });
});
