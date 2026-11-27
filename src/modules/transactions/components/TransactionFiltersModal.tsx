import { type JSX, useState } from "react";
import { ScrollView, Switch, TouchableOpacity, View } from "react-native";
import {
  type Category,
  type Owner,
  type TransactionSortBy,
} from "../../../database";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";

export interface TransactionFiltersValue {
  categoryId?: string;
  ownerId?: string;
  includeOverdue: boolean;
  sortBy: TransactionSortBy;
}

type TransactionFiltersModalProps = {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  owners: Owner[];
  value: TransactionFiltersValue;
  onApply: (next: TransactionFiltersValue) => void;
  onClear: () => void;
};

const SORT_OPTIONS: { value: TransactionSortBy; label: string }[] = [
  { value: "overdue_first", label: "Vencidas primeiro" },
  { value: "due_date", label: "Vencimento" },
  { value: "name", label: "Nome" },
];

export function TransactionFiltersModal({
  visible,
  onClose,
  categories,
  owners,
  value,
  onApply,
  onClear,
}: TransactionFiltersModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Filtros"
      testID="transaction-filters-modal"
    >
      {visible ? (
        <TransactionFiltersContent
          categories={categories}
          owners={owners}
          value={value}
          onClose={onClose}
          onApply={onApply}
          onClear={onClear}
        />
      ) : null}
    </ModalSheet>
  );
}

function TransactionFiltersContent({
  onClose,
  categories,
  owners,
  value,
  onApply,
  onClear,
}: Omit<TransactionFiltersModalProps, "visible">): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const [draft, setDraft] = useState<TransactionFiltersValue>(value);

  const handleApply = (): void => {
    onApply(draft);
    onClose();
  };

  const handleClear = (): void => {
    onClear();
    onClose();
  };

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ordenação</Text>
          <View style={styles.chipRow}>
            {SORT_OPTIONS.map((option) => {
              const selected = draft.sortBy === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      sortBy: option.value,
                    }))
                  }
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID={`filter-sort-${option.value}`}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      selected ? styles.chipTextSelected : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.sectionTitle}>
            Incluir atrasadas de meses anteriores
          </Text>
          <Switch
            value={draft.includeOverdue}
            onValueChange={(nextValue) =>
              setDraft((current) => ({
                ...current,
                includeOverdue: nextValue,
              }))
            }
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor={colors.surface}
            testID="filter-include-overdue-switch"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categoria</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() =>
                setDraft((current) => ({ ...current, categoryId: undefined }))
              }
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="filter-category-all"
              style={[
                styles.chip,
                !draft.categoryId ? styles.chipSelected : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  !draft.categoryId ? styles.chipTextSelected : null,
                ]}
              >
                Todas
              </Text>
            </TouchableOpacity>
            {categories.map((category) => {
              const selected = draft.categoryId === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      categoryId: category.id,
                    }))
                  }
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID={`filter-category-${category.id}`}
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Responsável</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() =>
                setDraft((current) => ({ ...current, ownerId: undefined }))
              }
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="filter-owner-all"
              style={[styles.chip, !draft.ownerId ? styles.chipSelected : null]}
            >
              <Text
                style={[
                  styles.chipText,
                  !draft.ownerId ? styles.chipTextSelected : null,
                ]}
              >
                Todos
              </Text>
            </TouchableOpacity>
            {owners.map((owner) => {
              const selected = draft.ownerId === owner.id;
              return (
                <TouchableOpacity
                  key={owner.id}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      ownerId: owner.id,
                    }))
                  }
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  testID={`filter-owner-${owner.id}`}
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
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={handleClear}
          activeOpacity={opacity.pressed}
          accessibilityRole="button"
          testID="filters-clear-button"
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Limpar filtros</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleApply}
          activeOpacity={opacity.pressed}
          accessibilityRole="button"
          testID="filters-apply-button"
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Aplicar</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: spacing.s16,
    paddingBottom: spacing.s6,
  },
  section: {
    gap: spacing.s10,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
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
    paddingHorizontal: spacing.s12,
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
    paddingHorizontal: spacing.s12,
  },
  primaryButtonText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
}));
