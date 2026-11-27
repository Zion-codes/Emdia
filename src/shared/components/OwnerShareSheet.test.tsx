import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { type OwnerStatement } from "../../database/repositories/owners";
import { shareOwnerStatementSummary } from "../share";
import { OwnerShareSheet } from "./OwnerShareSheet";

jest.mock("../share", () => ({
  shareOwnerStatementSummary: jest.fn(),
}));

const mockShareOwnerStatementSummary = jest.mocked(shareOwnerStatementSummary);

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
  items: [
    {
      installmentId: "inst-1",
      transactionId: "tx-1",
      transactionName: "Mercado",
      type: "EXPENSE",
      number: 1,
      installmentsCount: 1,
      amount: 120,
      paidAmount: 0,
      dueDate: "2026-05-10",
      paidAt: null,
      status: "PENDING",
      isOverdue: false,
      categoryName: "Alimentação",
      invoiceName: null,
    },
  ],
  totals: {
    incomeTotal: 0,
    expenseTotal: 120,
    netTotal: -120,
    pendingTotal: 120,
    paidTotal: 0,
    overdueTotal: 0,
    totalCount: 1,
  },
};

describe("OwnerShareSheet", () => {
  it("switches between total and detailed modes and shares summary", async () => {
    const onClose = jest.fn();
    mockShareOwnerStatementSummary.mockResolvedValueOnce("shared");

    await render(
      <OwnerShareSheet
        visible
        onClose={onClose}
        statement={sampleStatement}
        periodLabel="Maio/2026"
      />
    );

    expect(screen.getByText("Compartilhar resumo (Carlos)")).toBeTruthy();
    expect(
      screen.getByTestId("share-preview-text").props.children
    ).not.toContain("Lançamentos:");

    await fireEvent.press(screen.getByTestId("share-mode-detailed"));
    expect(screen.getByTestId("share-preview-text").props.children).toContain(
      "Lançamentos:"
    );

    await fireEvent.press(screen.getByTestId("share-submit-button"));

    await waitFor(() => {
      expect(mockShareOwnerStatementSummary).toHaveBeenCalledWith(
        sampleStatement,
        { mode: "detailed", periodLabel: "Maio/2026" }
      );
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("shows error message on share error and keeps sheet open on dismissed", async () => {
    const onClose = jest.fn();
    mockShareOwnerStatementSummary.mockResolvedValueOnce("error");

    await render(
      <OwnerShareSheet
        visible
        onClose={onClose}
        statement={sampleStatement}
        periodLabel="Maio/2026"
      />
    );

    await fireEvent.press(screen.getByTestId("share-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("share-error-text")).toBeTruthy();
    });
    expect(onClose).not.toHaveBeenCalled();

    mockShareOwnerStatementSummary.mockResolvedValueOnce("dismissed");
    await fireEvent.press(screen.getByTestId("share-submit-button"));

    await waitFor(() => {
      expect(mockShareOwnerStatementSummary).toHaveBeenCalledTimes(2);
    });
    expect(onClose).not.toHaveBeenCalled();

    let resolveShare!: (value: "shared") => void;
    mockShareOwnerStatementSummary.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveShare = resolve;
      })
    );
    await fireEvent.press(screen.getByTestId("share-submit-button"));
    expect(screen.getByText("Compartilhando...")).toBeTruthy();

    resolveShare("shared");
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
