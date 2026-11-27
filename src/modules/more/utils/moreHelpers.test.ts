import { DatabaseError } from "../../../database";
import {
  extractErrorMessage,
  formatMonthLabel,
  parseDateKeyToLocalDate,
  parseMoneyInput,
  requireText,
} from "./moreHelpers";

describe("moreHelpers", () => {
  it("formats a month key as a capitalized month/year label", () => {
    expect(formatMonthLabel("2026-11")).toMatch(/2026/);
    expect(formatMonthLabel("2026-01")).toMatch(/2026/);
  });

  it("extracts a database error message or returns the fallback", () => {
    expect(
      extractErrorMessage(
        new DatabaseError("VALIDATION_ERROR", "Valor inválido"),
        "Fallback"
      )
    ).toBe("Valor inválido");

    expect(
      extractErrorMessage(
        new DatabaseError("VALIDATION_ERROR", "   "),
        "Fallback"
      )
    ).toBe("Fallback");

    expect(extractErrorMessage(new Error("boom"), "Fallback")).toBe("Fallback");
  });

  it("requires non-empty text", () => {
    expect(requireText("  ")).toBeNull();
    expect(requireText("")).toBeNull();
    expect(requireText("  Nome  ")).toBe("Nome");
  });

  it("parses money input covering empty, invalid and valid values", () => {
    expect(parseMoneyInput("")).toEqual({ status: "empty", amount: null });
    expect(parseMoneyInput("   ")).toEqual({ status: "empty", amount: null });

    expect(parseMoneyInput("abc").status).toBe("invalid");
    expect(parseMoneyInput("-10").status).toBe("invalid");
    expect(parseMoneyInput("0").status).toBe("invalid");
    expect(parseMoneyInput("0", { allowZero: true })).toEqual({
      status: "valid",
      amount: 0,
    });
    expect(parseMoneyInput("2500,50")).toEqual({
      status: "valid",
      amount: 2500.5,
    });
  });

  it("parses a date key into a local date", () => {
    const result = parseDateKeyToLocalDate("2026-11-10");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(10);
    expect(result.getDate()).toBe(10);
  });
});
