import { DatabaseError } from "./errors";
import { distributeCents, fromCents, toCents, toPositiveCents } from "./money";

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
      expect(() => toCents(Number.MAX_SAFE_INTEGER)).toThrow(
        "Valor monetário excede o limite seguro."
      );
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
      expect(() => toPositiveCents(Number.MAX_SAFE_INTEGER)).toThrow(
        "Valor monetário excede o limite seguro."
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

  describe("distributeCents", () => {
    it("distributes remainder on the last installments by default", () => {
      expect(distributeCents(10002, 4)).toEqual([2500, 2500, 2501, 2501]);
      expect(distributeCents(10000, 3, "last")).toEqual([3333, 3333, 3334]);
      expect(distributeCents(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
    });

    it("distributes remainder on the first installments when mode is first", () => {
      expect(distributeCents(10002, 4, "first")).toEqual([
        2501, 2501, 2500, 2500,
      ]);
      expect(distributeCents(10000, 3, "first")).toEqual([3334, 3333, 3333]);
    });

    it("throws VALIDATION_ERROR for invalid totalCents, parts, or totalCents < parts", () => {
      expect(() => distributeCents(0, 2)).toThrow(
        "Valor em centavos deve ser um inteiro positivo."
      );
      expect(() => distributeCents(10.5, 2)).toThrow(DatabaseError);
      expect(() => distributeCents(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow(
        "Valor em centavos deve ser um inteiro positivo."
      );
      expect(() => distributeCents(100, 0)).toThrow(
        "A quantidade de parcelas deve ser um inteiro positivo."
      );
      expect(() => distributeCents(100, 1.5)).toThrow(DatabaseError);
      expect(() => distributeCents(2, 3)).toThrow(
        "O valor total deve ser de pelo menos 1 centavo por parcela."
      );
    });
  });
});
