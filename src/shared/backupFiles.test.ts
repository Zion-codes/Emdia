import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import { createTestDatabase } from "../../tests/helpers/inMemorySqlite";
import { MAX_BACKUP_FILE_SIZE_BYTES } from "../database/backup";
import { DatabaseError } from "../database/errors";
import {
  createSafetyBackupFile,
  exportBackupFile,
  pickBackupFile,
} from "./backupFiles";

const mockGetDocumentAsync = jest.mocked(DocumentPicker.getDocumentAsync);
const mockIsSharingAvailable = jest.mocked(Sharing.isAvailableAsync);
const mockShareAsync = jest.mocked(Sharing.shareAsync);

describe("backupFiles", () => {
  let db: SQLite.SQLiteDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  it("exports backup file to cache, shares when available and cleans up temp file", async () => {
    mockIsSharingAvailable.mockResolvedValueOnce(true);
    let sharedContent = "";
    mockShareAsync.mockImplementationOnce(async (uri) => {
      sharedContent = await new File(uri).text();
    });

    const fixedDate = new Date(2026, 2, 15, 9, 5, 3);
    const result = await exportBackupFile(db, fixedDate);

    expect(result.fileName).toBe("emdia-backup-20260315-090503.json");
    expect(result.fileUri).toBe(
      "file:///cache/emdia-backup-20260315-090503.json"
    );
    expect(mockShareAsync).toHaveBeenCalledWith(result.fileUri, {
      mimeType: "application/json",
      dialogTitle: "Exportar backup do Em Dia",
      UTI: "public.json",
    });

    const parsed = JSON.parse(sharedContent) as { format: string };
    expect(parsed.format).toBe("emdia-backup");
    expect(new File(result.fileUri).exists).toBe(false);
  });

  it("throws ValidationError and cleans temp file when sharing is unavailable, and ignores cleanup delete errors", async () => {
    mockIsSharingAvailable.mockResolvedValueOnce(false);
    const fixedDate = new Date(2026, 2, 15, 9, 5, 4);

    await expect(exportBackupFile(db, fixedDate)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message:
        "Compartilhamento de arquivos não está disponível neste dispositivo.",
    });
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(
      new File(Paths.cache, "emdia-backup-20260315-090504.json").exists
    ).toBe(false);

    mockIsSharingAvailable.mockResolvedValueOnce(true);
    const deleteSpy = jest
      .spyOn(File.prototype, "delete")
      .mockImplementationOnce(() => {
        throw new Error("unlink failed");
      });

    await expect(exportBackupFile(db)).resolves.toMatchObject({
      fileName: expect.stringMatching(/^emdia-backup-.*\.json$/),
    });
    deleteSpy.mockRestore();

    const createSpy = jest
      .spyOn(File.prototype, "create")
      .mockImplementationOnce(() => {
        throw new Error("create failed");
      });
    await expect(
      exportBackupFile(db, new Date(2026, 10, 26, 23, 59, 59))
    ).rejects.toThrow("create failed");
    createSpy.mockRestore();
  });

  it("handles canceled/empty picker, reads and cleans cache copies, preserves non-cache and safety-backup URIs and enforces max size", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    expect(await pickBackupFile()).toBeNull();
    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      type: [
        "application/json",
        "text/json",
        "text/plain",
        "application/octet-stream",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [],
    });
    expect(await pickBackupFile()).toBeNull();

    const cachedFile = new File(Paths.cache, "picked-backup.json");
    cachedFile.create({ intermediates: true, overwrite: true });
    cachedFile.write('{"app":"emdia"}');

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "picked-backup.json",
          uri: cachedFile.uri,
          lastModified: 1,
        },
      ],
    });

    const pickedCache = await pickBackupFile();
    expect(pickedCache).toEqual({
      fileName: "picked-backup.json",
      content: '{"app":"emdia"}',
    });
    expect(cachedFile.exists).toBe(false);

    const safetyCachedFile = new File(
      new Directory(Paths.cache, "safety-backups"),
      "emdia-safety-20260501-081540.json"
    );
    safetyCachedFile.create({ intermediates: true, overwrite: true });
    safetyCachedFile.write('{"app":"emdia","safety":true}');

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "emdia-safety-20260501-081540.json",
          uri: safetyCachedFile.uri,
          lastModified: 1,
        },
      ],
    });

    const pickedSafety = await pickBackupFile();
    expect(pickedSafety).toEqual({
      fileName: "emdia-safety-20260501-081540.json",
      content: '{"app":"emdia","safety":true}',
    });
    expect(safetyCachedFile.exists).toBe(true);

    const externalFile = new File("file:///external", "external-backup.json");
    externalFile.create({ intermediates: true, overwrite: true });
    externalFile.write('{"app":"emdia","external":true}');

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "external-backup.json",
          uri: externalFile.uri,
          lastModified: 1,
        },
      ],
    });

    const pickedExternal = await pickBackupFile();
    expect(pickedExternal).toEqual({
      fileName: "external-backup.json",
      content: '{"app":"emdia","external":true}',
    });
    expect(externalFile.exists).toBe(true);

    const oversizedFile = new File(Paths.cache, "oversized.json");
    oversizedFile.create({ intermediates: true, overwrite: true });
    oversizedFile.write("{}");

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "oversized.json",
          uri: oversizedFile.uri,
          size: MAX_BACKUP_FILE_SIZE_BYTES + 1,
          lastModified: 1,
        },
      ],
    });

    await expect(pickBackupFile()).rejects.toThrow(DatabaseError);
    expect(oversizedFile.exists).toBe(false);

    const oversizedByFileSize = new File(
      Paths.cache,
      "oversized-file-size.json"
    );
    oversizedByFileSize.create({ intermediates: true, overwrite: true });
    oversizedByFileSize.write("{}");
    const sizeSpy = jest
      .spyOn(File.prototype, "size", "get")
      .mockReturnValueOnce(MAX_BACKUP_FILE_SIZE_BYTES + 1);

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "oversized-file-size.json",
          uri: oversizedByFileSize.uri,
          lastModified: 1,
        },
      ],
    });

    await expect(pickBackupFile()).rejects.toThrow(DatabaseError);
    expect(oversizedByFileSize.exists).toBe(false);
    sizeSpy.mockRestore();

    const unknownSizeFile = new File(
      Paths.cache,
      "unknown-size-multibyte.json"
    );
    unknownSizeFile.create({ intermediates: true, overwrite: true });
    unknownSizeFile.write("🚀".repeat(5 * 1024 * 1024 + 1));
    const unknownSizeSpy = jest
      .spyOn(File.prototype, "size", "get")
      .mockReturnValueOnce(undefined as unknown as number);

    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: "unknown-size-multibyte.json",
          uri: unknownSizeFile.uri,
          lastModified: 1,
        },
      ],
    });

    await expect(pickBackupFile()).rejects.toThrow(DatabaseError);
    expect(unknownSizeFile.exists).toBe(false);
    unknownSizeSpy.mockRestore();
  });

  it("creates safety backups in cache on iOS and documents on non-iOS with retention of 3 latest files and propagates errors", async () => {
    const originalOs = Platform.OS;

    Object.defineProperty(Platform, "OS", {
      value: "ios",
      configurable: true,
    });
    const iosSafety = await createSafetyBackupFile(
      db,
      new Date(2026, 4, 1, 8, 15, 10)
    );
    expect(iosSafety.fileUri).toBe(
      "file:///cache/safety-backups/emdia-safety-20260501-081510.json"
    );

    Object.defineProperty(Platform, "OS", {
      value: "android",
      configurable: true,
    });
    await createSafetyBackupFile(db, new Date(2026, 4, 1, 8, 15, 10));
    await createSafetyBackupFile(db, new Date(2026, 4, 1, 8, 15, 20));
    await createSafetyBackupFile(db, new Date(2026, 4, 1, 8, 15, 30));
    const fourth = await createSafetyBackupFile(
      db,
      new Date(2026, 4, 1, 8, 15, 40)
    );

    expect(fourth.fileName).toBe("emdia-safety-20260501-081540.json");
    expect(fourth.fileUri).toBe(
      "file:///documents/safety-backups/emdia-safety-20260501-081540.json"
    );

    const safetyDir = new Directory(Paths.document, "safety-backups");
    expect(safetyDir.exists).toBe(true);

    const remaining = safetyDir
      .list()
      .map((entry) => entry.name)
      .sort();
    expect(remaining).toEqual([
      "emdia-safety-20260501-081520.json",
      "emdia-safety-20260501-081530.json",
      "emdia-safety-20260501-081540.json",
    ]);

    const dbSpy = jest
      .spyOn(db, "getAllAsync")
      .mockRejectedValueOnce(new Error("disk full"));

    await expect(createSafetyBackupFile(db)).rejects.toThrow("disk full");
    dbSpy.mockRestore();

    Object.defineProperty(Platform, "OS", {
      value: originalOs,
      configurable: true,
    });
  });
});
