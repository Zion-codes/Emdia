import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import {
  createCategory,
  deleteCategory,
  removeCategoryBudget,
  setCategoryBudget,
  updateCategory,
} from "../../../database";
import { useDatabase } from "../../../state/database";
import { usePrivacy } from "../../../state/privacy";
import { avatarPalette } from "../../../theme/colors";
import { CategoryFormModal } from "./CategoryFormModal";

jest.mock("../../../database", () => {
  const actual =
    jest.requireActual<typeof import("../../../database")>("../../../database");
  return {
    ...actual,
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    deleteCategory: jest.fn(),
    setCategoryBudget: jest.fn(),
    removeCategoryBudget: jest.fn(),
  };
});

jest.mock("../../../state/database", () => ({
  useDatabase: jest.fn(),
}));

jest.mock("../../../state/privacy", () => ({
  usePrivacy: jest.fn(),
}));

const mockCreateCategory = jest.mocked(createCategory);
const mockUpdateCategory = jest.mocked(updateCategory);
const mockDeleteCategory = jest.mocked(deleteCategory);
const mockSetCategoryBudget = jest.mocked(setCategoryBudget);
const mockRemoveCategoryBudget = jest.mocked(removeCategoryBudget);
const mockUseDatabase = jest.mocked(useDatabase);
const mockUsePrivacy = jest.mocked(usePrivacy);

