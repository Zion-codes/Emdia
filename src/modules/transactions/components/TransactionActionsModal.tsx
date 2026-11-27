import { type JSX, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import {
  advanceRecurringInstallment,
  deleteTransaction,
  stopRecurrence,
  type TransactionListItem,
} from "../../../database";
import { Icon } from "../../../shared/components/Icon";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
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
  formatDueDateLabel,
  getTransactionStatusBadge,
} from "../utils/transactionHelpers";
import { extractErrorMessage } from "../../../shared/utils/error";

type ConfirmActionType = "stop_recurrence" | "delete" | null;

type TransactionActionsModalProps = {
  visible: boolean;
  item: TransactionListItem | null;
  onClose: () => void;
  onPay: (item: TransactionListItem) => void;
  onRevert: (item: TransactionListItem) => void;
  onEdit: (item: TransactionListItem) => void;
  onMutated: () => void;
};

export function TransactionActionsModal({
  visible,
  item,
  onClose,
  onPay,
  onRevert,
  onEdit,
  onMutated,
}: TransactionActionsModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={item?.name ?? "Ações"}
      testID="transaction-actions-modal"
    >
      {visible && item ? (
        <TransactionActionsContent
          item={item}
          onClose={onClose}
          onPay={onPay}
          onRevert={onRevert}
          onEdit={onEdit}
          onMutated={onMutated}
        />
      ) : null}
    </ModalSheet>
  );
}

type TransactionActionsContentProps = {
  item: TransactionListItem;
  onClose: () => void;
  onPay: (item: TransactionListItem) => void;
  onRevert: (item: TransactionListItem) => void;
  onEdit: (item: TransactionListItem) => void;
  onMutated: () => void;
};

function TransactionActionsContent({
  item,
  onClose,
  onPay,
  onRevert,
  onEdit,
  onMutated,
}: TransactionActionsContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();

  const [confirmAction, setConfirmAction] = useState<ConfirmActionType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdvanceRecurrence = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await advanceRecurringInstallment(db, item.transactionId);
      onMutated();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(
          error,
          "Não foi possível adiantar a próxima parcela."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmStopRecurrence = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await stopRecurrence(db, item.transactionId);
      onMutated();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível encerrar a recorrência.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await deleteTransaction(db, item.transactionId);
      onMutated();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível excluir o lançamento.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const badge = getTransactionStatusBadge(item);

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.amountText}>{formatMoney(item.amount)}</Text>
        <Text style={styles.metaText}>
          Vencimento: {formatDueDateLabel(item.dueDate)} • {badge.label}
        </Text>
      </View>

      {confirmAction ? (
        <View style={styles.confirmBox} testID="actions-confirm-box">
          <Text style={styles.confirmText}>
            {confirmAction === "stop_recurrence"
              ? "Encerrar a recorrência? Parcelas futuras não serão mais geradas."
              : `Excluir "${item.name}"? Esta ação removerá o lançamento e suas parcelas.`}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setConfirmAction(null)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="actions-confirm-cancel-button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (confirmAction === "stop_recurrence") {
                  void handleConfirmStopRecurrence();
                } else {
                  void handleConfirmDelete();
                }
              }}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="actions-confirm-execute-button"
              style={styles.dangerButton}
            >
              <Text style={styles.dangerButtonText}>
                {confirmAction === "stop_recurrence"
                  ? "Confirmar encerramento"
                  : "Confirmar exclusão"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.actionsList}>
          {item.isProjected ? (
            <View style={styles.noticeBox} testID="actions-projected-notice">
              <Icon name="time-outline" size={18} color={colors.accent} />
              <Text style={styles.noticeText}>
                Parcela projetada. Adiante a próxima parcela para registrar o
                pagamento antecipadamente.
              </Text>
            </View>
          ) : (
            <>
              {item.status !== "PAID" ? (
                <TouchableOpacity
                  onPress={() => onPay(item)}
                  disabled={isSubmitting}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="action-pay-button"
                  style={styles.actionRow}
                >
                  <Icon
                    name="checkmark-circle-outline"
                    size={20}
                    color={colors.success}
                  />
                  <Text style={styles.actionText}>
                    {item.type === "INCOME"
                      ? "Registrar recebimento"
                      : "Registrar pagamento"}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {item.paidAmount > 0 ? (
                <TouchableOpacity
                  onPress={() => onRevert(item)}
                  disabled={isSubmitting}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="action-revert-button"
                  style={styles.actionRow}
                >
                  <Icon
                    name="arrow-undo-outline"
                    size={20}
                    color={colors.warning}
                  />
                  <Text style={styles.actionText}>Estornar pagamento</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}

          <TouchableOpacity
            onPress={() => onEdit(item)}
            disabled={isSubmitting}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            testID="action-edit-button"
            style={styles.actionRow}
          >
            <Icon name="create-outline" size={20} color={colors.text} />
            <Text style={styles.actionText}>Editar lançamento</Text>
          </TouchableOpacity>

          {item.recurrence && item.active ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  void handleAdvanceRecurrence();
                }}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="action-advance-recurrence-button"
                style={styles.actionRow}
              >
                <Icon name="repeat" size={20} color={colors.accent} />
                <Text style={styles.actionText}>Adiantar próxima parcela</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setConfirmAction("stop_recurrence")}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="action-stop-recurrence-button"
                style={styles.actionRow}
              >
                <Icon
                  name="stop-circle-outline"
                  size={20}
                  color={colors.warning}
                />
                <Text style={styles.actionText}>Encerrar recorrência</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity
            onPress={() => setConfirmAction("delete")}
            disabled={isSubmitting}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            testID="action-delete-button"
            style={styles.actionRow}
          >
            <Icon name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.actionText, styles.dangerText]}>
              Excluir lançamento
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {errorMessage ? (
        <Text style={styles.errorText} testID="actions-error">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    gap: spacing.s16,
  },
  summaryCard: {
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.s4,
  },
  amountText: {
    ...typography.title,
    color: colors.text,
  },
  metaText: {
    ...typography.meta,
    color: colors.textMuted,
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s10,
    padding: spacing.s12,
    borderRadius: radii.control,
    backgroundColor: colors.accentMuted,
  },
  noticeText: {
    flex: 1,
    ...typography.meta,
    color: colors.accent,
  },
  actionsList: {
    gap: spacing.s6,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
    minHeight: controlHeight.target,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s10,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  actionText: {
    ...typography.label,
    color: colors.text,
  },
  dangerText: {
    color: colors.danger,
  },
  confirmBox: {
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
    gap: spacing.s12,
  },
  confirmText: {
    ...typography.body,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    gap: spacing.s10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    ...typography.label,
    color: colors.text,
  },
  dangerButton: {
    flex: 1,
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s10,
  },
  dangerButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  errorText: {
    ...typography.meta,
    color: colors.danger,
    fontWeight: "600",
  },
}));
