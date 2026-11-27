import { type JSX, useState } from "react";
import { Switch, TextInput, TouchableOpacity, View } from "react-native";
import { Icon } from "../../../shared/components/Icon";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { ScreenContainer } from "../../../shared/components/ScreenContainer";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import {
  type AppearancePreference,
  useAppearance,
} from "../../../state/appearance";
import { useAppLock } from "../../../state/appLock";
import { usePrivacy } from "../../../state/privacy";
import { useProfile } from "../../../state/profile";
import { avatarPalette } from "../../../theme/colors";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";

const APPEARANCE_OPTIONS: {
  value: AppearancePreference;
  label: string;
}[] = [
  { value: "system", label: "Automático" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "EU";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function SettingsScreen(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const { profile, updateProfile } = useProfile();
  const { preference, setPreference } = useAppearance();
  const { isHidden, toggle: togglePrivacy } = usePrivacy();
  const {
    isEnabled: isLockEnabled,
    isAvailable: isBiometricsAvailable,
    isAuthenticating,
    errorMessage: lockErrorMessage,
    enable: enableLock,
    disable: disableLock,
  } = useAppLock();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftColor, setDraftColor] = useState(profile.avatarColor);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openEditModal = (): void => {
    setDraftName(profile.name);
    setDraftColor(profile.avatarColor);
    setNameError(null);
    setIsEditOpen(true);
  };

  const closeEditModal = (): void => {
    setIsEditOpen(false);
    setNameError(null);
  };

  const handleSaveProfile = async (): Promise<void> => {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) {
      setNameError("Informe um nome válido.");
      return;
    }

    setIsSaving(true);
    setNameError(null);
    try {
      await updateProfile({
        name: trimmed,
        avatarColor: draftColor,
      });
      setIsEditOpen(false);
    } catch {
      setNameError("Não foi possível salvar o perfil.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleLock = (nextValue: boolean): void => {
    if (nextValue) {
      void enableLock();
    } else {
      void disableLock();
    }
  };

  return (
    <ScreenContainer scrollable testID="settings-screen">
      <View style={styles.container}>
        <Text style={styles.headerTitle}>Configurações</Text>

        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View
              style={[styles.avatar, { backgroundColor: profile.avatarColor }]}
              testID="profile-avatar"
            >
              <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName} testID="profile-name">
                {profile.name}
              </Text>
              <Text style={styles.profileSubtitle}>
                Perfil local e responsável padrão
              </Text>
            </View>
            <TouchableOpacity
              onPress={openEditModal}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              accessibilityLabel="Editar perfil"
              testID="edit-profile-button"
              style={styles.editButton}
            >
              <Icon name="create-outline" size={20} color={colors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Aparência</Text>
          <View style={styles.segmentedRow}>
            {APPEARANCE_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setPreference(option.value)}
                  activeOpacity={opacity.pressed}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`appearance-option-${option.value}`}
                  style={[
                    styles.segmentButton,
                    selected ? styles.segmentButtonSelected : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      selected ? styles.segmentLabelSelected : undefined,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacidade</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleTitle}>Ocultar valores</Text>
                <Text style={styles.toggleSubtitle}>
                  Substitui os valores monetários por marcadores na tela.
                </Text>
              </View>
              <Switch
                value={isHidden}
                onValueChange={togglePrivacy}
                trackColor={{
                  false: colors.borderStrong,
                  true: colors.accent,
                }}
                thumbColor={colors.surface}
                testID="privacy-toggle"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Segurança</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleTitle}>Bloqueio biométrico</Text>
                <Text style={styles.toggleSubtitle}>
                  Exige biometria ou senha do dispositivo ao abrir o aplicativo.
                </Text>
              </View>
              <Switch
                value={isLockEnabled}
                onValueChange={handleToggleLock}
                disabled={
                  isAuthenticating || (!isBiometricsAvailable && !isLockEnabled)
                }
                trackColor={{
                  false: colors.borderStrong,
                  true: colors.accent,
                }}
                thumbColor={colors.surface}
                testID="biometric-lock-toggle"
              />
            </View>
            {!isBiometricsAvailable ? (
              <Text
                style={styles.helperText}
                testID="biometrics-unavailable-text"
              >
                Biometria não disponível ou não cadastrada neste dispositivo.
              </Text>
            ) : null}
            {lockErrorMessage ? (
              <Text style={styles.errorText} testID="biometric-lock-error">
                {lockErrorMessage}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <ModalSheet
        visible={isEditOpen}
        onClose={closeEditModal}
        title="Editar perfil"
        testID="edit-profile-modal"
      >
        <View style={styles.modalBody}>
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Nome</Text>
            <TextInput
              value={draftName}
              onChangeText={(text) => {
                setDraftName(text);
                if (nameError) {
                  setNameError(null);
                }
              }}
              placeholder="Seu nome"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              autoFocus
              testID="profile-name-input"
            />
            {nameError ? (
              <Text style={styles.errorText} testID="profile-name-error">
                {nameError}
              </Text>
            ) : null}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Cor do avatar</Text>
            <View style={styles.colorGrid}>
              {avatarPalette.map((color) => {
                const selected = draftColor === color;
                return (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setDraftColor(color)}
                    activeOpacity={opacity.pressed}
                    accessibilityRole="button"
                    accessibilityLabel={`Selecionar cor ${color}`}
                    accessibilityState={{ selected }}
                    testID={`avatar-color-${color}`}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      selected ? styles.colorSwatchSelected : undefined,
                    ]}
                  >
                    {selected ? (
                      <Icon
                        name="checkmark"
                        size={18}
                        color={colors.textOnPrimary}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={closeEditModal}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="cancel-profile-button"
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                void handleSaveProfile();
              }}
              disabled={isSaving}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="save-profile-button"
              style={[
                styles.primaryButton,
                isSaving ? styles.disabled : undefined,
              ]}
            >
              <Text style={styles.primaryButtonText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ModalSheet>
    </ScreenContainer>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    gap: spacing.s20,
  },
  headerTitle: {
    ...typography.headline,
    color: colors.text,
  },
  section: {
    gap: spacing.s10,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s16,
    gap: spacing.s12,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  profileInfo: {
    flex: 1,
    gap: spacing.s4,
  },
  profileName: {
    ...typography.title,
    color: colors.text,
  },
  profileSubtitle: {
    ...typography.meta,
    color: colors.textMuted,
  },
  editButton: {
    padding: spacing.s10,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
  },
  segmentedRow: {
    flexDirection: "row",
    gap: spacing.s10,
  },
  segmentButton: {
    flex: 1,
    height: controlHeight.target,
    borderRadius: radii.controlSm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentLabel: {
    ...typography.label,
    color: colors.text,
  },
  segmentLabelSelected: {
    color: colors.textOnPrimary,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.s12,
  },
  toggleTextGroup: {
    flex: 1,
    gap: spacing.s4,
  },
  toggleTitle: {
    ...typography.label,
    color: colors.text,
  },
  toggleSubtitle: {
    ...typography.meta,
    color: colors.textMuted,
  },
  helperText: {
    ...typography.meta,
    color: colors.textMuted,
  },
  errorText: {
    ...typography.meta,
    color: colors.danger,
  },
  modalBody: {
    gap: spacing.s16,
  },
  fieldGroup: {
    gap: spacing.s6,
  },
  fieldLabel: {
    ...typography.label,
    color: colors.text,
  },
  input: {
    height: controlHeight.input,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.s16,
    color: colors.text,
    ...typography.body,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.s10,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.s12,
    marginTop: spacing.s4,
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
  disabled: {
    opacity: opacity.disabled,
  },
}));
