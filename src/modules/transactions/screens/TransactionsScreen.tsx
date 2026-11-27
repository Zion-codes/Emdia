import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { FlatList, TextInput, TouchableOpacity, View } from "react-native";
import {
  addMonthsToMonthKey,
  type Category,
  type InstallmentStatus,
  type Invoice,
  listCategories,
  listInvoices,
  listOwners,
  listTransactions,
  type Owner,
  type TransactionListItem,
  type TransactionType,
} from "../../../database";
import { Icon } from "../../../shared/components/Icon";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import { toMonthKey } from "../../../shared/utils/format";
import { useDatabase } from "../../../state/database";
import { useMoney } from "../../../state/privacy";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import {
  PaymentModal,
  type PaymentModalMode,
} from "../components/PaymentModal";
import { TransactionActionsModal } from "../components/TransactionActionsModal";
import {
  TransactionFiltersModal,
  type TransactionFiltersValue,
} from "../components/TransactionFiltersModal";
import { TransactionFormModal } from "../components/TransactionFormModal";
import {
  formatDueDateLabel,
  formatMonthLabel,
  getActiveFiltersCount,
  getTransactionStatusBadge,
  type TransactionBadgeTone,
} from "../utils/transactionHelpers";

const DEFAULT_FILTERS: TransactionFiltersValue = {
  includeOverdue: false,
  sortBy: "overdue_first",
};

