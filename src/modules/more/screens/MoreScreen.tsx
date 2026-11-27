import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import {
  type Category,
  addMonthsToMonthKey,
  type Goal,
  getGoalForMonth,
  getMonthDateRange,
  getOwnerStatement,
  type Investment,
  type InvestmentContribution,
  type Owner,
  listCategories,
  listContributions,
  listGoalHistory,
  listInvestments,
  listOwners,
} from "../../../database";
import { Icon } from "../../../shared/components/Icon";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { OwnerShareSheet } from "../../../shared/components/OwnerShareSheet";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import { formatMonthLabel, toMonthKey } from "../../../shared/utils/format";
import { useDatabase } from "../../../state/database";
import { useMoney } from "../../../state/privacy";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { CategoryFormModal } from "../components/CategoryFormModal";
import { ContributionFormModal } from "../components/ContributionFormModal";
import { GoalFormModal } from "../components/GoalFormModal";
import { InvestmentFormModal } from "../components/InvestmentFormModal";
import { OwnerFormModal } from "../components/OwnerFormModal";

export function MoreScreen(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState<string>(() => toMonthKey(new Date()));
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [ownerModalVisible, setOwnerModalVisible] = useState(false);
  const [editingOwner, setEditingOwner] = useState<Owner | null>(null);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [investmentModalVisible, setInvestmentModalVisible] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(
    null
  );
  const [contributionInvestment, setContributionInvestment] =
    useState<Investment | null>(null);
  const [shareOwner, setShareOwner] = useState<Owner | null>(null);

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["categories", month],
    queryFn: () => listCategories(db, { month }),
  });

  const ownersQuery = useQuery<Owner[]>({
    queryKey: ["owners"],
    queryFn: () => listOwners(db),
  });

  const goalQuery = useQuery<number | null>({
    queryKey: ["goal", month],
    queryFn: () => getGoalForMonth(db, month),
  });

  const goalHistoryQuery = useQuery<Goal[]>({
    queryKey: ["goal-history"],
    queryFn: () => listGoalHistory(db),
  });

  const investmentsQuery = useQuery<Investment[]>({
    queryKey: ["investments"],
    queryFn: () => listInvestments(db),
  });

  const contributionsQuery = useQuery<InvestmentContribution[]>({
    queryKey: [
      "investments",
      contributionInvestment?.id ?? null,
      "contributions",
    ],
    queryFn: () => listContributions(db, contributionInvestment!.id),
    enabled: contributionInvestment !== null,
  });

  const ownerStatementQuery = useQuery({
    queryKey: ["owner-statement", shareOwner?.id ?? null, month],
    queryFn: () => {
      const range = getMonthDateRange(month);
      return getOwnerStatement(db, {
        ownerId: shareOwner!.id,
        period: "range",
        from: range.start,
        to: range.end,
      });
    },
    enabled: shareOwner !== null,
  });

  const categories = categoriesQuery.data ?? [];
  const owners = ownersQuery.data ?? [];
  const investments = investmentsQuery.data ?? [];
  const goalHistory = goalHistoryQuery.data ?? [];
  const contributions = contributionsQuery.data ?? [];

  const invalidateData = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["owners"] });
    void queryClient.invalidateQueries({ queryKey: ["goal"] });
    void queryClient.invalidateQueries({ queryKey: ["goal-history"] });
    void queryClient.invalidateQueries({ queryKey: ["investments"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
  };

  return (
    <ScreenContainer scrollable testID="more-screen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Mais</Text>
        </View>

        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() => setMonth((prev) => addMonthsToMonthKey(prev, -1))}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            testID="more-prev-month"
            style={styles.monthButton}
          >
            <Icon name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthLabel} testID="more-month-label">
            {formatMonthLabel(month)}
          </Text>
          <TouchableOpacity
            onPress={() => setMonth((prev) => addMonthsToMonthKey(prev, 1))}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            testID="more-next-month"
            style={styles.monthButton}
          >
            <Icon name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categorias e orçamentos</Text>
            <TouchableOpacity
              onPress={() => {
                setEditingCategory(null);
                setCategoryModalVisible(true);
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityLabel="Nova categoria"
              testID="categories-add-button"
              style={styles.addButton}
            >
              <Icon name="add" size={20} color={colors.textOnPrimary} />
            </TouchableOpacity>
          </View>

          {categoriesQuery.isPending ? (
            <Text style={styles.helperText} testID="categories-loading">
              Carregando categorias...
            </Text>
          ) : categoriesQuery.isError ? (
            <View style={styles.stateBox} testID="categories-error">
              <Text style={styles.errorText}>
                Não foi possível carregar as categorias.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  void categoriesQuery.refetch();
                }}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="categories-retry-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : categories.length === 0 ? (
            <Text style={styles.helperText} testID="categories-empty">
              Nenhuma categoria cadastrada.
            </Text>
          ) : (
            <View style={styles.list}>
              {categories.map((category) => (
                <View
                  key={category.id}
                  style={styles.listRow}
                  testID={`category-row-${category.id}`}
                >
                  <View
                    style={[
                      styles.colorDot,
                      { backgroundColor: category.color ?? colors.border },
                    ]}
                  />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName}>{category.name}</Text>
                    <Text style={styles.listMeta}>
                      {category.budget !== null
                        ? `Orçamento ${formatMoney(category.budget)}`
                        : "Sem orçamento"}
                      {category.transactionsCount > 0
                        ? ` • ${category.transactionsCount} lançamentos`
                        : ""}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCategory(category);
                      setCategoryModalVisible(true);
                    }}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`category-edit-${category.id}`}
                    style={styles.rowButton}
                  >
                    <Text style={styles.rowButtonText}>Editar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Participantes</Text>
            <TouchableOpacity
              onPress={() => {
                setEditingOwner(null);
                setOwnerModalVisible(true);
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityLabel="Novo participante"
              testID="owners-add-button"
              style={styles.addButton}
            >
              <Icon name="add" size={20} color={colors.textOnPrimary} />
            </TouchableOpacity>
          </View>

          {ownersQuery.isPending ? (
            <Text style={styles.helperText} testID="owners-loading">
              Carregando participantes...
            </Text>
          ) : ownersQuery.isError ? (
            <View style={styles.stateBox} testID="owners-error">
              <Text style={styles.errorText}>
                Não foi possível carregar os participantes.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  void ownersQuery.refetch();
                }}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="owners-retry-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : owners.length === 0 ? (
            <Text style={styles.helperText} testID="owners-empty">
              Nenhum participante cadastrado.
            </Text>
          ) : (
            <View style={styles.list}>
              {owners.map((owner) => (
                <View
                  key={owner.id}
                  style={styles.listRow}
                  testID={`owner-row-${owner.id}`}
                >
                  <View style={styles.listInfo}>
                    <Text style={styles.listName}>{owner.name}</Text>
                    <Text style={styles.listMeta}>
                      {owner.isSelf ? "Responsável padrão" : "Participante"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShareOwner(owner)}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`owner-share-${owner.id}`}
                    style={styles.rowButton}
                  >
                    <Text style={styles.rowButtonText}>Extrato</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingOwner(owner);
                      setOwnerModalVisible(true);
                    }}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`owner-edit-${owner.id}`}
                    style={styles.rowButton}
                  >
                    <Text style={styles.rowButtonText}>Editar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meta do mês</Text>
            <TouchableOpacity
              onPress={() => setGoalModalVisible(true)}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityLabel="Editar meta"
              testID="goal-edit-button"
              style={styles.addButton}
            >
              <Icon
                name="create-outline"
                size={20}
                color={colors.textOnPrimary}
              />
            </TouchableOpacity>
          </View>

          {goalQuery.isPending ? (
            <Text style={styles.helperText} testID="goal-loading">
              Carregando meta...
            </Text>
          ) : goalQuery.isError ? (
            <View style={styles.stateBox} testID="goal-error">
              <Text style={styles.errorText}>
                Não foi possível carregar a meta.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  void goalQuery.refetch();
                }}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="goal-retry-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.goalBox}>
              <Text style={styles.goalLabel}>
                Meta para {formatMonthLabel(month)}
              </Text>
              <Text style={styles.goalValue} testID="goal-value">
                {goalQuery.data != null
                  ? formatMoney(goalQuery.data)
                  : "Nenhuma meta definida"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Investimentos</Text>
            <TouchableOpacity
              onPress={() => {
                setEditingInvestment(null);
                setInvestmentModalVisible(true);
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityLabel="Novo investimento"
              testID="investments-add-button"
              style={styles.addButton}
            >
              <Icon name="add" size={20} color={colors.textOnPrimary} />
            </TouchableOpacity>
          </View>

          {investmentsQuery.isPending ? (
            <Text style={styles.helperText} testID="investments-loading">
              Carregando investimentos...
            </Text>
          ) : investmentsQuery.isError ? (
            <View style={styles.stateBox} testID="investments-error">
              <Text style={styles.errorText}>
                Não foi possível carregar os investimentos.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  void investmentsQuery.refetch();
                }}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="investments-retry-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : investments.length === 0 ? (
            <Text style={styles.helperText} testID="investments-empty">
              Nenhum investimento cadastrado.
            </Text>
          ) : (
            <View style={styles.list}>
              {investments.map((investment) => (
                <View
                  key={investment.id}
                  style={styles.listRow}
                  testID={`investment-row-${investment.id}`}
                >
                  <View style={styles.listInfo}>
                    <Text style={styles.listName}>{investment.name}</Text>
                    <Text style={styles.listMeta}>
                      {investment.institution
                        ? `${investment.institution} • `
                        : ""}
                      Saldo {formatMoney(investment.currentBalance)} •{" "}
                      {investment.contributionsCount} aportes
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setContributionInvestment(investment)}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`investment-contributions-${investment.id}`}
                    style={styles.rowButton}
                  >
                    <Text style={styles.rowButtonText}>Aportes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingInvestment(investment);
                      setInvestmentModalVisible(true);
                    }}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`investment-edit-${investment.id}`}
                    style={styles.rowButton}
                  >
                    <Text style={styles.rowButtonText}>Editar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      <CategoryFormModal
        visible={categoryModalVisible}
        category={editingCategory}
        month={month}
        onClose={() => {
          setCategoryModalVisible(false);
          setEditingCategory(null);
        }}
        onSuccess={invalidateData}
      />

      <OwnerFormModal
        visible={ownerModalVisible}
        owner={editingOwner}
        onClose={() => {
          setOwnerModalVisible(false);
          setEditingOwner(null);
        }}
        onSuccess={invalidateData}
      />

      <GoalFormModal
        visible={goalModalVisible}
        month={month}
        goal={goalQuery.data ?? null}
        history={goalHistory}
        onClose={() => setGoalModalVisible(false)}
        onSuccess={invalidateData}
      />

      <InvestmentFormModal
        visible={investmentModalVisible}
        investment={editingInvestment}
        onClose={() => {
          setInvestmentModalVisible(false);
          setEditingInvestment(null);
        }}
        onSuccess={invalidateData}
      />

      <ContributionFormModal
        visible={contributionInvestment !== null}
        investment={contributionInvestment}
        contributions={contributions}
        onClose={() => setContributionInvestment(null)}
        onSuccess={invalidateData}
      />

      {shareOwner !== null ? (
        ownerStatementQuery.isPending ? (
          <ModalSheet
            visible
            onClose={() => setShareOwner(null)}
            title="Extrato do participante"
            testID="owner-statement-loading"
          >
            <Text style={styles.helperText}>Carregando extrato...</Text>
          </ModalSheet>
        ) : ownerStatementQuery.isError || !ownerStatementQuery.data ? (
          <ModalSheet
            visible
            onClose={() => setShareOwner(null)}
            title="Extrato do participante"
            testID="owner-statement-error"
          >
            <Text style={styles.errorText}>
              Não foi possível carregar o extrato.
            </Text>
          </ModalSheet>
        ) : (
          <OwnerShareSheet
            visible
            onClose={() => setShareOwner(null)}
            statement={ownerStatementQuery.data}
            periodLabel={formatMonthLabel(month)}
          />
        )
      ) : null}
    </ScreenContainer>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    gap: spacing.s16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    ...typography.headline,
    color: colors.text,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s6,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  monthButton: {
    padding: spacing.s10,
    borderRadius: radii.pill,
  },
  monthLabel: {
    ...typography.label,
    color: colors.text,
  },
  section: {
    padding: spacing.s16,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.s12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  helperText: {
    ...typography.body,
    color: colors.textMuted,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  stateBox: {
    gap: spacing.s10,
    alignItems: "flex-start",
  },
  retryButton: {
    minHeight: controlHeight.target,
    paddingHorizontal: spacing.s16,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  retryButtonText: {
    ...typography.label,
    color: colors.text,
  },
  list: {
    gap: spacing.s10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s10,
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: radii.pill,
  },
  listInfo: {
    flex: 1,
    gap: spacing.s4,
  },
  listName: {
    ...typography.label,
    color: colors.text,
  },
  listMeta: {
    ...typography.meta,
    color: colors.textMuted,
  },
  rowButton: {
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowButtonText: {
    ...typography.meta,
    color: colors.accent,
    fontWeight: "600",
  },
  goalBox: {
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.s4,
  },
  goalLabel: {
    ...typography.meta,
    color: colors.textMuted,
  },
  goalValue: {
    ...typography.title,
    color: colors.text,
  },
}));
