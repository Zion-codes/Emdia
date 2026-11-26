import {
  capitalizeFirst,
  formatAmountInput,
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatFullDate,
  formatMonth,
  formatMonthYear,
  HIDDEN_MONEY,
  parseAmount,
  toMonthKey,
} from "./format";

describe("format utilities", () => {
  it("formats currency and hidden money constant", () => {
    expect(HIDDEN_MONEY).toBe("R$ ••••");
    expect(formatCurrency(1234.56)).toContain("1.234,56");
  });

  it("formats dates in pt-BR", () => {
    const date = new Date(2026, 2, 15, 12, 0, 0);
    const iso = date.toISOString();

    expect(formatDate(iso)).toMatch(/15/);
    expect(formatDayMonth(iso)).toBe("15/03");
    expect(formatFullDate(date)).toBe("15/03/2026");
    expect(formatMonth(date).toLowerCase()).toBe("março");
    expect(formatMonthYear(date).toLowerCase()).toContain("2026");
    expect(toMonthKey(date)).toBe("2026-03");
  });

  it("formats and parses amounts and text", () => {
    expect(capitalizeFirst("em dia")).toBe("Em dia");
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount(" 99,90 ")).toBe(99.9);
    expect(formatAmountInput(42.5)).toBe("42,50");
  });
});