export function TransactionsScreen(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState<string>(() => toMonthKey(new Date()));
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | undefined>(
    undefined
  );
  const [statusFilter, setStatusFilter] = useState<
    InstallmentStatus | undefined
  >(undefined);
  const [filters, setFilters] =
    useState<TransactionFiltersValue>(DEFAULT_FILTERS);

  const [filtersModalVisible, setFiltersModalVisible] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<TransactionListItem | null>(
    null
  );
  const [actionsItem, setActionsItem] = useState<TransactionListItem | null>(
    null
  );
  const [paymentItem, setPaymentItem] = useState<TransactionListItem | null>(
    null
  );
  const [paymentMode, setPaymentMode] = useState<PaymentModalMode>("pay");

  const trimmedSearch = search.trim();

  const transactionsQuery = useQuery<TransactionListItem[]>({
    queryKey: [
      "transactions",
      month,
      trimmedSearch,
      typeFilter,
      statusFilter,
      filters.categoryId,
      filters.ownerId,
      filters.includeOverdue,
      filters.sortBy,
    ],
    queryFn: () =>
      listTransactions(db, {
        month,
        search: trimmedSearch || undefined,
        type: typeFilter,
        status: statusFilter,
        categoryId: filters.categoryId,
        ownerId: filters.ownerId,
        includeOverdue: filters.includeOverdue,
        sortBy: filters.sortBy,
      }),
  });

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => listCategories(db),
  });

  const ownersQuery = useQuery<Owner[]>({
    queryKey: ["owners"],
    queryFn: () => listOwners(db),
  });

  const invoicesQuery = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: () => listInvoices(db),
  });

  const invalidateAll = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  const activeFiltersCount = getActiveFiltersCount(filters);
  const hasActiveCriteria =
    Boolean(trimmedSearch) ||
    Boolean(typeFilter) ||
    Boolean(statusFilter) ||
    activeFiltersCount > 0;

  const handleClearAllCriteria = (): void => {
    setSearch("");
    setTypeFilter(undefined);
    setStatusFilter(undefined);
    setFilters(DEFAULT_FILTERS);
  };

  const handleOpenCreate = (): void => {
    setEditingItem(null);
    setFormModalVisible(true);
  };

  const handleOpenEdit = (item: TransactionListItem): void => {
    setActionsItem(null);
    setEditingItem(item);
    setFormModalVisible(true);
  };

  const handleOpenPay = (item: TransactionListItem): void => {
    setActionsItem(null);
    setPaymentMode("pay");
    setPaymentItem(item);
  };

  const handleOpenRevert = (item: TransactionListItem): void => {
    setActionsItem(null);
    setPaymentMode("revert");
    setPaymentItem(item);
  };

  const getBadgeColors = (
    tone: TransactionBadgeTone
  ): { backgroundColor: string; textColor: string } => {
    switch (tone) {
      case "success":
        return {
          backgroundColor: colors.successMuted,
          textColor: colors.success,
        };
      case "danger":
        return {
          backgroundColor: colors.dangerMuted,
          textColor: colors.danger,
        };
      case "warning":
        return {
          backgroundColor: colors.warningMuted,
          textColor: colors.warning,
        };
      case "accent":
        return {
          backgroundColor: colors.accentMuted,
          textColor: colors.accent,
        };
      case "muted":
        return {
          backgroundColor: colors.background,
          textColor: colors.textMuted,
        };
    }
  };

  const renderTransactionItem = ({
    item,
  }: {
    item: TransactionListItem;
  }): JSX.Element => {
    const badge = getTransactionStatusBadge(item);
    const badgeColors = getBadgeColors(badge.tone);

    return (
      <TouchableOpacity
        onPress={() => setActionsItem(item)}
        activeOpacity={opacity.pressed}
        accessibilityRole="button"
        testID={`transaction-item-${item.installmentId}`}
        style={styles.card}
      >
        <View style={styles.cardTopRow}>
          <View style={styles.cardTitleGroup}>
            <Text style={styles.itemName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: badgeColors.backgroundColor },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: badgeColors.textColor },
                  ]}
                >
                  {badge.label}
                </Text>
              </View>

              {item.installmentsCount > 1 ? (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>
                    {item.number}/{item.installmentsCount}
                  </Text>
                </View>
              ) : null}

              {item.recurrence ? (
                <View style={styles.metaBadge}>
                  <Icon name="repeat" size={12} color={colors.accent} />
                  <Text style={styles.metaBadgeText}>Recorrente</Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text
            style={[
              styles.amountText,
              item.type === "INCOME" ? styles.incomeText : styles.expenseText,
            ]}
            testID={`transaction-amount-${item.installmentId}`}
          >
            {formatMoney(item.amount)}
          </Text>
        </View>

        <View style={styles.metaListRow}>
          <Text style={styles.metaText}>
            Venc. {formatDueDateLabel(item.dueDate)}
          </Text>
          <Text style={styles.metaText}>• {item.ownerName}</Text>
          {item.categoryName ? (
            <Text style={styles.metaText}>• {item.categoryName}</Text>
          ) : null}
          {item.invoiceName ? (
            <Text style={styles.metaText}>• {item.invoiceName}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const items = transactionsQuery.data ?? [];

  return (
    <ScreenContainer testID="transactions-screen">
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Transações</Text>
          <TouchableOpacity
            onPress={handleOpenCreate}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            testID="add-transaction-button"
            style={styles.addButton}
          >
            <Icon name="add" size={18} color={colors.textOnPrimary} />
            <Text style={styles.addButtonText}>Novo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() =>
              setMonth((current) => addMonthsToMonthKey(current, -1))
            }
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            testID="prev-month-button"
            style={styles.monthButton}
          >
            <Icon name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.monthLabel} testID="current-month-label">
            {formatMonthLabel(month)}
          </Text>

          <TouchableOpacity
            onPress={() =>
              setMonth((current) => addMonthsToMonthKey(current, 1))
            }
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            testID="next-month-button"
            style={styles.monthButton}
          >
            <Icon name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar por nome..."
              placeholderTextColor={colors.placeholder}
              maxLength={120}
              testID="transactions-search-input"
              style={styles.searchInput}
            />
            {search.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearch("")}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                accessibilityLabel="Limpar busca"
                testID="transactions-search-clear"
              >
                <Icon name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={() => setFiltersModalVisible(true)}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Filtros"
            testID="transactions-filters-button"
            style={[
              styles.filtersButton,
              activeFiltersCount > 0 ? styles.filtersButtonActive : null,
            ]}
          >
            <Icon
              name="options-outline"
              size={20}
              color={activeFiltersCount > 0 ? colors.accent : colors.text}
            />
            {activeFiltersCount > 0 ? (
              <View style={styles.filterCountBadge}>
                <Text style={styles.filterCountText}>{activeFiltersCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        <View style={styles.chipsGroup}>
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() => setTypeFilter(undefined)}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="type-chip-all"
              style={[
                styles.chip,
                typeFilter === undefined ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  typeFilter === undefined ? styles.chipTextSelected : null,
                ]}
              >
                Todos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTypeFilter("INCOME")}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="type-chip-income"
              style={[
                styles.chip,
                typeFilter === "INCOME" ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  typeFilter === "INCOME" ? styles.chipTextSelected : null,
                ]}
              >
                Receitas
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTypeFilter("EXPENSE")}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="type-chip-expense"
              style={[
                styles.chip,
                typeFilter === "EXPENSE" ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  typeFilter === "EXPENSE" ? styles.chipTextSelected : null,
                ]}
              >
                Despesas
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() => setStatusFilter(undefined)}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="status-chip-all"
              style={[
                styles.chip,
                statusFilter === undefined ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  statusFilter === undefined ? styles.chipTextSelected : null,
                ]}
              >
                Todos
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStatusFilter("PENDING")}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="status-chip-pending"
              style={[
                styles.chip,
                statusFilter === "PENDING" ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  statusFilter === "PENDING" ? styles.chipTextSelected : null,
                ]}
              >
                Pendentes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStatusFilter("PAID")}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="status-chip-paid"
              style={[
                styles.chip,
                statusFilter === "PAID" ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  statusFilter === "PAID" ? styles.chipTextSelected : null,
                ]}
              >
                Pagas
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {transactionsQuery.isLoading ? (
          <View style={styles.stateCard} testID="transactions-loading">
            <Text style={styles.helperText}>Carregando transações...</Text>
          </View>
        ) : transactionsQuery.isError ? (
          <View style={styles.stateCard} testID="transactions-error">
            <Text style={styles.errorText}>
              Não foi possível carregar as transações.
            </Text>
            <TouchableOpacity
              onPress={() => {
                void transactionsQuery.refetch();
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="transactions-retry-button"
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard} testID="transactions-empty">
            <Text style={styles.helperText}>
              {hasActiveCriteria
                ? "Nenhuma transação encontrada para os filtros aplicados."
                : "Nenhuma transação neste mês."}
            </Text>
            {hasActiveCriteria ? (
              <TouchableOpacity
                onPress={handleClearAllCriteria}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="transactions-empty-clear-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Limpar filtros</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleOpenCreate}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="transactions-empty-add-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Novo lançamento</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.installmentId}
            renderItem={renderTransactionItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            testID="transactions-list"
          />
        )}
      </View>

      <TransactionFiltersModal
        visible={filtersModalVisible}
        onClose={() => setFiltersModalVisible(false)}
        categories={categoriesQuery.data ?? []}
        owners={ownersQuery.data ?? []}
        value={filters}
        onApply={setFilters}
        onClear={() => setFilters(DEFAULT_FILTERS)}
      />

      <TransactionFormModal
        visible={formModalVisible}
        onClose={() => setFormModalVisible(false)}
        onSuccess={invalidateAll}
        editingItem={editingItem}
        categories={categoriesQuery.data ?? []}
        owners={ownersQuery.data ?? []}
        invoices={invoicesQuery.data ?? []}
      />

      <TransactionActionsModal
        visible={actionsItem !== null}
        item={actionsItem}
        onClose={() => setActionsItem(null)}
        onPay={handleOpenPay}
        onRevert={handleOpenRevert}
        onEdit={handleOpenEdit}
        onMutated={invalidateAll}
      />

      <PaymentModal
        visible={paymentItem !== null}
        item={paymentItem}
        mode={paymentMode}
        onClose={() => setPaymentItem(null)}
        onSuccess={invalidateAll}
      />
    </ScreenContainer>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    flex: 1,
    gap: spacing.s12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  headerTitle: {
    ...typography.headline,
    color: colors.text,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s4,
    paddingHorizontal: spacing.s12,
    minHeight: controlHeight.target,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  addButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.s10,
    minHeight: controlHeight.target,
  },
  monthButton: {
    width: controlHeight.target,
    height: controlHeight.target,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    ...typography.label,
    color: colors.text,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.s10,
    alignItems: "center",
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s6,
    minHeight: controlHeight.input,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    ...typography.body,
  },
  filtersButton: {
    width: controlHeight.input,
    height: controlHeight.input,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  filterCountBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
  chipsGroup: {
    gap: spacing.s6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s6,
  },
  chip: {
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  chipText: {
    ...typography.meta,
    color: colors.textMuted,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.accent,
  },
  listContent: {
    gap: spacing.s10,
    paddingBottom: spacing.s16,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: spacing.s12,
    gap: spacing.s6,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.s10,
  },
  cardTitleGroup: {
    flex: 1,
    gap: spacing.s6,
  },
  itemName: {
    ...typography.label,
    color: colors.text,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s6,
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: spacing.s6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  statusBadgeText: {
    ...typography.meta,
    fontWeight: "700",
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s4,
    paddingHorizontal: spacing.s6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaBadgeText: {
    ...typography.meta,
    color: colors.textMuted,
  },
  amountText: {
    ...typography.label,
  },
  incomeText: {
    color: colors.income,
  },
  expenseText: {
    color: colors.expense,
  },
  metaListRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s6,
  },
  metaText: {
    ...typography.meta,
    color: colors.textMuted,
  },
  stateCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    padding: spacing.s20,
    alignItems: "center",
    gap: spacing.s12,
  },
  helperText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: spacing.s16,
    minHeight: controlHeight.target,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
}));
