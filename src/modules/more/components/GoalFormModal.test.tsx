import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  type Goal,
  removeGoalFromMonth,
  setGoalForMonth,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import { GoalFormModal } from "./GoalFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    setGoalForMonth: jest.fn(),
    removeGoalFromMonth: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../../state/privacy", () => ({
  useMoney: jest.fn(),
  usePrivacy: jest.fn(),
}));

const mockSetGoalForMonth = jest.mocked(setGoalForMonth);
const mockRemoveGoalFromMonth = jest.mocked(removeGoalFromMonth);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUseMoney = jest.mocked(useMoney);
const mockUsePrivacy = jest.mocked(usePrivacy);

function createMockGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    since: "2026-11",
    amount: 1000,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

describe("GoalFormModal", () => {
  const fakeDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue(fakeDb);
    mockUseMoney.mockReturnValue(
      (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`
    );
    mockUsePrivacy.mockReturnValue({
      isHidden: false,
      toggle: jest.fn(),
    });
  });

  it("renders no content when not visible", async () => {
    await render(
      <GoalFormModal
        visible={false}
        month="2026-11"
        goal={null}
        history={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("goal-amount-input")).toBeNull();
  });

  it("validates and saves a new goal", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockSetGoalForMonth.mockResolvedValue(1500);

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={null}
        history={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.queryByTestId("goal-remove-button")).toBeNull();
    expect(screen.getByTestId("goal-history-empty")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("goal-submit-button"));
    expect(screen.getByTestId("goal-form-error").props.children).toBe(
      "Informe um valor válido maior que zero."
    );

    await fireEvent.changeText(
      screen.getByTestId("goal-amount-input"),
      "1500,00"
    );
    await fireEvent.press(screen.getByTestId("goal-submit-button"));

    await waitFor(() => {
      expect(mockSetGoalForMonth).toHaveBeenCalledWith(fakeDb, "2026-11", 1500);
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles save error", async () => {
    mockSetGoalForMonth.mockRejectedValue(new Error("db error"));

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={null}
        history={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(screen.getByTestId("goal-amount-input"), "1500");
    await fireEvent.press(screen.getByTestId("goal-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("goal-form-error").props.children).toBe(
        "Não foi possível salvar a meta."
      );
    });
  });

  it("shows history and removes the current goal", async () => {
    const history = [
      createMockGoal({ id: "goal-2", since: "2026-10", amount: 900 }),
    ];
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockRemoveGoalFromMonth.mockResolvedValue(undefined);

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={1000}
        history={history}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("goal-amount-input").props.value).toBe("1000,00");
    expect(screen.getByTestId("goal-history-goal-2")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("goal-remove-button"));
    expect(screen.getByTestId("goal-remove-confirm-box")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("goal-cancel-remove-button"));
    expect(screen.queryByTestId("goal-remove-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("goal-remove-button"));
    await fireEvent.press(screen.getByTestId("goal-confirm-remove-button"));

    await waitFor(() => {
      expect(mockRemoveGoalFromMonth).toHaveBeenCalledWith(fakeDb, "2026-11");
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("hides and preserves the current goal in privacy mode when left empty", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={1000}
        history={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("goal-amount-input").props.value).toBe("");
    await fireEvent.press(screen.getByTestId("goal-submit-button"));

    await waitFor(() => {
      expect(mockSetGoalForMonth).not.toHaveBeenCalled();
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("still validates the amount in privacy mode when there is no current goal", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={null}
        history={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("goal-submit-button"));
    expect(screen.getByTestId("goal-form-error").props.children).toBe(
      "Informe um valor válido maior que zero."
    );
  });

  it("updates the goal in privacy mode when a new value is provided", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    mockSetGoalForMonth.mockResolvedValue(1200);
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={1000}
        history={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.changeText(screen.getByTestId("goal-amount-input"), "1200");
    await fireEvent.press(screen.getByTestId("goal-submit-button"));

    await waitFor(() => {
      expect(mockSetGoalForMonth).toHaveBeenCalledWith(fakeDb, "2026-11", 1200);
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("handles remove error", async () => {
    mockRemoveGoalFromMonth.mockRejectedValue(new Error("db error"));

    await render(
      <GoalFormModal
        visible
        month="2026-11"
        goal={1000}
        history={[]}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("goal-remove-button"));
    await fireEvent.press(screen.getByTestId("goal-confirm-remove-button"));

    await waitFor(() => {
      expect(screen.getByTestId("goal-form-error").props.children).toBe(
        "Não foi possível remover a meta."
      );
    });
  });
});
