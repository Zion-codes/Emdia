import { useQuery } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import {
  addMonthsToMonthKey,
  getMonthlySummary,
  type MonthlySummary,
} from "../../../database";
import { Icon } from "../../../shared/components/Icon";
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
import { useProfile } from "../../../state/profile";
import { opacity, radii, spacing, typography } from "../../../theme/tokens";

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function HomeScreen(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const { profile } = useProfile();
  const formatMoney = useMoney();
  const [month, setMonth] = useState<string>(() => toMonthKey(new Date()));

  const { data, isLoading, isError, refetch } = useQuery<MonthlySummary>({
    queryKey: ["monthly-summary", month],
    queryFn: () => getMonthlySummary(db, { month }),
  });

  const handlePreviousMonth = (): void => {
    setMonth((current) => addMonthsToMonthKey(current, -1));
  };

  const handleNextMonth = (): void => {
    setMonth((current) => addMonthsToMonthKey(current, 1));
  };

  const goalProgress =
    data && data.goalAmount !== null
      ? clampProgress((data.totals.cashFlow / data.goalAmount) * 100)
      : 0;

  return (
    <ScreenContainer scrollable testID="home-screen">
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextGroup}>
            <Text style={styles.headerTitle}>Início</Text>
            <Text style={styles.greeting} testID="home-greeting">
              Olá, {profile.name}
            </Text>
          </View>
        </View>

        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={handlePreviousMonth}
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
            onPress={handleNextMonth}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            testID="next-month-button"
            style={styles.monthButton}
          >
            <Icon name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.card} testID="home-loading">
            <Text style={styles.helperText}>Carregando resumo do mês...</Text>
          </View>
        ) : isError || !data ? (
          <View style={styles.card} testID="home-error">
            <Text style={styles.errorText}>
              Não foi possível carregar o resumo financeiro.
            </Text>
            <TouchableOpacity
              onPress={() => {
                void refetch();
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="home-retry-button"
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content} testID="home-summary">
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Saldo previsto do mês</Text>
              <Text
                style={[
                  styles.balanceValue,
                  data.totals.cashFlow < 0
                    ? styles.negativeText
                    : styles.positiveText,
                ]}
                testID="home-cash-flow"
              >
                {formatMoney(data.totals.cashFlow)}
              </Text>
              <Text style={styles.helperText} testID="home-realized-cash-flow">
                Realizado: {formatMoney(data.totals.realizedCashFlow)}
              </Text>

              <View style={styles.metricsRow}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Receitas</Text>
                  <Text
                    style={[styles.metricValue, styles.positiveText]}
                    testID="home-income-total"
                  >
                    {formatMoney(data.totals.incomeTotal)}
                  </Text>
                </View>

                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>Despesas</Text>
                  <Text
                    style={[styles.metricValue, styles.negativeText]}
                    testID="home-expense-total"
                  >
                    {formatMoney(data.totals.expenseTotal)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>A pagar</Text>
                <Text style={styles.toPayValue} testID="home-to-pay-amount">
                  {formatMoney(data.toPayAmount)}
                </Text>
              </View>

              {data.overdueCount > 0 ? (
                <View style={styles.overdueBanner} testID="home-overdue-alert">
                  <Icon
                    name="alert-circle-outline"
                    size={18}
                    color={colors.danger}
                  />
                  <Text style={styles.overdueText}>
                    {data.overdueCount === 1
                      ? "1 parcela vencida"
                      : `${data.overdueCount} parcelas vencidas`}{" "}
                    ({formatMoney(data.overdueAmount)})
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card} testID="home-goal-card">
              <View style={styles.rowBetween}>
                <Text style={styles.sectionLabel}>Meta mensal</Text>
                {data.goalAmount !== null ? (
                  <Text style={styles.goalAmount} testID="home-goal-amount">
                    {formatMoney(data.goalAmount)}
                  </Text>
                ) : null}
              </View>

              {data.goalAmount !== null ? (
                <>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${goalProgress}%`,
                          backgroundColor: colors.accent,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.helperText} testID="home-goal-progress">
                    {goalProgress}% da meta atingida
                  </Text>
                </>
              ) : (
                <Text style={styles.helperText} testID="home-goal-empty">
                  Nenhuma meta definida para este mês.
                </Text>
              )}
            </View>

            <View style={styles.section} testID="home-budgets-section">
              <Text style={styles.sectionTitle}>Orçamentos por categoria</Text>

              {data.categoryBudgets.length === 0 ? (
                <View style={styles.card} testID="home-budgets-empty">
                  <Text style={styles.helperText}>
                    Nenhum orçamento configurado para este mês.
                  </Text>
                </View>
              ) : (
                data.categoryBudgets.map((budget) => {
                  const barWidth = clampProgress(budget.percentage);
                  const barColor = budget.isExceeded
                    ? colors.danger
                    : (budget.categoryColor ?? colors.accent);

                  return (
                    <View
                      key={budget.categoryId}
                      style={styles.card}
                      testID={`home-budget-${budget.categoryId}`}
                    >
                      <View style={styles.rowBetween}>
                        <Text style={styles.budgetName}>
                          {budget.categoryName}
                        </Text>
                        <Text
                          style={[
                            styles.budgetPercent,
                            budget.isExceeded ? styles.negativeText : undefined,
                          ]}
                        >
                          {Math.round(budget.percentage)}%
                        </Text>
                      </View>

                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: barColor,
                            },
                          ]}
                        />
                      </View>

                      <Text style={styles.helperText}>
                        {formatMoney(budget.spentAmount)} de{" "}
                        {formatMoney(budget.budgetAmount)}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    gap: spacing.s16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTextGroup: {
    gap: spacing.s4,
  },
  headerTitle: {
    ...typography.headline,
    color: colors.text,
  },
  greeting: {
    ...typography.body,
    color: colors.textMuted,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
  },
  monthButton: {
    padding: spacing.s6,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  },
  monthLabel: {
    ...typography.label,
    color: colors.text,
  },
  content: {
    gap: spacing.s16,
  },
  section: {
    gap: spacing.s10,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s16,
    gap: spacing.s10,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  balanceValue: {
    ...typography.headline,
  },
  metricsRow: {
    flexDirection: "row",
    gap: spacing.s12,
    marginTop: spacing.s4,
  },
  metricBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radii.controlSm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s12,
    gap: spacing.s4,
  },
  metricLabel: {
    ...typography.meta,
    color: colors.textMuted,
  },
  metricValue: {
    ...typography.label,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  toPayValue: {
    ...typography.title,
    color: colors.text,
  },
  overdueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s6,
    backgroundColor: colors.background,
    borderRadius: radii.controlSm,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.s10,
  },
  overdueText: {
    ...typography.meta,
    color: colors.danger,
    flex: 1,
  },
  goalAmount: {
    ...typography.label,
    color: colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radii.pill,
  },
  budgetName: {
    ...typography.label,
    color: colors.text,
  },
  budgetPercent: {
    ...typography.label,
    color: colors.textMuted,
  },
  helperText: {
    ...typography.meta,
    color: colors.textMuted,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
  retryButton: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s10,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  positiveText: {
    color: colors.success,
  },
  negativeText: {
    color: colors.danger,
  },
}));
