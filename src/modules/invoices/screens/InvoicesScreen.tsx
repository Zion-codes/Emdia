import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import {
  addMonthsToMonthKey,
  getInvoiceMonthSummary,
  type Invoice,
  type InvoiceInstallmentItem,
  type InvoiceMonthSummary,
  listInvoices,
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
import { InvoiceFormModal } from "../components/InvoiceFormModal";
import { InvoicePaymentModal } from "../components/InvoicePaymentModal";
import {
  formatInvoiceDueDate,
  formatInvoiceMonthLabel,
  getInvoiceInstallmentBadge,
  getLimitUsagePercent,
  type InvoiceBadgeTone,
} from "../utils/invoiceHelpers";

export function InvoicesScreen(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const queryClient = useQueryClient();

  const [month, setMonth] = useState<string>(() => toMonthKey(new Date()));
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  const invoicesQuery = useQuery<Invoice[]>({
    queryKey: ["invoices", month],
    queryFn: () => listInvoices(db, { month }),
  });

  const invoices = invoicesQuery.data ?? [];
  const selectedInvoice =
    invoices.find((item) => item.id === selectedInvoiceId) ??
    invoices[0] ??
    null;

  const summaryQuery = useQuery<InvoiceMonthSummary>({
    queryKey: ["invoice-summary", selectedInvoice?.id ?? null, month],
    enabled: Boolean(selectedInvoice),
    queryFn: () => getInvoiceMonthSummary(db, selectedInvoice!.id, month),
  });

  const invalidateInvoiceData = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["monthly-summary"] });
  };

  const badgeStylesByTone: Record<
    InvoiceBadgeTone,
    { bg: string; text: string }
  > = {
    success: { bg: colors.successMuted, text: colors.success },
    danger: { bg: colors.dangerMuted, text: colors.danger },
    warning: { bg: colors.warningMuted, text: colors.warning },
    muted: { bg: colors.hoverOverlay, text: colors.textMuted },
  };

  const renderInstallmentItem = (item: InvoiceInstallmentItem): JSX.Element => {
    const badge = getInvoiceInstallmentBadge(item);
    const badgePalette = badgeStylesByTone[badge.tone];
    const metaParts = [
      item.installmentsCount > 1
        ? `Parcela ${item.number}/${item.installmentsCount}`
        : null,
      item.categoryName,
      item.ownerName,
    ].filter(Boolean);

    return (
      <View
        key={item.installmentId}
        style={styles.installmentRow}
        testID={`invoice-installment-${item.installmentId}`}
      >
        <View style={styles.installmentLeft}>
          <View style={styles.installmentTitleRow}>
            <Text style={styles.installmentName}>{item.name}</Text>
            <View
              style={[styles.statusBadge, { backgroundColor: badgePalette.bg }]}
            >
              <Text
                style={[styles.statusBadgeText, { color: badgePalette.text }]}
              >
                {badge.label}
              </Text>
            </View>
          </View>
          <Text style={styles.installmentMeta}>
            {formatInvoiceDueDate(item.dueDate)}
            {metaParts.length > 0 ? ` • ${metaParts.join(" • ")}` : ""}
          </Text>
        </View>
        <View style={styles.installmentRight}>
          <Text style={styles.installmentAmount}>
            {formatMoney(item.amount)}
          </Text>
          {item.status === "PENDING" && item.paidAmount > 0 ? (
            <Text style={styles.installmentRemaining}>
              Resta {formatMoney(item.remainingAmount)}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  const renderSelectedInvoiceDetails = (invoice: Invoice): JSX.Element => {
    const usagePercent = getLimitUsagePercent(
      invoice.limitAmount,
      invoice.usedLimit
    );
    const isOverLimit = invoice.availableLimit < 0;
    const summary = summaryQuery.data;

    return (
      <View style={styles.detailsContainer}>
        <View style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailTitleGroup}>
              {invoice.color ? (
                <View
                  style={[
                    styles.cardColorDot,
                    { backgroundColor: invoice.color },
                  ]}
                  testID="selected-invoice-color"
                />
              ) : null}
              <View style={styles.detailTitleText}>
                <Text style={styles.detailTitle}>{invoice.name}</Text>
                <Text style={styles.detailSubtitle}>
                  Vence dia {invoice.dueDay}
                  {invoice.closingDay
                    ? ` • Fecha dia ${invoice.closingDay}`
                    : ""}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                setEditingInvoice(invoice);
                setFormModalVisible(true);
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityLabel="Editar cartão"
              testID="invoice-edit-button"
              style={styles.iconButton}
            >
              <Icon name="create-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.limitSection}>
            <View style={styles.limitRow}>
              <View style={styles.limitMetric}>
                <Text style={styles.metricLabel}>Limite total</Text>
                <Text style={styles.metricValue}>
                  {formatMoney(invoice.limitAmount)}
                </Text>
              </View>
              <View style={styles.limitMetric}>
                <Text style={styles.metricLabel}>Usado</Text>
                <Text style={styles.metricValue}>
                  {formatMoney(invoice.usedLimit)}
                </Text>
              </View>
              <View style={styles.limitMetric}>
                <Text style={styles.metricLabel}>Disponível</Text>
                <Text
                  style={[
                    styles.metricValue,
                    isOverLimit && styles.metricDanger,
                  ]}
                  testID="invoice-available-limit"
                >
                  {formatMoney(invoice.availableLimit)}
                </Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${usagePercent}%`,
                    backgroundColor: isOverLimit
                      ? colors.danger
                      : colors.accent,
                  },
                ]}
                testID="invoice-limit-progress"
              />
            </View>
            {isOverLimit ? (
              <Text style={styles.overLimitText} testID="invoice-over-limit">
                Limite excedido
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Fatura do mês</Text>

          {summaryQuery.isPending ? (
            <Text style={styles.helperText} testID="invoice-summary-loading">
              Carregando fatura do mês...
            </Text>
          ) : summaryQuery.isError || !summary ? (
            <View style={styles.inlineErrorBox} testID="invoice-summary-error">
              <Text style={styles.errorText}>
                Não foi possível carregar os lançamentos da fatura.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  void summaryQuery.refetch();
                }}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="invoice-summary-retry-button"
                style={styles.retryButton}
              >
                <Text style={styles.retryButtonText}>Tentar novamente</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.limitRow}>
                <View style={styles.limitMetric}>
                  <Text style={styles.metricLabel}>Total</Text>
                  <Text style={styles.metricValue}>
                    {formatMoney(summary.totalAmount)}
                  </Text>
                </View>
                <View style={styles.limitMetric}>
                  <Text style={styles.metricLabel}>Pago</Text>
                  <Text style={[styles.metricValue, styles.metricSuccess]}>
                    {formatMoney(summary.paidAmount)}
                  </Text>
                </View>
                <View style={styles.limitMetric}>
                  <Text style={styles.metricLabel}>Restante</Text>
                  <Text style={styles.metricValue}>
                    {formatMoney(summary.pendingAmount)}
                  </Text>
                </View>
              </View>

              {summary.overdueCount > 0 ? (
                <View
                  style={styles.overdueBanner}
                  testID="invoice-overdue-banner"
                >
                  <Icon
                    name="alert-circle-outline"
                    size={16}
                    color={colors.danger}
                  />
                  <Text style={styles.overdueBannerText}>
                    {summary.overdueCount}{" "}
                    {summary.overdueCount === 1
                      ? "parcela vencida"
                      : "parcelas vencidas"}
                  </Text>
                </View>
              ) : null}

              {summary.pendingAmount > 0 ? (
                <TouchableOpacity
                  onPress={() => setPaymentModalVisible(true)}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="invoice-pay-button"
                  style={styles.payButton}
                >
                  <Text style={styles.payButtonText}>Pagar fatura</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.installmentsSection}>
                <Text style={styles.subsectionTitle}>Lançamentos</Text>
                {summary.installments.length === 0 ? (
                  <Text
                    style={styles.helperText}
                    testID="invoice-installments-empty"
                  >
                    Nenhum lançamento nesta fatura para este mês.
                  </Text>
                ) : (
                  <View style={styles.installmentsList}>
                    {summary.installments.map(renderInstallmentItem)}
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer scrollable testID="invoices-screen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Faturas</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingInvoice(null);
              setFormModalVisible(true);
            }}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Novo cartão"
            testID="invoices-add-button"
            style={styles.addButton}
          >
            <Icon name="add" size={22} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.monthSelector}>
          <TouchableOpacity
            onPress={() => setMonth((prev) => addMonthsToMonthKey(prev, -1))}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            testID="invoices-prev-month"
            style={styles.monthButton}
          >
            <Icon name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthLabel} testID="invoices-month-label">
            {formatInvoiceMonthLabel(month)}
          </Text>
          <TouchableOpacity
            onPress={() => setMonth((prev) => addMonthsToMonthKey(prev, 1))}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
            testID="invoices-next-month"
            style={styles.monthButton}
          >
            <Icon name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {invoicesQuery.isPending ? (
          <View style={styles.stateBox} testID="invoices-loading">
            <Text style={styles.helperText}>Carregando cartões...</Text>
          </View>
        ) : invoicesQuery.isError ? (
          <View style={styles.stateBox} testID="invoices-error">
            <Text style={styles.errorText}>
              Não foi possível carregar seus cartões.
            </Text>
            <TouchableOpacity
              onPress={() => {
                void invoicesQuery.refetch();
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="invoices-retry-button"
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        ) : invoices.length === 0 ? (
          <View style={styles.stateBox} testID="invoices-empty">
            <Icon name="card-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Nenhum cartão cadastrado</Text>
            <Text style={styles.helperText}>
              Cadastre seu cartão de crédito para acompanhar limites e pagar
              faturas mensais.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setEditingInvoice(null);
                setFormModalVisible(true);
              }}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="invoices-empty-add-button"
              style={styles.payButton}
            >
              <Text style={styles.payButtonText}>Cadastrar cartão</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsRow}
            >
              {invoices.map((item) => {
                const isSelected = item.id === selectedInvoice?.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setSelectedInvoiceId(item.id)}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`invoice-card-${item.id}`}
                    style={[
                      styles.cardChip,
                      isSelected && styles.cardChipSelected,
                    ]}
                  >
                    <View style={styles.cardChipHeader}>
                      {item.color ? (
                        <View
                          style={[
                            styles.cardColorDot,
                            { backgroundColor: item.color },
                          ]}
                        />
                      ) : null}
                      <Text
                        style={[
                          styles.cardChipName,
                          isSelected && styles.cardChipNameSelected,
                        ]}
                      >
                        {item.name}
                      </Text>
                    </View>
                    <Text style={styles.cardChipMeta}>
                      Vence dia {item.dueDay}
                    </Text>
                    <Text style={styles.cardChipAmount}>
                      {formatMoney(item.monthTotal)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {renderSelectedInvoiceDetails(selectedInvoice!)}
          </>
        )}
      </View>

      <InvoiceFormModal
        visible={formModalVisible}
        invoice={editingInvoice}
        onClose={() => {
          setFormModalVisible(false);
          setEditingInvoice(null);
        }}
        onSuccess={(savedId) => {
          if (savedId) {
            setSelectedInvoiceId(savedId);
          }
          invalidateInvoiceData();
        }}
      />

      <InvoicePaymentModal
        visible={paymentModalVisible}
        invoice={selectedInvoice}
        month={month}
        pendingAmount={summaryQuery.data?.pendingAmount ?? 0}
        onClose={() => setPaymentModalVisible(false)}
        onSuccess={invalidateInvoiceData}
      />
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
  addButton: {
    width: controlHeight.button,
    height: controlHeight.button,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
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
  stateBox: {
    padding: spacing.s20,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: spacing.s12,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.text,
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
    minHeight: controlHeight.button,
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
  cardsRow: {
    gap: spacing.s10,
    paddingVertical: spacing.s4,
  },
  cardChip: {
    minWidth: 150,
    padding: spacing.s12,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.s4,
  },
  cardChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  cardChipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s6,
  },
  cardColorDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  cardChipName: {
    ...typography.label,
    color: colors.text,
  },
  cardChipNameSelected: {
    color: colors.accent,
  },
  cardChipMeta: {
    ...typography.meta,
    color: colors.textMuted,
  },
  cardChipAmount: {
    ...typography.label,
    color: colors.text,
    marginTop: spacing.s4,
  },
  detailsContainer: {
    gap: spacing.s12,
  },
  detailCard: {
    padding: spacing.s16,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.s12,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  detailTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s10,
    flex: 1,
  },
  detailTitleText: {
    flex: 1,
    gap: spacing.s4,
  },
  detailTitle: {
    ...typography.title,
    color: colors.text,
  },
  detailSubtitle: {
    ...typography.meta,
    color: colors.textMuted,
  },
  iconButton: {
    padding: spacing.s10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  limitSection: {
    gap: spacing.s10,
  },
  limitRow: {
    flexDirection: "row",
    gap: spacing.s10,
  },
  limitMetric: {
    flex: 1,
    gap: spacing.s4,
  },
  metricLabel: {
    ...typography.meta,
    color: colors.textMuted,
  },
  metricValue: {
    ...typography.label,
    color: colors.text,
  },
  metricSuccess: {
    color: colors.success,
  },
  metricDanger: {
    color: colors.danger,
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
  overLimitText: {
    ...typography.meta,
    color: colors.danger,
    fontWeight: "600",
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
  },
  inlineErrorBox: {
    alignItems: "center",
    gap: spacing.s10,
  },
  overdueBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s6,
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s10,
    borderRadius: radii.control,
    backgroundColor: colors.dangerMuted,
  },
  overdueBannerText: {
    ...typography.meta,
    color: colors.danger,
    fontWeight: "600",
  },
  payButton: {
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s16,
  },
  payButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  installmentsSection: {
    gap: spacing.s10,
  },
  subsectionTitle: {
    ...typography.label,
    color: colors.text,
  },
  installmentsList: {
    gap: spacing.s10,
  },
  installmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.s12,
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  installmentLeft: {
    flex: 1,
    gap: spacing.s4,
  },
  installmentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s10,
    flexWrap: "wrap",
  },
  installmentName: {
    ...typography.label,
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s4,
    borderRadius: radii.pill,
  },
  statusBadgeText: {
    ...typography.meta,
    fontWeight: "600",
  },
  installmentMeta: {
    ...typography.meta,
    color: colors.textMuted,
  },
  installmentRight: {
    alignItems: "flex-end",
    gap: spacing.s4,
  },
  installmentAmount: {
    ...typography.label,
    color: colors.text,
  },
  installmentRemaining: {
    ...typography.meta,
    color: colors.warning,
  },
}));
