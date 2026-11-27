import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  type Category,
  createCategory,
  deleteCategory,
  removeCategoryBudget,
  setCategoryBudget,
  updateCategory,
} from "../../../database";
import { Icon, type IconName } from "../../../shared/components/Icon";
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
import { avatarPalette } from "../../../theme/colors";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { parseMoneyInput, requireText } from "../utils/moreHelpers";
import { extractErrorMessage } from "../../../shared/utils/error";

const CATEGORY_ICONS: IconName[] = [
  "home-outline",
  "people-outline",
  "pricetags-outline",
  "wallet-outline",
  "time-outline",
  "star-outline",
  "bulb-outline",
  "notifications-outline",
];

type CategoryFormModalProps = {
  visible: boolean;
  category: Category | null;
  month: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function CategoryFormModal({
  visible,
  category,
  month,
  onClose,
  onSuccess,
}: CategoryFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={category ? "Editar categoria" : "Nova categoria"}
      testID="category-form-modal"
    >
      {visible ? (
        <CategoryFormContent
          category={category}
          month={month}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type CategoryFormContentProps = {
  category: Category | null;
  month: string;
  onClose: () => void;
  onSuccess: () => void;
};

function CategoryFormContent({
  category,
  month,
  onClose,
  onSuccess,
}: CategoryFormContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const { isHidden } = usePrivacy();

  const isEditing = category !== null;

  const [name, setName] = useState(() => category?.name ?? "");
  const [budgetInput, setBudgetInput] = useState(() =>
    category?.budget !== null && category?.budget !== undefined && !isHidden
      ? formatAmountInput(category.budget)
      : ""
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    () => category?.color ?? null
  );
  const [selectedIcon, setSelectedIcon] = useState<string | null>(
    () => category?.icon ?? null
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (): Promise<void> => {
    const trimmedName = requireText(name);
    if (trimmedName === null) {
      setErrorMessage("Informe o nome da categoria.");
      return;
    }

    const budgetResult = parseMoneyInput(budgetInput);
    if (budgetResult.status === "invalid") {
      setErrorMessage("Informe um valor de orçamento válido maior que zero.");
      return;
    }

    const preserveBudget =
      isEditing && isHidden && budgetResult.status === "empty";

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (category) {
        await updateCategory(db, category.id, {
          name: trimmedName,
          color: selectedColor,
          icon: selectedIcon,
        });

        if (budgetResult.status === "empty") {
          if (!preserveBudget) {
            await removeCategoryBudget(db, category.id, month);
          }
        } else {
          await setCategoryBudget(
            db,
            category.id,
            month,
            budgetResult.amount as number
          );
        }
      } else {
        await createCategory(db, {
          name: trimmedName,
          color: selectedColor,
          icon: selectedIcon,
          budget:
            budgetResult.status === "valid"
              ? (budgetResult.amount as number)
              : undefined,
          month,
        });
      }

      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível salvar a categoria.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await deleteCategory(db, category!.id);
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível excluir a categoria.")
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
        <Text style={styles.label}>Nome da categoria</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Mercado, Lazer"
          placeholderTextColor={colors.placeholder}
          testID="category-name-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Orçamento do mês (R$)</Text>
        <TextInput
          value={budgetInput}
          onChangeText={setBudgetInput}
          keyboardType="decimal-pad"
          placeholder={
            isEditing && isHidden
              ? "Deixe vazio para manter"
              : isEditing
                ? "Deixe vazio para remover"
                : "Opcional"
          }
          placeholderTextColor={colors.placeholder}
          testID="category-budget-input"
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Cor</Text>
        <View style={styles.optionGrid}>
          <TouchableOpacity
            onPress={() => setSelectedColor(null)}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Sem cor"
            accessibilityState={{ selected: selectedColor === null }}
            testID="category-color-none"
            style={[
              styles.noneChip,
              selectedColor === null && styles.noneChipSelected,
            ]}
          >
            <Text style={styles.noneChipText}>Sem cor</Text>
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
                accessibilityState={{ selected: isSelected }}
                testID={`category-color-${index}`}
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

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Ícone</Text>
        <View style={styles.optionGrid}>
          <TouchableOpacity
            onPress={() => setSelectedIcon(null)}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            accessibilityLabel="Sem ícone"
            accessibilityState={{ selected: selectedIcon === null }}
            testID="category-icon-none"
            style={[
              styles.noneChip,
              selectedIcon === null && styles.noneChipSelected,
            ]}
          >
            <Text style={styles.noneChipText}>Sem ícone</Text>
          </TouchableOpacity>
          {CATEGORY_ICONS.map((iconName, index) => {
            const isSelected = selectedIcon === iconName;
            return (
              <TouchableOpacity
                key={iconName}
                onPress={() => setSelectedIcon(iconName)}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                accessibilityLabel={`Ícone ${index + 1}`}
                accessibilityState={{ selected: isSelected }}
                testID={`category-icon-${index}`}
                style={[
                  styles.iconSwatch,
                  isSelected && styles.iconSwatchSelected,
                ]}
              >
                <Icon
                  name={iconName}
                  size={20}
                  color={isSelected ? colors.accent : colors.textMuted}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} testID="category-form-error">
          {errorMessage}
        </Text>
      ) : null}

      {confirmingDelete ? (
        <View style={styles.confirmBox} testID="category-delete-confirm-box">
          <Text style={styles.confirmText}>
            Excluir esta categoria? As transações vinculadas serão mantidas sem
            categoria.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setConfirmingDelete(false)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="category-cancel-delete-button"
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
              testID="category-confirm-delete-button"
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
            testID="category-submit-button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {isEditing ? "Salvar alterações" : "Cadastrar categoria"}
            </Text>
          </TouchableOpacity>

          {isEditing ? (
            <TouchableOpacity
              onPress={() => setConfirmingDelete(true)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="category-delete-button"
              style={styles.dangerOutlineButton}
            >
              <Text style={styles.dangerOutlineText}>Excluir categoria</Text>
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
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.s10,
  },
  noneChip: {
    minHeight: 32,
    paddingHorizontal: spacing.s10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  noneChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  noneChipText: {
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
  iconSwatch: {
    width: 40,
    height: 40,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  iconSwatchSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
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
