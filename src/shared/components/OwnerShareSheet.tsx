import { type JSX, useMemo, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import {
  buildOwnerShareSummary,
  type OwnerStatement,
} from "../../database/repositories/owners";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { shareOwnerStatementSummary } from "../share";
import { createThemedStyles, useColors, useThemedStyles } from "../theme";
import { Icon } from "./Icon";
import { ModalSheet } from "./ModalSheet";
import { Text } from "./Text";

type ShareMode = "total" | "detailed";

type OwnerShareSheetProps = {
  visible: boolean;
  onClose: () => void;
  statement: OwnerStatement;
  periodLabel: string;
  testID?: string;
};

const MODE_OPTIONS: { value: ShareMode; label: string }[] = [
  { value: "total", label: "Resumido" },
  { value: "detailed", label: "Detalhado" },
];

export function OwnerShareSheet({
  visible,
  onClose,
  statement,
  periodLabel,
  testID,
}: OwnerShareSheetProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const [mode, setMode] = useState<ShareMode>("total");
  const [isSharing, setIsSharing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewText = useMemo(
    () => buildOwnerShareSummary(statement, { mode, periodLabel }),
    [mode, periodLabel, statement]
  );

  const handleShare = async (): Promise<void> => {
    setIsSharing(true);
    setErrorMessage(null);

    const status = await shareOwnerStatementSummary(statement, {
      mode,
      periodLabel,
    });

    setIsSharing(false);

    if (status === "error") {
      setErrorMessage("Não foi possível compartilhar o resumo.");
      return;
    }

    if (status === "shared") {
      onClose();
    }
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={`Compartilhar resumo (${statement.owner.name})`}
      testID={testID ?? "owner-share-sheet"}
    >
      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((option) => {
          const selected = mode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => setMode(option.value)}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              testID={`share-mode-${option.value}`}
              style={[
                styles.modeButton,
                selected ? styles.modeButtonSelected : undefined,
              ]}
            >
              <Text
                style={[
                  styles.modeLabel,
                  selected ? styles.modeLabelSelected : undefined,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.previewBox}>
        <ScrollView
          style={styles.previewScroll}
          showsVerticalScrollIndicator={false}
        >
          <Text
            selectable
            style={styles.previewText}
            testID="share-preview-text"
          >
            {previewText}
          </Text>
        </ScrollView>
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} testID="share-error-text">
          {errorMessage}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          void handleShare();
        }}
        disabled={isSharing}
        activeOpacity={opacity.pressed}
        accessibilityRole="button"
        testID="share-submit-button"
        style={[styles.shareButton, isSharing ? styles.disabled : undefined]}
      >
        <Icon
          name="share-social-outline"
          size={20}
          color={colors.textOnPrimary}
        />
        <Text style={styles.shareButtonText}>
          {isSharing ? "Compartilhando..." : "Compartilhar"}
        </Text>
      </TouchableOpacity>
    </ModalSheet>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  modeRow: {
    flexDirection: "row",
    gap: spacing.s10,
  },
  modeButton: {
    flex: 1,
    height: controlHeight.target,
    borderRadius: radii.controlSm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modeLabel: {
    ...typography.label,
    color: colors.text,
  },
  modeLabelSelected: {
    color: colors.textOnPrimary,
  },
  previewBox: {
    maxHeight: 220,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.s12,
  },
  previewScroll: {
    flexGrow: 0,
  },
  previewText: {
    ...typography.body,
    color: colors.text,
  },
  errorText: {
    ...typography.meta,
    color: colors.danger,
  },
  shareButton: {
    height: controlHeight.button,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.s10,
  },
  shareButtonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
  disabled: {
    opacity: opacity.disabled,
  },
}));
