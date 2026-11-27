import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as SQLite from "expo-sqlite";
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
    await db.execAsync("PRAGMA user_version = 1;");
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
    expect(result.shared).toBe(true);
    expect(mockShareAsync).toHaveBeenCalledWith(result.fileUri, {
      mimeType: "application/json",
      dialogTitle: "Exportar backup do Em Dia",
      UTI: "public.json",
    });

    const parsed = JSON.parse(sharedContent) as { format: string };
    expect(parsed.format).toBe("emdia-backup");
    expect(new File(result.fileUri).exists).toBe(false);
  });

  it("exports backup file without sharing and ignores cleanup delete errors", async () => {
    mockIsSharingAvailable.mockResolvedValueOnce(false);
    const deleteSpy = jest
      .spyOn(File.prototype, "delete")
      .mockImplementationOnce(() => {
        throw new Error("unlink failed");
      });

    const result = await exportBackupFile(db);

    expect(result.shared).toBe(false);
    expect(mockShareAsync).not.toHaveBeenCalled();
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

  it("handles canceled/empty picker, reads and cleans cache copies, preserves non-cache URIs and enforces max size", async () => {
    mockGetDocumentAsync.mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    expect(await pickBackupFile()).toBeNull();

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
  });

  it("creates safety backups with retention of 3 latest files and propagates errors", async () => {
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
  });
});
