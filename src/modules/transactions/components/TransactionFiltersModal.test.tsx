import { fireEvent, render, screen } from "@testing-library/react-native";
import { type Category, type Owner } from "../../../database";
import { TransactionFiltersModal } from "./TransactionFiltersModal";

const categories: Category[] = [
  {
    id: "cat-1",
    name: "Moradia",
    icon: "home",
    color: "#3B82F6",
    budget: null,
    transactionsCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const owners: Owner[] = [
  {
    id: "owner-1",
    name: "Eu",
    isSelf: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

describe("TransactionFiltersModal", () => {
  it("edits filters and applies selection", async () => {
    const onApply = jest.fn();
    const onClear = jest.fn();
    const onClose = jest.fn();

    await render(
      <TransactionFiltersModal
        visible
        onClose={onClose}
        categories={categories}
        owners={owners}
        value={{
          includeOverdue: false,
          sortBy: "overdue_first",
        }}
        onApply={onApply}
        onClear={onClear}
      />
    );

    await fireEvent.press(screen.getByTestId("filter-sort-name"));
    await fireEvent(
      screen.getByTestId("filter-include-overdue-switch"),
      "valueChange",
      true
    );
    await fireEvent.press(screen.getByTestId("filter-category-cat-1"));
    await fireEvent.press(screen.getByTestId("filter-owner-owner-1"));
    await fireEvent.press(screen.getByTestId("filters-apply-button"));

    expect(onApply).toHaveBeenCalledWith({
      sortBy: "name",
      includeOverdue: true,
      categoryId: "cat-1",
      ownerId: "owner-1",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets category and owner to all and clears filters", async () => {
    const onApply = jest.fn();
    const onClear = jest.fn();
    const onClose = jest.fn();

    const { rerender } = await render(
      <TransactionFiltersModal
        visible={false}
        onClose={onClose}
        categories={categories}
        owners={owners}
        value={{
          categoryId: "cat-1",
          ownerId: "owner-1",
          includeOverdue: true,
          sortBy: "due_date",
        }}
        onApply={onApply}
        onClear={onClear}
      />
    );

    await rerender(
      <TransactionFiltersModal
        visible
        onClose={onClose}
        categories={categories}
        owners={owners}
        value={{
          categoryId: "cat-1",
          ownerId: "owner-1",
          includeOverdue: true,
          sortBy: "due_date",
        }}
        onApply={onApply}
        onClear={onClear}
      />
    );

    await fireEvent.press(screen.getByTestId("filter-category-all"));
    await fireEvent.press(screen.getByTestId("filter-owner-all"));
    await fireEvent.press(screen.getByTestId("filters-apply-button"));

    expect(onApply).toHaveBeenCalledWith({
      categoryId: undefined,
      ownerId: undefined,
      includeOverdue: true,
      sortBy: "due_date",
    });

    await fireEvent.press(screen.getByTestId("filters-clear-button"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
