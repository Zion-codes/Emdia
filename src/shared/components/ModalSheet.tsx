import { type JSX, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAndroidBackHandler } from "../hooks/useAndroidBackHandler";
import { createThemedStyles, useColors, useThemedStyles } from "../theme";
import { layout } from "../../theme/layout";
import { opacity, radii, spacing, typography } from "../../theme/tokens";
import { Icon } from "./Icon";
import { Text } from "./Text";

type ModalSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
};

export function ModalSheet({
  visible,
  onClose,
  title,
  children,
  testID,
}: ModalSheetProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);

  useAndroidBackHandler((): boolean => {
    onClose();
    return true;
  }, visible);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <SafeAreaView style={styles.safeArea} edges={["bottom", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          testID="modal-sheet-kav"
        >
          <Pressable
            style={styles.backdrop}
            onPress={onClose}
            accessibilityLabel="Fechar modal"
            testID="modal-sheet-backdrop"
          >
            <Pressable
              style={styles.sheet}
              onPress={() => undefined}
              testID="modal-sheet-content"
            >
              {title ? (
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                  <TouchableOpacity
                    onPress={onClose}
                    activeOpacity={opacity.pressed}
                    style={styles.closeButton}
                    accessibilityRole="button"
                    accessibilityLabel="Fechar"
                    testID="modal-sheet-close"
                  >
                    <Icon name="close" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {children}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  safeArea: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.s20,
    paddingBottom: spacing.s20,
    gap: spacing.s16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  title: {
    ...typography.title,
    color: colors.text,
    flex: 1,
  },
  closeButton: {
    padding: spacing.s6,
    borderRadius: radii.pill,
  },
}));
