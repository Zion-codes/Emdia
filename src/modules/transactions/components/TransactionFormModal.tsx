import { type JSX, useState } from "react";
import {
  ScrollView,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  type AmountMode,
  type Category,
  createTransaction,
  type Invoice,
  isDatabaseError,
  type Owner,
  type RemainderDistribution,
  type TransactionListItem,
  type TransactionType,
  toLocalDateKey,
  updateTransaction,
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
  parseAmount,
  parseDateKeyToLocalDate,
} from "../../../shared/utils/format";
import { extractErrorMessage } from "../../../shared/utils/error";
import { useDatabase } from "../../../state/database";
import { useMoney } from "../../../state/privacy";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { getInstallmentPreview } from "../utils/transactionHelpers";

type TransactionFormModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingItem: TransactionListItem | null;
  categories: Category[];
  owners: Owner[];
  invoices: Invoice[];
};

export function TransactionFormModal({
  visible,
  onClose,
  onSuccess,
  editingItem,
  categories,
  owners,
  invoices,
}: TransactionFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={editingItem ? "Editar lançamento" : "Novo lançamento"}
      testID="transaction-form-modal"
    >
      {visible ? (
        <TransactionFormContent
          onClose={onClose}
          onSuccess={onSuccess}
          editingItem={editingItem}
          categories={categories}
          owners={owners}
          invoices={invoices}
        />
      ) : null}
    </ModalSheet>
  );
}

