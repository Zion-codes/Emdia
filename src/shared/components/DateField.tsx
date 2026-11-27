import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { type JSX, useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { createThemedStyles, useColors, useThemedStyles } from "../theme";
import { formatFullDate } from "../utils/format";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { Icon } from "./Icon";
import { ModalSheet } from "./ModalSheet";
import { Text } from "./Text";

type DateFieldProps = {
  label?: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  testID?: string;
};

export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  disabled = false,
  testID,
}: DateFieldProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const [isOpen, setIsOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(value);

  const handleOpen = (): void => {
    setDraftDate(value);
    setIsOpen(true);
  };

  const handleAndroidChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date
  ): void => {
    if (event.type === "set" || event.type === "dismissed") {
      setIsOpen(false);
    }

    if (event.type === "set" && selectedDate) {
      onChange(selectedDate);
    }
  };

  const handleIosChange = (
    _event: DateTimePickerEvent,
    selectedDate?: Date
  ): void => {
    if (selectedDate) {
      setDraftDate(selectedDate);
    }
  };

  const handleIosCancel = (): void => {
    setIsOpen(false);
  };

  const handleIosConfirm = (): void => {
    onChange(draftDate);
    setIsOpen(false);
  };

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        onPress={handleOpen}
        disabled={disabled}
        activeOpacity={opacity.pressed}
        accessibilityRole="button"
        accessibilityLabel={label ?? "Selecionar data"}
        testID={testID ?? "date-field-trigger"}
        style={[styles.trigger, disabled ? styles.disabled : undefined]}
      >
        <Text style={styles.valueText}>{formatFullDate(value)}</Text>
        <Icon name="calendar-outline" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {Platform.OS === "android" && isOpen ? (
        <DateTimePicker
          value={value}
          mode="date"
          display="default"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleAndroidChange}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <ModalSheet
          visible={isOpen}
          onClose={handleIosCancel}
          title={label ?? "Selecionar data"}
          testID="date-field-ios-modal"
        >
          <DateTimePicker
            value={draftDate}
            mode="date"
            display="spinner"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={handleIosChange}
          />
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleIosCancel}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="date-field-cancel"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleIosConfirm}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="date-field-confirm"
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Concluir</Text>
            </TouchableOpacity>
          </View>
        </ModalSheet>
      ) : null}
    </View>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  wrapper: {
    gap: spacing.s6,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
  trigger: {
    height: controlHeight.input,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.s16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  valueText: {
    ...typography.body,
    color: colors.text,
  },
  disabled: {
    opacity: opacity.disabled,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.s12,
  },
  secondaryButton: {
    flex: 1,
    height: controlHeight.dialogButton,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    ...typography.button,
    color: colors.text,
  },
  primaryButton: {
    flex: 1,
    height: controlHeight.dialogButton,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
}));
