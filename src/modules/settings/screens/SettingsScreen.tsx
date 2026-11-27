import { useQueryClient } from "@tanstack/react-query";
import { type JSX, useState } from "react";
import { Switch, TextInput, TouchableOpacity, View } from "react-native";
import {
  type BackupPayloadV1,
  type BackupSummary,
  isDatabaseError,
  parseAndValidateBackup,
  restoreDatabaseBackup,
  summarizeBackup,
} from "../../../database";
import {
  createSafetyBackupFile,
  exportBackupFile,
  pickBackupFile,
} from "../../../shared/backupFiles";
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
import { useDatabase } from "../../../state/database";
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

interface PendingRestoreState {
  fileName: string;
  payload: BackupPayloadV1;
  summary: BackupSummary;
}

interface BackupFeedbackState {
  type: "success" | "error";
  message: string;
}

function formatBackupDate(isoDate: string): string {
  return new Date(isoDate).toLocaleString("pt-BR");
}

export function SettingsScreen(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();
  const queryClient = useQueryClient();
  const { profile, updateProfile, refreshProfile } = useProfile();
  const { preference, setPreference } = useAppearance();
  const { isHidden, toggle: togglePrivacy } = usePrivacy();
  const {
    isEnabled: isLockEnabled,
    isAvailable: isBiometricsAvailable,
    isLocked,
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
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupFeedback, setBackupFeedback] =
    useState<BackupFeedbackState | null>(null);
  const [pendingRestore, setPendingRestore] =
    useState<PendingRestoreState | null>(null);

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

  const handleExportBackup = async (): Promise<void> => {
    setIsExporting(true);
    setBackupFeedback(null);
    try {
      const result = await exportBackupFile(db);
      setBackupFeedback({
        type: "success",
        message: result.shared
          ? `Backup ${result.fileName} exportado e pronto para compartilhamento.`
          : `Backup salvo localmente em ${result.fileName}.`,
      });
    } catch {
      setBackupFeedback({
        type: "error",
        message: "Não foi possível exportar o backup.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleStartRestore = async (): Promise<void> => {
    setBackupFeedback(null);
    try {
      const picked = await pickBackupFile();
      if (!picked) {
        return;
      }

      const payload = parseAndValidateBackup(picked.content);
      const summary = summarizeBackup(payload);
      setPendingRestore({
        fileName: picked.fileName,
        payload,
        summary,
      });
    } catch (error) {
      setBackupFeedback({
        type: "error",
        message: isDatabaseError(error)
          ? error.message
          : "Não foi possível ler o arquivo de backup.",
      });
    }
  };

  const handleCloseRestoreModal = (): void => {
    if (isRestoring) {
      return;
    }
    setPendingRestore(null);
  };

  const handleConfirmRestore = async (
    target: PendingRestoreState
  ): Promise<void> => {
    setIsRestoring(true);
    setBackupFeedback(null);
    try {
      await createSafetyBackupFile(db);
      await restoreDatabaseBackup(db, target.payload);
      await queryClient.invalidateQueries();
      await refreshProfile();
      setPendingRestore(null);
      setBackupFeedback({
        type: "success",
        message: "Backup restaurado com sucesso.",
      });
    } catch {
      setPendingRestore(null);
      setBackupFeedback({
        type: "error",
        message: "Não foi possível restaurar o backup selecionado.",
      });
    } finally {
      setIsRestoring(false);
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados e backup</Text>
          <View style={styles.card}>
            <Text style={styles.helperText} testID="backup-security-notice">
              O arquivo de backup contém seus dados financeiros locais e não é
              criptografado. Guarde-o em local seguro.
            </Text>

            <View style={styles.backupActionsRow}>
              <TouchableOpacity
                onPress={() => {
                  void handleExportBackup();
                }}
                disabled={isExporting || isRestoring}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="export-backup-button"
                style={[
                  styles.primaryButton,
                  isExporting || isRestoring ? styles.disabled : undefined,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isExporting ? "Exportando..." : "Exportar backup"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  void handleStartRestore();
                }}
                disabled={isExporting || isRestoring}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="restore-backup-button"
                style={[
                  styles.secondaryButton,
                  isExporting || isRestoring ? styles.disabled : undefined,
                ]}
              >
                <Text style={styles.secondaryButtonText}>
                  {isRestoring ? "Restaurando..." : "Restaurar backup"}
                </Text>
              </TouchableOpacity>
            </View>

            {backupFeedback ? (
              <Text
                style={
                  backupFeedback.type === "error"
                    ? styles.errorText
                    : styles.successText
                }
                testID={
                  backupFeedback.type === "error"
                    ? "backup-error-message"
                    : "backup-success-message"
                }
              >
                {backupFeedback.message}
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
      <ModalSheet
        visible={pendingRestore !== null && !isLocked}
        onClose={handleCloseRestoreModal}
        title="Restaurar backup"
        testID="restore-backup-modal"
      >
        {pendingRestore ? (
          <View style={styles.modalBody}>
            <Text style={styles.errorText} testID="restore-destructive-warning">
              Esta ação substituirá todos os dados locais atuais pelos registros
              do backup selecionado. Uma cópia de segurança automática será
              salva antes da substituição.
            </Text>

            <View style={styles.summaryBox} testID="restore-backup-summary">
              <Text style={styles.summaryItem}>
                Arquivo: {pendingRestore.fileName}
              </Text>
              <Text style={styles.summaryItem}>
                Exportado em:{" "}
                {formatBackupDate(pendingRestore.summary.exportedAt)}
              </Text>
              <Text style={styles.summaryItem}>
                Versão do schema: v{pendingRestore.summary.schemaVersion}
              </Text>
              <Text style={styles.summaryItem}>
                Total de registros: {pendingRestore.summary.totalRecords}
              </Text>
              <Text style={styles.summaryItem}>
                Lançamentos: {pendingRestore.summary.counts.transactions} |
                Parcelas: {pendingRestore.summary.counts.installments}
              </Text>
              <Text style={styles.summaryItem}>
                Categorias: {pendingRestore.summary.counts.categories} |
                Cartões: {pendingRestore.summary.counts.invoices} |
                Investimentos: {pendingRestore.summary.counts.investments}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={handleCloseRestoreModal}
                disabled={isRestoring}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="cancel-restore-button"
                style={[
                  styles.secondaryButton,
                  isRestoring ? styles.disabled : undefined,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void handleConfirmRestore(pendingRestore);
                }}
                disabled={isRestoring}
                activeOpacity={opacity.pressed}
                accessibilityRole="button"
                testID="confirm-restore-button"
                style={[
                  styles.dangerButton,
                  isRestoring ? styles.disabled : undefined,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {isRestoring ? "Restaurando..." : "Confirmar"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
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
  successText: {
    ...typography.meta,
    color: colors.success,
  },
  backupActionsRow: {
    flexDirection: "row",
    gap: spacing.s12,
  },
  summaryBox: {
    backgroundColor: colors.background,
    borderRadius: radii.controlSm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s12,
    gap: spacing.s4,
  },
  summaryItem: {
    ...typography.meta,
    color: colors.text,
  },
  dangerButton: {
    flex: 1,
    height: controlHeight.dialogButton,
    borderRadius: radii.button,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
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
