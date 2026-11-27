import { type JSX, useState } from "react";
import { ScrollView, TextInput, TouchableOpacity, View } from "react-native";
import {
  type Owner,
  createOwner,
  deleteOwner,
  updateOwner,
  updateSelfOwnerName,
} from "../../../database";
import { ModalSheet } from "../../../shared/components/ModalSheet";
import { Text } from "../../../shared/components/Text";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../../../shared/theme";
import { useDatabase } from "../../../state/database";
import {
  controlHeight,
  opacity,
  radii,
  spacing,
  typography,
} from "../../../theme/tokens";
import { requireText } from "../utils/moreHelpers";
import { extractErrorMessage } from "../../../shared/utils/error";

type OwnerFormModalProps = {
  visible: boolean;
  owner: Owner | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function OwnerFormModal({
  visible,
  owner,
  onClose,
  onSuccess,
}: OwnerFormModalProps): JSX.Element {
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={
        owner
          ? owner.isSelf
            ? "Renomear responsável padrão"
            : "Editar participante"
          : "Novo participante"
      }
      testID="owner-form-modal"
    >
      {visible ? (
        <OwnerFormContent
          owner={owner}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      ) : null}
    </ModalSheet>
  );
}

type OwnerFormContentProps = {
  owner: Owner | null;
  onClose: () => void;
  onSuccess: () => void;
};

function OwnerFormContent({
  owner,
  onClose,
  onSuccess,
}: OwnerFormContentProps): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const db = useDatabase();

  const isEditing = owner !== null;
  const isSelf = owner?.isSelf ?? false;

  const [name, setName] = useState(() => owner?.name ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (): Promise<void> => {
    const trimmedName = requireText(name);
    if (trimmedName === null) {
      setErrorMessage("Informe o nome do participante.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (owner) {
        if (owner.isSelf) {
          await updateSelfOwnerName(db, trimmedName);
        } else {
          await updateOwner(db, owner.id, { name: trimmedName });
        }
      } else {
        await createOwner(db, { name: trimmedName });
      }

      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível salvar o participante.")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async (): Promise<void> => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await deleteOwner(db, owner!.id);
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(
        extractErrorMessage(error, "Não foi possível excluir o participante.")
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
        <Text style={styles.label}>Nome do participante</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Maria, Carlos"
          placeholderTextColor={colors.placeholder}
          testID="owner-name-input"
          style={styles.input}
        />
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} testID="owner-form-error">
          {errorMessage}
        </Text>
      ) : null}

      {confirmingDelete ? (
        <View style={styles.confirmBox} testID="owner-delete-confirm-box">
          <Text style={styles.confirmText}>
            Excluir este participante? Esta ação não pode ser desfeita.
          </Text>
          <View style={styles.row}>
            <TouchableOpacity
              onPress={() => setConfirmingDelete(false)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="owner-cancel-delete-button"
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
              testID="owner-confirm-delete-button"
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
            testID="owner-submit-button"
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {isEditing ? "Salvar alterações" : "Cadastrar participante"}
            </Text>
          </TouchableOpacity>

          {isEditing && !isSelf ? (
            <TouchableOpacity
              onPress={() => setConfirmingDelete(true)}
              disabled={isSubmitting}
              activeOpacity={opacity.pressed}
              accessibilityRole="button"
              testID="owner-delete-button"
              style={styles.dangerOutlineButton}
            >
              <Text style={styles.dangerOutlineText}>Excluir participante</Text>
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
