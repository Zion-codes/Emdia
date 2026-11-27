import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  createInvoice,
  deleteInvoice,
  type Invoice,
  updateInvoice,
} from "../../../database";
import { Icon } from "../../../shared/components/Icon";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import { formatAmountInput, parseAmount } from "../../../shared/utils/format";
import { useDatabase } from "../../../state/database";
import { usePrivacy } from "../../../state/privacy";
import { avatarPalette } from "../../../theme/colors";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { extractErrorMessage, parseDayInput } from "../utils/invoiceHelpers";

type InvoiceFormModalProps = {
  visible: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onSuccess: (savedInvoiceId?: string) => void;
};

export function InvoiceFormModal({
  visible,
  invoice,
  onClose,
  onSuccess,
}: InvoiceFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={invoice ? "Editar cartão" : "Novo cartão"}
      testID="invoice-form-modal"
    >
      {visible ? (
        <InvoiceFormContent
          invoice={invoice}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type InvoiceFormContentProps = {
  invoice: Invoice | null;
  onClose: () => void;
  onSuccess: (savedInvoiceId?: string) => void;
};

function InvoiceFormContent({
  invoice,
  onClose,
  onSuccess,
}: InvoiceFormContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const { isHidden } = usePrivacy();

  const isEditing = invoice !== null;

  const [name, setName] = useState(() => invoice?.name ?? "");
  const [limitInput, setLimitInput] = useState(() =>
    !invoice || isHidden ? "" : formatAmountInput(invoice.limitAmount)
  );
  const [dueDayInput, setDueDayInput] = useState(() =>
    invoice ? String(invoice.dueDay) : ""
  );
  const [closingDayInput, setClosingDayInput] = useState(() =>
    invoice?.closingDay ? String(invoice.closingDay) : ""
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    () => invoice?.color ?? null
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setErrorMessage("Informe o nome do cartão.");
      return;
    }

    const trimmedLimit = limitInput.trim();
    let resolvedLimit: number | undefined;
    if (trimmedLimit.length === 0) {
      resolvedLimit = isEditing && isHidden ? undefined : 0;
    } else {
      const parsedLimit = parseAmount(trimmedLimit);
      const limitCents = Number.isFinite(parsedLimit)
        ? Math.round((parsedLimit + Number.EPSILON) * 100)
        : -1;
      if (
        !Number.isFinite(parsedLimit) ||
        limitCents < 0 ||
        !Number.isSafeInteger(limitCents)
      ) {
        setErrorMessage("Informe um limite válido maior ou igual a zero.");
        return;
      }
      resolvedLimit = parsedLimit;
    }

    const parsedDueDay = parseDayInput(dueDayInput);
    if (parsedDueDay === null || !Number.isInteger(parsedDueDay)) {
      setErrorMessage("Informe um dia de vencimento entre 1 e 31.");
      return;
    }

    const parsedClosingDay = parseDayInput(closingDayInput);
    if (parsedClosingDay !== null && !Number.isInteger(parsedClosingDay)) {
      setErrorMessage("Informe um dia de fechamento entre 1 e 31.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const saved = invoice
        ? await updateInvoice(db, invoice.id, {
            name: trimmedName,
            limitAmount: resolvedLimit,
            dueDay: parsedDueDay,
            closingDay: parsedClosingDay,
            color: selectedColor,
          })
        : await createInvoice(db, {
            name: trimmedName,
            limitAmount: resolvedLimit,
            dueDay: parsedDueDay,
            closingDay: parsedClosingDay,
            color: selectedColor,
          });
      onSuccess(saved.id);
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível salvar o cartão.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await deleteInvoice(db, invoice!.id);
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível excluir o cartão.")
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
        <Text style={styles.label}>Nome do cartão</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Nubank, Itaú Black"
          placeholderTextColor={colors.placeholder}
          testID="invoice-name-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Limite (R$)</Text>
        <TextInput
          value={limitInput}
          onChangeText={setLimitInput}
          keyboardType="decimal-pad"
          placeholder={
            isEditing && isHidden ? "Deixe vazio para manter" : "0,00"
          }
          placeholderTextColor={colors.placeholder}
          testID="invoice-limit-input"
          style={styles.input}
        />
      </View>

      <View style={styles.row}>
        <View style={styles.halfField}>
          <Text style={styles.label}>Vencimento (dia)</Text>
          <TextInput
            value={dueDayInput}
            onChangeText={setDueDayInput}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="Ex.: 10"
            placeholderTextColor={colors.placeholder}
            testID="invoice-due-day-input"
            style={styles.input}
          />
        </View>

        <View style={styles.halfField}>
          <Text style={styles.label}>Fechamento (opcional)</Text>
          <TextInput
            value={closingDayInput}
            onChangeText={setClosingDayInput}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="Ex.: 3"
            placeholderTextColor={colors.placeholder}
            testID="invoice-closing-day-input"
            style={styles.input}
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Cor do cartão</Text>
        <View style={styles.colorGrid}>
          <TouchableOpacity
            onPress={() => setSelectedColor(null)}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Sem cor"
            testID="invoice-color-none"
            style={[
              styles.noneColorChip,
              selectedColor === null && styles.noneColorChipSelected,
            ]}
          >
            <Text style={styles.noneColorText}>Sem cor</Text>
          </TouchableOpacity>
          {avatarPalette.map((hex, index) => {
            const isSelected = selectedColor === hex;
            return (
              <TouchableOpacity
                key={hex}
                onPress={() => setSelectedColor(hex)}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                accessibilityLabel={`Cor ${index + 1}`}
                testID={`invoice-color-${index}`}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: hex },
                  isSelected && styles.colorSwatchSelected,
                ]}
              >
                {isSelected ? (
                  <Icon
                    name="checkmark"
                    size={16}
                    color={colors.textOnPrimary}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} testID="invoice-form-error">
          {errorMessage}
        </Text>
      ) : null}

      {confirmingDelete ? (
        <View style={styles.confirmBox} testID="invoice-delete-confirm-box">
          <Text style={styles.confirmText}>
            Excluir este cartão? As transações vinculadas serão mantidas sem
            cartão.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setConfirmingDelete(false)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="invoice-cancel-delete-button"
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
              testID="invoice-confirm-delete-button"
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
            testID="invoice-submit-button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {isEditing ? "Salvar alterações" : "Cadastrar cartão"}
            </Text>
          </TouchableOpacity>

          {isEditing ? (
            <TouchableOpacity
              onPress={() => setConfirmingDelete(true)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="invoice-delete-button"
              style={styles.dangerOutlineButton}
            >
              <Text style={styles.dangerOutlineText}>Excluir cartão</Text>
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
  halfField: {
    flex: 1,
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
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.s10,
  },
  noneColorChip: {
    minHeight: 32,
    paddingHorizontal: spacing.s10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  noneColorChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  noneColorText: {
    ...typography.meta,
    color: colors.text,
    fontWeight: "600",
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: colors.text,
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
