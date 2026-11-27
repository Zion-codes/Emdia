import { parseMoneyInput, requireText } from "./moreHelpers";

describe("moreHelpers", () => {
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
});
