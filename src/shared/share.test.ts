import { Share } from "react-native";
import { type OwnerStatement } from "../database/repositories/owners";
import { shareOwnerStatementSummary } from "./share";

const sampleStatement: OwnerStatement = {
  owner: {
    id: "owner-1",
    name: "Carlos",
    isSelf: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  period: "current_month",
  page: 1,
  pageSize: 20,
  totalPages: 1,
  items: [],
  totals: {
    incomeTotal: 0,
    expenseTotal: 150,
    netTotal: -150,
    pendingTotal: 150,
    paidTotal: 0,
    overdueTotal: 0,
    totalCount: 1,
  },
};

describe("shareOwnerStatementSummary", () => {
  it("returns shared when Share.share resolves with sharedAction", async () => {
    const spy = jest.spyOn(Share, "share").mockResolvedValueOnce({
      action: Share.sharedAction,
      activityType: null,
    });

    const result = await shareOwnerStatementSummary(sampleStatement, {
      mode: "total",
      periodLabel: "Maio/2026",
    });

    expect(result).toBe("shared");
    expect(spy).toHaveBeenCalledWith({
      title: "Resumo de Carlos",
      message: expect.stringContaining("Resumo de Carlos (Maio/2026)"),
    });

    spy.mockRestore();
  });

  it("returns dismissed when Share.share resolves with dismissedAction", async () => {
    const spy = jest
      .spyOn(Share, "share")
      .mockResolvedValueOnce({ action: Share.dismissedAction });

    const result = await shareOwnerStatementSummary(sampleStatement, {
      mode: "detailed",
      periodLabel: "Maio/2026",
    });

    expect(result).toBe("dismissed");

    spy.mockRestore();
  });

  it("returns error when Share.share throws", async () => {
    const spy = jest
      .spyOn(Share, "share")
      .mockRejectedValueOnce(new Error("share failed"));

    const result = await shareOwnerStatementSummary(sampleStatement, {
      mode: "total",
      periodLabel: "Maio/2026",
    });

    expect(result).toBe("error");

    spy.mockRestore();
  });
});
