import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import {
  exportDatabaseBackup,
  getUtf8ByteLength,
  MAX_BACKUP_FILE_SIZE_BYTES,
} from "../database/backup";
import { DatabaseError } from "../database/errors";

const MAX_SAFETY_BACKUPS = 3;
const SAFETY_BACKUP_FILE_REGEX = /^emdia-safety-.*\.json$/;

export interface ExportBackupFileResult {
  fileName: string;
  fileUri: string;
}

export interface PickedBackupFile {
  fileName: string;
  content: string;
}

export interface SafetyBackupFileResult {
  fileName: string;
  fileUri: string;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimestampForFileName(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function safeDeleteFile(file: File): void {
  try {
    if (file.exists) {
      file.delete();
    }
  } catch {
    return;
  }
}

function isCacheUri(uri: string): boolean {
  const cacheBase = Paths.cache.uri.replace(/\/+$/, "");
  const safetyPrefix = `${cacheBase}/safety-backups/`;
  return uri.startsWith(`${cacheBase}/`) && !uri.startsWith(safetyPrefix);
}

function pruneOldSafetyBackups(safetyDir: Directory): void {
  const safetyFiles = safetyDir
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && SAFETY_BACKUP_FILE_REGEX.test(entry.name)
    )
    .sort((a, b) => b.name.localeCompare(a.name));

  for (const obsolete of safetyFiles.slice(MAX_SAFETY_BACKUPS)) {
    safeDeleteFile(obsolete);
  }
}

export async function exportBackupFile(
  db: SQLite.SQLiteDatabase,
  now: Date = new Date()
): Promise<ExportBackupFileResult> {
  const payload = await exportDatabaseBackup(db);
  const fileName = `emdia-backup-${formatTimestampForFileName(now)}.json`;
  const file = new File(Paths.cache, fileName);

  try {
    file.create({ intermediates: true, overwrite: true });
    file.write(JSON.stringify(payload, null, 2));

    const sharingAvailable = await Sharing.isAvailableAsync();
    if (!sharingAvailable) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "Compartilhamento de arquivos não está disponível neste dispositivo."
      );
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      dialogTitle: "Exportar backup do Em Dia",
      UTI: "public.json",
    });
  } finally {
    safeDeleteFile(file);
  }

  return {
    fileName,
    fileUri: file.uri,
  };
}

export async function pickBackupFile(): Promise<PickedBackupFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "application/json",
      "text/json",
      "text/plain",
      "application/octet-stream",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  const file = new File(asset.uri);
  const shouldCleanCacheCopy = isCacheUri(file.uri);

  try {
    const fileSize = asset.size ?? file.size;
    const hasKnownFileSize =
      typeof fileSize === "number" && Number.isFinite(fileSize);

    if (hasKnownFileSize && fileSize > MAX_BACKUP_FILE_SIZE_BYTES) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "O arquivo de backup excede o tamanho máximo permitido de 20 MB."
      );
    }

    const content = await file.text();
    if (
      !hasKnownFileSize &&
      getUtf8ByteLength(content) > MAX_BACKUP_FILE_SIZE_BYTES
    ) {
      throw new DatabaseError(
        "VALIDATION_ERROR",
        "O arquivo de backup excede o tamanho máximo permitido de 20 MB."
      );
    }

    return {
      fileName: asset.name,
      content,
    };
  } finally {
    if (shouldCleanCacheCopy) {
      safeDeleteFile(file);
    }
  }
}

export async function createSafetyBackupFile(
  db: SQLite.SQLiteDatabase,
  now: Date = new Date()
): Promise<SafetyBackupFileResult> {
  const payload = await exportDatabaseBackup(db);
  const safetyBaseDir = Platform.OS === "ios" ? Paths.cache : Paths.document;
  const safetyDir = new Directory(safetyBaseDir, "safety-backups");
  if (!safetyDir.exists) {
    safetyDir.create({ intermediates: true, idempotent: true });
  }

  const fileName = `emdia-safety-${formatTimestampForFileName(now)}.json`;
  const file = new File(safetyDir, fileName);
  file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(payload, null, 2));

  pruneOldSafetyBackups(safetyDir);

  return {
    fileName,
    fileUri: file.uri,
  };
}
