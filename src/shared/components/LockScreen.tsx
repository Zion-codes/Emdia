import { type JSX } from "react";
import { Modal, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppLock } from "../../state/appLock";
import { layout } from "../../theme/layout";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../theme/tokens";
import { useAndroidBackHandler } from "../hooks/useAndroidBackHandler";
import { createThemedStyles, useColors, useThemedStyles } from "../theme";
import { Icon } from "./Icon";
import { Text } from "./Text";

export function LockScreen(): JSX.Element {
  const { isLocked, isAuthenticating, errorMessage, unlock } = useAppLock();
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);

  useAndroidBackHandler((): boolean => true, isLocked);

  return (
    <Modal
      visible={isLocked}
      animationType="none"
      transparent={false}
      onRequestClose={() => undefined}
      testID="lock-screen-modal"
    >
      <SafeAreaView style={styles.overlay} testID="lock-screen">
        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <Icon name="lock-closed" size={32} color={colors.accent} />
          </View>
          <Text style={styles.title}>Em Dia bloqueado</Text>
          <Text style={styles.subtitle}>
            Confirme sua biometria ou senha do dispositivo para continuar.
          </Text>
          {errorMessage ? (
            <Text style={styles.errorText} testID="lock-screen-error">
              {errorMessage}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              void unlock();
            }}
            disabled={isAuthenticating}
            activeOpacity={opacity.pressed}
            accessibilityRole="button"
            testID="lock-screen-unlock-button"
            style={[
              styles.button,
              isAuthenticating ? styles.disabled : undefined,
            ]}
          >
            <Text style={styles.buttonText}>
              {isAuthenticating ? "Validando..." : "Desbloquear"}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  overlay: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPadding,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    backgroundColor: colors.surface,
    borderRadius: radii.modal,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s20,
    alignItems: "center",
    gap: spacing.s12,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.s4,
  },
  title: {
    ...typography.title,
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
  errorText: {
    ...typography.meta,
    color: colors.danger,
    textAlign: "center",
  },
  button: {
    width: "100%",
    height: controlHeight.button,
    borderRadius: radii.button,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.s6,
  },
  buttonText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
  disabled: {
    opacity: opacity.disabled,
  },
}));