function TransactionFormContent({
  onClose,
  onSuccess,
  editingItem,
  categories,
  owners,
  invoices,
}: Omit<TransactionFormModalProps, "visible">): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const formatMoney = useMoney();

  const defaultOwner = owners.find((item) => item.isSelf) ?? owners[0];

  const [type, setType] = useState<TransactionType>(
    editingItem ? editingItem.type : "EXPENSE"
  );
  const [name, setName] = useState(editingItem ? editingItem.name : "");
  const [amountInput, setAmountInput] = useState(
    editingItem ? formatAmountInput(editingItem.amount) : ""
  );
  const [dueDate, setDueDate] = useState<Date>(() =>
    editingItem ? parseDateKeyToLocalDate(editingItem.dueDate) : new Date()
  );
  const [installmentsInput, setInstallmentsInput] = useState(
    editingItem ? String(editingItem.installmentsCount) : "1"
  );
  const [amountMode, setAmountMode] = useState<AmountMode>("total");
  const [remainderDistribution, setRemainderDistribution] =
    useState<RemainderDistribution>("last");
  const [recurrence, setRecurrence] = useState(
    editingItem ? editingItem.recurrence : false
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    editingItem ? editingItem.categoryId : null
  );
  const [ownerId, setOwnerId] = useState<string>(
    editingItem ? editingItem.ownerId : defaultOwner ? defaultOwner.id : ""
  );
  const [invoiceId, setInvoiceId] = useState<string | null>(
    editingItem ? editingItem.invoiceId : null
  );
  const [notes, setNotes] = useState(editingItem?.notes ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditing = editingItem !== null;

  const parsedInstallments = Number(installmentsInput.trim() || "0");
  const isInstallmentsMultiple =
    !isEditing &&
    Number.isInteger(parsedInstallments) &&
    parsedInstallments > 1 &&
    parsedInstallments <= 360;

  const parsedAmount = parseAmount(amountInput);
  const preview = getInstallmentPreview({
    amount: parsedAmount,
    installmentsCount: isInstallmentsMultiple ? parsedInstallments : 1,
    amountMode,
    remainderDistribution,
  });

  const handleInstallmentsChange = (value: string): void => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setInstallmentsInput(digitsOnly);
    const nextCount = Number(digitsOnly || "0");
    if (nextCount > 1 && recurrence) {
      setRecurrence(false);
    }
  };

  const handleRecurrenceToggle = (nextValue: boolean): void => {
    setRecurrence(nextValue);
  };

  const submitForm = async (allowDuplicate: boolean): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Informe o nome do lançamento.");
      return;
    }

    if (!ownerId) {
      setErrorMessage("Selecione um responsável.");
      return;
    }

    if (!isEditing) {
      const amountCents = Number.isFinite(parsedAmount)
        ? Math.round((parsedAmount + Number.EPSILON) * 100)
        : 0;
      if (
        !Number.isFinite(parsedAmount) ||
        amountCents <= 0 ||
        !Number.isSafeInteger(amountCents)
      ) {
        setErrorMessage("Informe um valor válido maior que zero.");
        return;
      }

      if (
        !Number.isInteger(parsedInstallments) ||
        parsedInstallments < 1 ||
        parsedInstallments > 360
      ) {
        setErrorMessage("Informe entre 1 e 360 parcelas.");
        return;
      }
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const normalizedNotes = notes.trim() ? notes.trim() : null;

      if (editingItem) {
        await updateTransaction(db, editingItem.transactionId, {
          name: trimmedName,
          type,
          categoryId,
          ownerId,
          invoiceId,
          recurrence: editingItem.installmentsCount > 1 ? false : recurrence,
          notes: normalizedNotes,
        });
      } else {
        await createTransaction(db, {
          name: trimmedName,
          type,
          amount: parsedAmount,
          dueDate: toLocalDateKey(dueDate),
          ownerId,
          categoryId,
          invoiceId,
          installmentsCount: parsedInstallments,
          amountMode,
          remainderDistribution,
          recurrence: parsedInstallments > 1 ? false : recurrence,
          notes: normalizedNotes,
          allowDuplicate,
        });
      }

      onSuccess();
      onClose();
    } catch (error) {
      if (!isEditing && isDatabaseError(error) && error.code === "CONFLICT") {
        setDuplicateConflict(true);
        setErrorMessage(error.message);
      } else {
        setErrorMessage(
          extractErrorMessage(error, "Não foi possível salvar o lançamento.")
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Tipo</Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setType("EXPENSE")}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="tx-form-type-expense"
              style={[
                styles.segmentButton,
                type === "EXPENSE" ? styles.segmentSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  type === "EXPENSE" ? styles.segmentTextSelected : null,
                ]}
              >
                Despesa
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setType("INCOME")}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="tx-form-type-income"
              style={[
                styles.segmentButton,
                type === "INCOME" ? styles.segmentSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  type === "INCOME" ? styles.segmentTextSelected : null,
                ]}
              >
                Receita
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              setDuplicateConflict(false);
            }}
            placeholder="Ex: Supermercado, Salário"
            placeholderTextColor={colors.placeholder}
            maxLength={120}
            testID="tx-form-name-input"
            style={styles.input}
          />
        </View>

        {!isEditing ? (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Valor (R$)</Text>
              <TextInput
                value={amountInput}
                onChangeText={(value) => {
                  setAmountInput(value);
                  setDuplicateConflict(false);
                }}
                placeholder="0,00"
                placeholderTextColor={colors.placeholder}
                keyboardType="decimal-pad"
                testID="tx-form-amount-input"
                style={styles.input}
              />
            </View>

            <DateField
              label="Vencimento"
              value={dueDate}
              onChange={setDueDate}
              testID="tx-form-due-date"
            />

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Parcelas (1 a 360)</Text>
              <TextInput
                value={installmentsInput}
                onChangeText={handleInstallmentsChange}
                placeholder="1"
                placeholderTextColor={colors.placeholder}
                keyboardType="number-pad"
                testID="tx-form-installments-input"
                style={styles.input}
              />
            </View>

            {isInstallmentsMultiple ? (
              <View
                style={styles.previewBox}
                testID="tx-form-installment-options"
              >
                <Text style={styles.label}>Modo do valor</Text>
                <View style={styles.row}>
                  <TouchableOpacity
                    onPress={() => setAmountMode("total")}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID="tx-form-amount-mode-total"
                    style={[
                      styles.segmentButton,
                      amountMode === "total" ? styles.segmentSelected : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        amountMode === "total"
                          ? styles.segmentTextSelected
                          : null,
                      ]}
                    >
                      Valor total
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setAmountMode("per_installment")}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID="tx-form-amount-mode-per"
                    style={[
                      styles.segmentButton,
                      amountMode === "per_installment"
                        ? styles.segmentSelected
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        amountMode === "per_installment"
                          ? styles.segmentTextSelected
                          : null,
                      ]}
                    >
                      Por parcela
                    </Text>
                  </TouchableOpacity>
                </View>

                {amountMode === "total" ? (
                  <>
                    <Text style={styles.label}>Diferença de centavos</Text>
                    <View style={styles.row}>
                      <TouchableOpacity
                        onPress={() => setRemainderDistribution("last")}
                        activeOpacity={opacity.pressed}
                        accessibilityRole="button"
                        testID="tx-form-remainder-last"
                        style={[
                          styles.segmentButton,
                          remainderDistribution === "last"
                            ? styles.segmentSelected
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            remainderDistribution === "last"
                              ? styles.segmentTextSelected
                              : null,
                          ]}
                        >
                          Última parcela
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setRemainderDistribution("first")}
                        activeOpacity={opacity.pressed}
                        accessibilityRole="button"
                        testID="tx-form-remainder-first"
                        style={[
                          styles.segmentButton,
                          remainderDistribution === "first"
                            ? styles.segmentSelected
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            remainderDistribution === "first"
                              ? styles.segmentTextSelected
                              : null,
                          ]}
                        >
                          Primeira parcela
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}

                <Text
                  style={styles.previewText}
                  testID="tx-form-installment-preview"
                >
                  Prévia: {parsedInstallments}x de{" "}
                  {formatMoney(preview.firstAmount)} (Total:{" "}
                  {formatMoney(preview.totalAmount)})
                </Text>
              </View>
            ) : null}

            <View style={styles.switchRow}>
              <View style={styles.switchTextGroup}>
                <Text style={styles.label}>Recorrência mensal</Text>
                <Text style={styles.helperText}>
                  {isInstallmentsMultiple
                    ? "Indisponível para lançamentos parcelados."
                    : "Gera automaticamente os próximos meses."}
                </Text>
              </View>
              <Switch
                value={recurrence}
                onValueChange={handleRecurrenceToggle}
                disabled={isInstallmentsMultiple}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.surface}
                testID="tx-form-recurrence-switch"
              />
            </View>
          </>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Responsável</Text>
          <View style={styles.chipRow}>
            {owners.map((owner) => {
              const selected = ownerId === owner.id;
              return (
                <TouchableOpacity
                  key={owner.id}
                  onPress={() => {
                    setOwnerId(owner.id);
                    setDuplicateConflict(false);
                  }}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID={`tx-form-owner-${owner.id}`}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected ? styles.chipTextSelected : null,
                    ]}
                  >
                    {owner.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Categoria</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() => setCategoryId(null)}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="tx-form-category-none"
              style={[
                styles.chip,
                categoryId === null ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  categoryId === null ? styles.chipTextSelected : null,
                ]}
              >
                Sem categoria
              </Text>
            </TouchableOpacity>
            {categories.map((category) => {
              const selected = categoryId === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  onPress={() => setCategoryId(category.id)}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID={`tx-form-category-${category.id}`}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected ? styles.chipTextSelected : null,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {invoices.length > 0 ? (
          <View style={styles.fieldGroup} testID="tx-form-invoice-section">
            <Text style={styles.label}>Fatura (opcional)</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => setInvoiceId(null)}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="tx-form-invoice-none"
                style={[
                  styles.chip,
                  invoiceId === null ? styles.chipSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    invoiceId === null ? styles.chipTextSelected : null,
                  ]}
                >
                  Sem fatura
                </Text>
              </TouchableOpacity>
              {invoices.map((invoice) => {
                const selected = invoiceId === invoice.id;
                return (
                  <TouchableOpacity
                    key={invoice.id}
                    onPress={() => setInvoiceId(invoice.id)}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    testID={`tx-form-invoice-${invoice.id}`}
                    style={[styles.chip, selected ? styles.chipSelected : null]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected ? styles.chipTextSelected : null,
                      ]}
                    >
                      {invoice.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Observações (opcional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Detalhes adicionais"
            placeholderTextColor={colors.placeholder}
            maxLength={500}
            testID="tx-form-notes-input"
            style={styles.input}
          />
        </View>

        {errorMessage ? (
          <View style={styles.errorBox} testID="tx-form-error">
            <Text style={styles.errorText}>{errorMessage}</Text>
            {duplicateConflict ? (
              <TouchableOpacity
                onPress={() => {
                  void submitForm(true);
                }}
                disabled={isSubmitting}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="tx-form-confirm-duplicate-button"
                style={styles.duplicateButton}
              >
                <Text style={styles.duplicateButtonText}>
                  Salvar mesmo assim
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={onClose}
          disabled={isSubmitting}
          activeOpacity={opacity.pressed}
          accessibilityRole="button"
          testID="tx-form-cancel-button"
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            void submitForm(false);
          }}
          disabled={isSubmitting}
          activeOpacity={opacity.pressed}
          accessibilityRole="button"
          testID="tx-form-save-button"
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Salvar</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    gap: spacing.s16,
    paddingBottom: spacing.s6,
  },
  fieldGroup: {
    gap: spacing.s6,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
  helperText: {
    ...typography.meta,
    color: colors.textMuted,
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
  row: {
    flexDirection: "row",
    gap: spacing.s10,
  },
  segmentButton: {
    flex: 1,
    minHeight: controlHeight.target,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.s10,
  },
  segmentSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  segmentText: {
    ...typography.label,
    color: colors.textMuted,
  },
  segmentTextSelected: {
    color: colors.accent,
  },
  previewBox: {
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.s10,
  },
  previewText: {
    ...typography.meta,
    color: colors.text,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  switchTextGroup: {
    flex: 1,
    gap: spacing.s4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s6,
  },
  chip: {
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  chipText: {
    ...typography.meta,
    color: colors.textMuted,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.accent,
  },
  errorBox: {
    padding: spacing.s12,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerMuted,
    gap: spacing.s10,
  },
  errorText: {
    ...typography.meta,
    color: colors.danger,
    fontWeight: "600",
  },
  duplicateButton: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s6,
    borderRadius: radii.controlSm,
    backgroundColor: colors.danger,
  },
  duplicateButtonText: {
    ...typography.meta,
    color: colors.textOnPrimary,
    fontWeight: "700",
  },
  footer: {
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
  primaryButton: {
    flex: 1,
    minHeight: controlHeight.dialogButton,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
}));
