import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  type Investment,
  type InvestmentContribution,
  createContribution,
  deleteContribution,
  toLocalDateKey,
  updateContribution,
} from "../../../database";
import { DateField } from "../../../shared/components/DateField";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import {
  formatAmountInput,
  formatFullDate,
  parseDateKeyToLocalDate,
} from "../../../shared/utils/format";
import { extractErrorMessage } from "../../../shared/utils/error";
import { useDatabase } from "../../../state/database";
import { useMoney, usePrivacy } from "../../../state/privacy";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { parseMoneyInput } from "../utils/moreHelpers";

type ContributionFormModalProps = {
  visible: boolean;
  investment: Investment | null;
  contributions: InvestmentContribution[];
  onClose: () => void;
  onSuccess: () => void;
};

export function ContributionFormModal({
  visible,
  investment,
  contributions,
  onClose,
  onSuccess,
}: ContributionFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={investment ? `Aportes de ${investment.name}` : "Aportes"}
      testID="contribution-form-modal"
    >
      {visible && investment ? (
        <ContributionFormContent
          investment={investment}
          contributions={contributions}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type ContributionFormContentProps = {
  investment: Investment;
  contributions: InvestmentContribution[];
  onSuccess: () => void;
};

function ContributionFormContent({
  investment,
  contributions,
  onSuccess,
}: ContributionFormContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();
  const { isHidden } = usePrivacy();

  const [editing, setEditing] = useState<InvestmentContribution | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [contributedAt, setContributedAt] = useState<Date>(() => new Date());
  const [notes, setNotes] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = (): void => {
    setEditing(null);
    setAmountInput("");
    setContributedAt(new Date());
    setNotes("");
    setConfirmingDelete(false);
    setErrorMessage(null);
  };

  const handleEdit = (item: InvestmentContribution): void => {
    setEditing(item);
    setAmountInput(isHidden ? "" : formatAmountInput(item.amount));
    setContributedAt(parseDateKeyToLocalDate(item.contributedAt));
    setNotes(item.notes ?? "");
    setConfirmingDelete(false);
    setErrorMessage(null);
  };

  const handleSave = async (): Promise<void> => {
    const result = parseMoneyInput(amountInput);
    const preserveAmount =
      editing !== null && isHidden && result.status === "empty";
    if (result.status !== "valid" && !preserveAmount) {
      setErrorMessage("Informe um valor válido maior que zero.");
      return;
    }

    const notesValue = notes.trim().length > 0 ? notes.trim() : null;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (editing) {
        await updateContribution(db, editing.id, {
          amount: preserveAmount ? undefined : (result.amount as number),
          contributedAt: toLocalDateKey(contributedAt),
          notes: notesValue,
        });
      } else {
        await createContribution(db, {
          investmentId: investment.id,
          amount: result.amount as number,
          contributedAt: toLocalDateKey(contributedAt),
          notes: notesValue,
        });
      }

      onSuccess();
      resetForm();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível salvar o aporte.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (id: string): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await deleteContribution(db, id);
      onSuccess();
      resetForm();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível excluir o aporte.")
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
      <View style={styles.formSection}>
        <Text style={styles.formTitle}>
          {editing ? "Editar aporte" : "Novo aporte"}
        </Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Valor (R$)</Text>
          <TextInput
            value={amountInput}
            onChangeText={setAmountInput}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={colors.placeholder}
            testID="contribution-amount-input"
            style={styles.input}
          />
        </View>

        <DateField
          label="Data do aporte"
          value={contributedAt}
          onChange={setContributedAt}
          testID="contribution-date-field"
        />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Observações (opcional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex.: Aporte mensal"
            placeholderTextColor={colors.placeholder}
            testID="contribution-notes-input"
            style={styles.input}
          />
        </View>

        {errorMessage ? (
          <Text style={styles.errorText} testID="contribution-form-error">
            {errorMessage}
          </Text>
        ) : null}

        {confirmingDelete ? (
          <View
            style={styles.confirmBox}
            testID="contribution-delete-confirm-box"
          >
            <Text style={styles.confirmText}>
              Excluir este aporte? Esta ação não pode ser desfeita.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity
                onPress={() => setConfirmingDelete(false)}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="contribution-cancel-delete-button"
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void handleConfirmDelete(editing!.id);
                }}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="contribution-confirm-delete-button"
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
              testID="contribution-submit-button"
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {editing ? "Salvar alterações" : "Adicionar aporte"}
              </Text>
            </TouchableOpacity>

            {editing ? (
              <>
                <TouchableOpacity
                  onPress={resetForm}
                  disabled={isSubmitting}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="contribution-cancel-edit-button"
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>
                    Cancelar edição
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setConfirmingDelete(true)}
                  disabled={isSubmitting}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID="contribution-delete-button"
                  style={styles.dangerOutlineButton}
                >
                  <Text style={styles.dangerOutlineText}>Excluir aporte</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.listSection}>
        <Text style={styles.listTitle}>Aportes registrados</Text>
        {contributions.length === 0 ? (
          <Text style={styles.helperText} testID="contributions-empty">
            Nenhum aporte registrado.
          </Text>
        ) : (
          <View style={styles.contributionList}>
            {contributions.map((item) => (
              <View
                key={item.id}
                style={styles.contributionRow}
                testID={`contribution-row-${item.id}`}
              >
                <View style={styles.contributionInfo}>
                  <Text style={styles.contributionAmount}>
                    {formatMoney(item.amount)}
                  </Text>
                  <Text style={styles.contributionDate}>
                    {formatFullDate(
                      parseDateKeyToLocalDate(item.contributedAt)
                    )}
                  </Text>
                  {item.notes ? (
                    <Text style={styles.contributionNotes}>{item.notes}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleEdit(item)}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  accessibilityLabel="Editar aporte"
                  testID={`contribution-edit-${item.id}`}
                  style={styles.iconButton}
                >
                  <Text style={styles.iconButtonText}>Editar</Text>
                </TouchableOpacity>
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
  formSection: {
    gap: spacing.s12,
  },
  formTitle: {
    ...typography.title,
    color: colors.text,
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
  listSection: {
    gap: spacing.s10,
  },
  listTitle: {
    ...typography.title,
    color: colors.text,
  },
  helperText: {
    ...typography.body,
    color: colors.textMuted,
  },
  contributionList: {
    gap: spacing.s10,
  },
  contributionRow: {
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
  contributionInfo: {
    flex: 1,
    gap: spacing.s4,
  },
  contributionAmount: {
    ...typography.label,
    color: colors.text,
  },
  contributionDate: {
    ...typography.meta,
    color: colors.textMuted,
  },
  contributionNotes: {
    ...typography.meta,
    color: colors.textMuted,
  },
  iconButton: {
    paddingHorizontal: spacing.s10,
    paddingVertical: spacing.s6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconButtonText: {
    ...typography.meta,
    color: colors.accent,
    fontWeight: "600",
  },
}));
