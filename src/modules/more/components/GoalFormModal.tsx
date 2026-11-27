import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  type Goal,
  removeGoalFromMonth,
  setGoalForMonth,
} from "../../../database";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import { formatAmountInput } from "../../../shared/utils/format";
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
  formatMonthLabel,
  parseMoneyInput,
} from "../utils/moreHelpers";

type GoalFormModalProps = {
  visible: boolean;
  month: string;
  goal: number | null;
  history: Goal[];
  onClose: () => void;
  onSuccess: () => void;
};

export function GoalFormModal({
  visible,
  month,
  goal,
  history,
  onClose,
  onSuccess,
}: GoalFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Meta do mês"
      testID="goal-form-modal"
    >
      {visible ? (
        <GoalFormContent
          month={month}
          goal={goal}
          history={history}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type GoalFormContentProps = {
  month: string;
  goal: number | null;
  history: Goal[];
  onClose: () => void;
  onSuccess: () => void;
};

function GoalFormContent({
  month,
  goal,
  history,
  onClose,
  onSuccess,
}: GoalFormContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const { isHidden } = usePrivacy();

  const [amountInput, setAmountInput] = useState(() =>
    goal !== null && !isHidden ? formatAmountInput(goal) : ""
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (): Promise<void> => {
    const result = parseMoneyInput(amountInput);
    const preserveGoal = isHidden && goal !== null && result.status === "empty";
    if (result.status !== "valid" && !preserveGoal) {
      setErrorMessage("Informe um valor válido maior que zero.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (!preserveGoal) {
        await setGoalForMonth(db, month, result.amount as number);
      }
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível salvar a meta.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await removeGoalFromMonth(db, month);
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível remover a meta.")
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
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>
          Meta para {formatMonthLabel(month)} (R$)
        </Text>
        <TextInput
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.placeholder}
          testID="goal-amount-input"
          style={styles.input}
        />
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} testID="goal-form-error">
          {errorMessage}
        </Text>
      ) : null}

      {confirmingRemove ? (
        <View style={styles.confirmBox} testID="goal-remove-confirm-box">
          <Text style={styles.confirmText}>
            Remover a meta deste mês? O histórico anterior será mantido.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setConfirmingRemove(false)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="goal-cancel-remove-button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void handleRemove();
              }}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="goal-confirm-remove-button"
              style={styles.dangerButton}
            >
              <Text style={styles.dangerButtonText}>Confirmar remoção</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.actionsColumn}>
          <TouchableOpacity
            onPress={() => {
              void handleSave();
            }}
            disabled={isSubmitting}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            testID="goal-submit-button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Salvar meta</Text>
          </TouchableOpacity>

          {goal !== null ? (
            <TouchableOpacity
              onPress={() => setConfirmingRemove(true)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="goal-remove-button"
              style={styles.dangerOutlineButton}
            >
              <Text style={styles.dangerOutlineText}>Remover meta do mês</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <View style={styles.historySection}>
        <Text style={styles.historyTitle}>Histórico</Text>
        {history.length === 0 ? (
          <Text style={styles.helperText} testID="goal-history-empty">
            Nenhuma meta registrada.
          </Text>
        ) : (
          <View style={styles.historyList}>
            {history.map((item) => (
              <View
                key={item.id}
                style={styles.historyRow}
                testID={`goal-history-${item.id}`}
              >
                <Text style={styles.historyMonth}>
                  {formatMonthLabel(item.since)}
                </Text>
                <Text style={styles.historyAmount}>
                  {formatMoney(item.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  scroll: {
    maxHeight: 500,
  },
  container: {
    gap: spacing.s16,
    paddingBottom: spacing.s6,
  },
  fieldGroup: {
    gap: spacing.s6,
  },
  row: {
    flexDirection: "row",
    gap: spacing.s10,
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
  dangerOutlineButton: {
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s12,
  },
  dangerOutlineText: {
    ...typography.label,
    color: colors.danger,
  },
  errorText: {
    ...typography.meta,
    color: colors.danger,
    fontWeight: "600",
  },
  historySection: {
    gap: spacing.s10,
  },
  historyTitle: {
    ...typography.title,
    color: colors.text,
  },
  helperText: {
    ...typography.body,
    color: colors.textMuted,
  },
  historyList: {
    gap: spacing.s10,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  historyMonth: {
    ...typography.label,
    color: colors.text,
  },
  historyAmount: {
    ...typography.label,
    color: colors.accent,
  },
}));
