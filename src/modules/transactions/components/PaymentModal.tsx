import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  registerInstallmentPayment,
  revertInstallmentPayment,
  settleInstallment,
  toLocalDateKey,
  type TransactionListItem,
} from "../../../database";
import { DateField } from "../../../shared/components/DateField";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import { formatAmountInput, parseAmount } from "../../../shared/utils/format";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { extractErrorMessage } from "../utils/transactionHelpers";

export type PaymentModalMode = "pay" | "revert";

type PaymentModalProps = {
  visible: boolean;
  item: TransactionListItem | null;
  mode: PaymentModalMode;
  onClose: () => void;
  onSuccess: () => void;
};

export function PaymentModal({
  visible,
  item,
  mode,
  onClose,
  onSuccess,
}: PaymentModalProps): JSX.Element {
  const isIncome = item?.type === "INCOME";
  const title =
    mode === "revert"
      ? "Estornar pagamento"
      : isIncome
        ? "Registrar recebimento"
        : "Registrar pagamento";

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="payment-modal"
    >
      {visible && item ? (
        <PaymentModalContent
          item={item}
          mode={mode}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type PaymentModalContentProps = {
  item: TransactionListItem;
  mode: PaymentModalMode;
  onClose: () => void;
  onSuccess: () => void;
};

function PaymentModalContent({
  item,
  mode,
  onClose,
  onSuccess,
}: PaymentModalContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const { isHidden } = usePrivacy();

  const [amountInput, setAmountInput] = useState(() =>
    isHidden ? "" : formatAmountInput(item.remainingAmount)
  );
  const [paidAt, setPaidAt] = useState<Date>(() => new Date());
  const [confirmingSettle, setConfirmingSettle] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isIncome = item.type === "INCOME";

  const handlePartialOrFullPayment = async (): Promise<void> => {
    const parsedAmount = parseAmount(amountInput);
    const paymentCents = Number.isFinite(parsedAmount)
      ? Math.round((parsedAmount + Number.EPSILON) * 100)
      : 0;
    if (
      !Number.isFinite(parsedAmount) ||
      paymentCents <= 0 ||
      !Number.isSafeInteger(paymentCents)
    ) {
      setErrorMessage("Informe um valor válido maior que zero.");
      return;
    }

    const remainingCents = Math.round(
      (item.remainingAmount + Number.EPSILON) * 100
    );
    if (paymentCents > remainingCents) {
      setErrorMessage("O valor informado excede o saldo restante.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await registerInstallmentPayment(db, {
        installmentId: item.installmentId,
        amount: parsedAmount,
        paidAt: toLocalDateKey(paidAt),
      });
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível registrar o pagamento.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSettle = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await settleInstallment(db, item.installmentId, {
        confirmed: true,
        paidAt: toLocalDateKey(paidAt),
      });
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível quitar a parcela.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRevert = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await revertInstallmentPayment(db, item.installmentId, {
        confirmed: true,
      });
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível estornar o pagamento.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.summaryBox}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.helperText} testID="payment-remaining-label">
          {mode === "revert"
            ? `Valor pago: ${formatMoney(item.paidAmount)}`
            : `Saldo restante: ${formatMoney(item.remainingAmount)}`}
        </Text>
      </View>

      {mode === "pay" ? (
        <>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Valor (R$)</Text>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={colors.placeholder}
              testID="payment-amount-input"
              style={styles.input}
            />
          </View>

          <DateField
            label={isIncome ? "Data do recebimento" : "Data do pagamento"}
            value={paidAt}
            onChange={setPaidAt}
            testID="payment-date-field"
          />

          {confirmingSettle ? (
            <View style={styles.confirmBox} testID="payment-settle-confirm-box">
              <Text style={styles.confirmText}>
                Confirmar quitação total de {formatMoney(item.remainingAmount)}?
              </Text>
              <View style={styles.row}>
                <TouchableOpacity
                  onPress={() => setConfirmingSettle(false)}
                  disabled={isSubmitting}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="payment-cancel-settle-button"
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    void handleConfirmSettle();
                  }}
                  disabled={isSubmitting}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="payment-confirm-settle-button"
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>
                    Confirmar quitação
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.actionsColumn}>
              <TouchableOpacity
                onPress={() => {
                  void handlePartialOrFullPayment();
                }}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="payment-submit-button"
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {isIncome ? "Registrar recebimento" : "Registrar pagamento"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setConfirmingSettle(true)}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="payment-settle-button"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Quitar total</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <View style={styles.confirmBox} testID="payment-revert-confirm-box">
          <Text style={styles.confirmText}>
            Confirmar estorno de {formatMoney(item.paidAmount)}? A parcela
            voltará para pendente.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="payment-cancel-revert-button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void handleConfirmRevert();
              }}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="payment-confirm-revert-button"
              style={styles.dangerButton}
            >
              <Text style={styles.dangerButtonText}>Confirmar estorno</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {errorMessage ? (
        <Text style={styles.errorText} testID="payment-error">
          {errorMessage}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  scroll: {
    maxHeight: 420,
  },
  container: {
    gap: spacing.s16,
    paddingBottom: spacing.s6,
  },
  summaryBox: {
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.s4,
  },
  itemName: {
    ...typography.label,
    color: colors.text,
  },
  helperText: {
    ...typography.meta,
    color: colors.textMuted,
  },
  fieldGroup: {
    gap: spacing.s6,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
  input: {
    minHeight: controlHeight.input,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.s12,
    color: colors.text,
    ...typography.body,
  },
  actionsColumn: {
    gap: spacing.s10,
  },
  row: {
    flexDirection: "row",
    gap: spacing.s10,
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
  primaryButton: {
    flex: 1,
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s12,
  },
  primaryButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  secondaryButton: {
    flex: 1,
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s12,
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
    paddingHorizontal: spacing.s12,
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
