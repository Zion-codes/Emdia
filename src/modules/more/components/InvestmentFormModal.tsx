import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  type Investment,
  createInvestment,
  deleteInvestment,
  updateInvestment,
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
import { usePrivacy } from "../../../state/privacy";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { parseMoneyInput, requireText } from "../utils/moreHelpers";
import { extractErrorMessage } from "../../../shared/utils/error";

type InvestmentFormModalProps = {
  visible: boolean;
  investment: Investment | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function InvestmentFormModal({
  visible,
  investment,
  onClose,
  onSuccess,
}: InvestmentFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={investment ? "Editar investimento" : "Novo investimento"}
      testID="investment-form-modal"
    >
      {visible ? (
        <InvestmentFormContent
          investment={investment}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type InvestmentFormContentProps = {
  investment: Investment | null;
  onClose: () => void;
  onSuccess: () => void;
};

function InvestmentFormContent({
  investment,
  onClose,
  onSuccess,
}: InvestmentFormContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const { isHidden } = usePrivacy();

  const isEditing = investment !== null;

  const [name, setName] = useState(() => investment?.name ?? "");
  const [type, setType] = useState(() => investment?.type ?? "");
  const [institution, setInstitution] = useState(
    () => investment?.institution ?? ""
  );
  const [balanceInput, setBalanceInput] = useState(() =>
    investment && !isHidden ? formatAmountInput(investment.currentBalance) : ""
  );
  const [notes, setNotes] = useState(() => investment?.notes ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (): Promise<void> => {
    const trimmedName = requireText(name);
    if (trimmedName === null) {
      setErrorMessage("Informe o nome do investimento.");
      return;
    }

    const balanceResult = parseMoneyInput(balanceInput, { allowZero: true });
    if (balanceResult.status === "invalid") {
      setErrorMessage("Informe um saldo atual válido.");
      return;
    }

    const trimmedType = type.trim();
    const trimmedInstitution = institution.trim();
    const trimmedNotes = notes.trim();

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const payload = {
        name: trimmedName,
        type: trimmedType.length > 0 ? trimmedType : null,
        institution: trimmedInstitution.length > 0 ? trimmedInstitution : null,
        currentBalance:
          balanceResult.status === "valid"
            ? (balanceResult.amount as number)
            : undefined,
        notes: trimmedNotes.length > 0 ? trimmedNotes : null,
      };

      if (investment) {
        await updateInvestment(db, investment.id, payload);
      } else {
        await createInvestment(db, payload);
      }

      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível salvar o investimento.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await deleteInvestment(db, investment!.id);
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível excluir o investimento.")
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
        <Text style={styles.label}>Nome do investimento</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Tesouro Selic, CDB"
          placeholderTextColor={colors.placeholder}
          testID="investment-name-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Tipo (opcional)</Text>
        <TextInput
          value={type}
          onChangeText={setType}
          placeholder="Ex.: Renda fixa, Ações"
          placeholderTextColor={colors.placeholder}
          testID="investment-type-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Instituição (opcional)</Text>
        <TextInput
          value={institution}
          onChangeText={setInstitution}
          placeholder="Ex.: XP, Nubank"
          placeholderTextColor={colors.placeholder}
          testID="investment-institution-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Saldo atual (R$)</Text>
        <TextInput
          value={balanceInput}
          onChangeText={setBalanceInput}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.placeholder}
          testID="investment-balance-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Observações (opcional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Ex.: Objetivo de longo prazo"
          placeholderTextColor={colors.placeholder}
          testID="investment-notes-input"
          style={[styles.input, styles.notesInput]}
        />
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} testID="investment-form-error">
          {errorMessage}
        </Text>
      ) : null}

      {confirmingDelete ? (
        <View style={styles.confirmBox} testID="investment-delete-confirm-box">
          <Text style={styles.confirmText}>
            Excluir este investimento? Os aportes vinculados também serão
            excluídos.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setConfirmingDelete(false)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="investment-cancel-delete-button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void handleConfirmDelete();
              }}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="investment-confirm-delete-button"
              style={styles.dangerButton}
            >
              <Text style={styles.dangerButtonText}>Confirmar exclusão</Text>
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
            testID="investment-submit-button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {isEditing ? "Salvar alterações" : "Cadastrar investimento"}
            </Text>
          </TouchableOpacity>

          {isEditing ? (
            <TouchableOpacity
              onPress={() => setConfirmingDelete(true)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="investment-delete-button"
              style={styles.dangerOutlineButton}
            >
              <Text style={styles.dangerOutlineText}>Excluir investimento</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
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
  notesInput: {
    minHeight: 80,
    paddingTop: spacing.s12,
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
}));