describe("CategoryFormModal", () => {
  const fakeDb = {} as SQLite.SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDatabase.mockReturnValue(fakeDb);
    mockUsePrivacy.mockReturnValue({
      isHidden: false,
      toggle: jest.fn(),
    });
  });

  it("renders no content when not visible", async () => {
    await render(
      <CategoryFormModal
        visible={false}
        category={null}
        month="2026-11"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.queryByTestId("category-name-input")).toBeNull();
  });

  it("validates fields and creates a category without budget", async () => {
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockCreateCategory.mockResolvedValue({
      id: "cat-new",
      name: "Mercado",
      color: avatarPalette[1],
      icon: "home-outline",
      budget: null,
      transactionsCount: 0,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    });

    await render(
      <CategoryFormModal
        visible
        category={null}
        month="2026-11"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("category-submit-button"));
    expect(screen.getByTestId("category-form-error").props.children).toBe(
      "Informe o nome da categoria."
    );

    await fireEvent.changeText(
      screen.getByTestId("category-name-input"),
      "Mercado"
    );
    await fireEvent.changeText(
      screen.getByTestId("category-budget-input"),
      "abc"
    );
    await fireEvent.press(screen.getByTestId("category-submit-button"));
    expect(screen.getByTestId("category-form-error").props.children).toBe(
      "Informe um valor de orçamento válido maior que zero."
    );

    await fireEvent.changeText(screen.getByTestId("category-budget-input"), "");
    await fireEvent.press(screen.getByTestId("category-color-1"));
    await fireEvent.press(screen.getByTestId("category-icon-0"));
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(fakeDb, {
        name: "Mercado",
        color: avatarPalette[1],
        icon: "home-outline",
        budget: undefined,
        month: "2026-11",
      });
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a category with a budget and clears color/icon", async () => {
    mockCreateCategory.mockResolvedValue({
      id: "cat-new",
      name: "Lazer",
      color: null,
      icon: null,
      budget: 300,
      transactionsCount: 0,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    });

    await render(
      <CategoryFormModal
        visible
        category={null}
        month="2026-11"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("category-name-input"),
      "Lazer"
    );
    await fireEvent.changeText(
      screen.getByTestId("category-budget-input"),
      "300,00"
    );
    await fireEvent.press(screen.getByTestId("category-color-0"));
    await fireEvent.press(screen.getByTestId("category-color-none"));
    await fireEvent.press(screen.getByTestId("category-icon-1"));
    await fireEvent.press(screen.getByTestId("category-icon-none"));
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith(fakeDb, {
        name: "Lazer",
        color: null,
        icon: null,
        budget: 300,
        month: "2026-11",
      });
    });
  });

  it("handles create error", async () => {
    mockCreateCategory.mockRejectedValue(new Error("db error"));

    await render(
      <CategoryFormModal
        visible
        category={null}
        month="2026-11"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.changeText(
      screen.getByTestId("category-name-input"),
      "Mercado"
    );
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("category-form-error").props.children).toBe(
        "Não foi possível salvar a categoria."
      );
    });
  });

  it("updates an existing category and removes its budget", async () => {
    const category = {
      id: "cat-1",
      name: "Mercado",
      color: null,
      icon: null,
      budget: 200,
      transactionsCount: 3,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockUpdateCategory.mockResolvedValue(category);
    mockRemoveCategoryBudget.mockResolvedValue(undefined);

    await render(
      <CategoryFormModal
        visible
        category={category}
        month="2026-11"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("category-name-input").props.value).toBe(
      "Mercado"
    );
    expect(screen.getByTestId("category-budget-input").props.value).toBe(
      "200,00"
    );

    await fireEvent.changeText(
      screen.getByTestId("category-name-input"),
      "Mercado Atualizado"
    );
    await fireEvent.changeText(screen.getByTestId("category-budget-input"), "");
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(mockUpdateCategory).toHaveBeenCalledWith(fakeDb, "cat-1", {
        name: "Mercado Atualizado",
        color: null,
        icon: null,
      });
      expect(mockRemoveCategoryBudget).toHaveBeenCalledWith(
        fakeDb,
        "cat-1",
        "2026-11"
      );
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("updates an existing category and sets a new budget", async () => {
    const category = {
      id: "cat-2",
      name: "Lazer",
      color: avatarPalette[2],
      icon: "star-outline",
      budget: null,
      transactionsCount: 0,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    mockUpdateCategory.mockResolvedValue(category);
    mockSetCategoryBudget.mockResolvedValue(500);

    await render(
      <CategoryFormModal
        visible
        category={category}
        month="2026-11"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByTestId("category-budget-input").props.value).toBe("");

    await fireEvent.changeText(
      screen.getByTestId("category-budget-input"),
      "500"
    );
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(mockSetCategoryBudget).toHaveBeenCalledWith(
        fakeDb,
        "cat-2",
        "2026-11",
        500
      );
    });
  });

  it("hides and preserves the budget in privacy mode when left empty", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const category = {
      id: "cat-5",
      name: "Mercado",
      color: null,
      icon: null,
      budget: 200,
      transactionsCount: 3,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockUpdateCategory.mockResolvedValue(category);

    await render(
      <CategoryFormModal
        visible
        category={category}
        month="2026-11"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByTestId("category-budget-input").props.value).toBe("");

    await fireEvent.changeText(
      screen.getByTestId("category-name-input"),
      "Mercado Atualizado"
    );
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(mockUpdateCategory).toHaveBeenCalledWith(fakeDb, "cat-5", {
        name: "Mercado Atualizado",
        color: null,
        icon: null,
      });
      expect(mockRemoveCategoryBudget).not.toHaveBeenCalled();
      expect(mockSetCategoryBudget).not.toHaveBeenCalled();
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("updates the budget in privacy mode when a new value is provided", async () => {
    mockUsePrivacy.mockReturnValue({
      isHidden: true,
      toggle: jest.fn(),
    });
    const category = {
      id: "cat-6",
      name: "Lazer",
      color: avatarPalette[0],
      icon: "star-outline",
      budget: 200,
      transactionsCount: 0,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    mockUpdateCategory.mockResolvedValue(category);
    mockSetCategoryBudget.mockResolvedValue(750);

    await render(
      <CategoryFormModal
        visible
        category={category}
        month="2026-11"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    expect(screen.getByTestId("category-budget-input").props.value).toBe("");

    await fireEvent.changeText(
      screen.getByTestId("category-budget-input"),
      "750"
    );
    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(mockSetCategoryBudget).toHaveBeenCalledWith(
        fakeDb,
        "cat-6",
        "2026-11",
        750
      );
    });
  });

  it("handles update error", async () => {
    const category = {
      id: "cat-3",
      name: "Lazer",
      color: null,
      icon: null,
      budget: null,
      transactionsCount: 0,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    mockUpdateCategory.mockRejectedValue(new Error("db error"));

    await render(
      <CategoryFormModal
        visible
        category={category}
        month="2026-11"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await fireEvent.press(screen.getByTestId("category-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("category-form-error").props.children).toBe(
        "Não foi possível salvar a categoria."
      );
    });
  });

  it("confirms and executes deletion and handles delete error", async () => {
    const category = {
      id: "cat-4",
      name: "Lazer",
      color: null,
      icon: null,
      budget: null,
      transactionsCount: 0,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    mockDeleteCategory
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined);

    await render(
      <CategoryFormModal
        visible
        category={category}
        month="2026-11"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    await fireEvent.press(screen.getByTestId("category-delete-button"));
    expect(screen.getByTestId("category-delete-confirm-box")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("category-cancel-delete-button"));
    expect(screen.queryByTestId("category-delete-confirm-box")).toBeNull();

    await fireEvent.press(screen.getByTestId("category-delete-button"));
    await fireEvent.press(screen.getByTestId("category-confirm-delete-button"));

    await waitFor(() => {
      expect(screen.getByTestId("category-form-error").props.children).toBe(
        "Não foi possível excluir a categoria."
      );
    });

    await fireEvent.press(screen.getByTestId("category-confirm-delete-button"));

    await waitFor(() => {
      expect(mockDeleteCategory).toHaveBeenCalledWith(fakeDb, "cat-4");
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
