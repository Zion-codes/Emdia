import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import { type Invoice, payInvoice, toLocalDateKey } from "../../../database";
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
import {
  extractErrorMessage,
  formatInvoiceMonthLabel,
} from "../utils/invoiceHelpers";

type InvoicePaymentMode = "full" | "partial";

type InvoicePaymentModalProps = {
  visible: boolean;
  invoice: Invoice | null;
  month: string;
  pendingAmount: number;
  onClose: () => void;
  onSuccess: () => void;
};

export function InvoicePaymentModal({
  visible,
  invoice,
  month,
  pendingAmount,
  onClose,
  onSuccess,
}: InvoicePaymentModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Pagar fatura"
      testID="invoice-payment-modal"
    >
      {visible && invoice ? (
        <InvoicePaymentContent
          invoice={invoice}
          month={month}
          pendingAmount={pendingAmount}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type InvoicePaymentContentProps = {
  invoice: Invoice;
  month: string;
  pendingAmount: number;
  onClose: () => void;
  onSuccess: () => void;
};

function InvoicePaymentContent({
  invoice,
  month,
  pendingAmount,
  onClose,
  onSuccess,
}: InvoicePaymentContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const { isHidden } = usePrivacy();

  const [mode, setMode] = useState<InvoicePaymentMode>("full");
  const [amountInput, setAmountInput] = useState(() =>
    isHidden ? "" : formatAmountInput(pendingAmount)
  );
  const [paidAt, setPaidAt] = useState<Date>(() => new Date());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    let resolvedAmount: number | undefined;

    if (mode === "partial") {
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

      const pendingCents = Math.round((pendingAmount + Number.EPSILON) * 100);
      if (paymentCents > pendingCents) {
        setErrorMessage("O valor informado excede o saldo pendente da fatura.");
        return;
      }

      resolvedAmount = parsedAmount;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await payInvoice(db, {
        invoiceId: invoice.id,
        month,
        amount: resolvedAmount,
        paidAt: toLocalDateKey(paidAt),
      });
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível pagar a fatura.")
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
        <Text style={styles.itemName}>
          {invoice.name} • {formatInvoiceMonthLabel(month)}
        </Text>
        <Text style={styles.helperText} testID="invoice-payment-pending-label">
          Saldo pendente: {formatMoney(pendingAmount)}
        </Text>
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => {
            setMode("full");
            setErrorMessage(null);
          }}
          activeOpacity={opacity.pressed}
          accessibilityRole="button"
          testID="invoice-payment-mode-full"
          style={[
            styles.modeButton,
            mode === "full" && styles.modeButtonSelected,
          ]}
        >
          <Text
            style={[
              styles.modeButtonText,
              mode === "full" && styles.modeButtonTextSelected,
            ]}
          >
            Pagamento total
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setMode("partial");
            setErrorMessage(null);
          }}
          activeOpacity={opacity.pressed}
          accessibilityRole="button"
          testID="invoice-payment-mode-partial"
          style={[
            styles.modeButton,
            mode === "partial" && styles.modeButtonSelected,
          ]}
        >
          <Text
            style={[
              styles.modeButtonText,
              mode === "partial" && styles.modeButtonTextSelected,
            ]}
          >
            Pagamento parcial
          </Text>
        </TouchableOpacity>
      </View>

      {mode === "partial" ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Valor do pagamento (R$)</Text>
          <TextInput
            value={amountInput}
            onChangeText={setAmountInput}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={colors.placeholder}
            testID="invoice-payment-amount-input"
            style={styles.input}
          />
        </View>
      ) : null}

      <DateField
        label="Data do pagamento"
        value={paidAt}
        onChange={setPaidAt}
        testID="invoice-payment-date-field"
      />

      {errorMessage ? (
        <Text style={styles.errorText} testID="invoice-payment-error">
          {errorMessage}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          void handleSubmit();
        }}
        disabled={isSubmitting}
        activeOpacity={opacity.pressed}
        accessibilityRole="button"
        testID="invoice-payment-submit-button"
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>
          {mode === "full"
            ? `Quitar ${formatMoney(pendingAmount)}`
            : "Registrar pagamento"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  scroll: {
    maxHeight: 440,
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
  modeRow: {
    flexDirection: "row",
    gap: spacing.s10,
  },
  modeButton: {
    flex: 1,
    minHeight: controlHeight.button,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s10,
  },
  modeButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  modeButtonText: {
    ...typography.meta,
    fontWeight: "600",
    color: colors.textMuted,
  },
  modeButtonTextSelected: {
    color: colors.accent,
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
  primaryButton: {
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
  errorText: {
    ...typography.meta,
    color: colors.danger,
    fontWeight: "600",
  },
}));
