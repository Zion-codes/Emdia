import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { type JSX, type ReactNode } from "react";
import { createTestDatabase } from "../../tests/helpers/inMemorySqlite";
import { getSelfOwner } from "../database/repositories/owners";
import { avatarPalette } from "../theme/colors";
import { useDatabase } from "./database";
import { ProfileProvider, useProfile } from "./profile";

jest.mock("./database", () => ({
  useDatabase: jest.fn(),
}));

const mockUseDatabase = jest.mocked(useDatabase);

describe("ProfileProvider", () => {
  let db: SQLite.SQLiteDatabase;
  let queryClient: QueryClient;

  beforeEach(async () => {
    db = await createTestDatabase();
    mockUseDatabase.mockReturnValue(db);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(async () => {
    await db.closeAsync();
    queryClient.clear();
  });

  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <ProfileProvider>{children}</ProfileProvider>
      </QueryClientProvider>
    );
  }

  it("loads fallback from self owner when storage is empty and updates name + SQLite + color", async () => {
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries");
    const { result } = await renderHook(() => useProfile(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    expect(result.current.profile).toEqual({
      name: "EU",
      avatarColor: avatarPalette[0],
    });

    await act(async () => {
      await result.current.updateProfile({
        name: "  Maria Clara  ",
        avatarColor: avatarPalette[3],
      });
    });

    expect(result.current.profile).toEqual({
      name: "Maria Clara",
      avatarColor: avatarPalette[3],
    });

    const selfOwner = await getSelfOwner(db);
    expect(selfOwner?.name).toBe("Maria Clara");
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    const saved = await Storage.getItemAsync("local_profile");
    expect(JSON.parse(saved!)).toEqual({
      name: "Maria Clara",
      avatarColor: avatarPalette[3],
    });

    await act(async () => {
      await result.current.updateProfile({ avatarColor: avatarPalette[5] });
    });

    expect(result.current.profile).toEqual({
      name: "Maria Clara",
      avatarColor: avatarPalette[5],
    });

    await act(async () => {
      await result.current.updateProfile({ avatarColor: "#INVALID" });
    });

    expect(result.current.profile.avatarColor).toBe(avatarPalette[5]);

    await expect(result.current.updateProfile({ name: "   " })).rejects.toThrow(
      "O nome do perfil é obrigatório."
    );
  });

  it("reconciles stored profile name with self owner and falls back cleanly on invalid JSON or missing self owner", async () => {
    await Storage.setItemAsync(
      "local_profile",
      JSON.stringify({ name: "Carlos", avatarColor: avatarPalette[2] })
    );

    const reconciled = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(reconciled.result.current.isLoaded).toBe(true);
    });
    expect(reconciled.result.current.profile).toEqual({
      name: "EU",
      avatarColor: avatarPalette[2],
    });
    const reconciledStored = await Storage.getItemAsync("local_profile");
    expect(JSON.parse(reconciledStored!)).toEqual({
      name: "EU",
      avatarColor: avatarPalette[2],
    });

    await db.runAsync("UPDATE owners SET name = 'Carlos' WHERE is_self = 1");
    await Storage.setItemAsync(
      "local_profile",
      JSON.stringify({ name: "Carlos", avatarColor: avatarPalette[2] })
    );

    const validStored = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(validStored.result.current.isLoaded).toBe(true);
    });
    expect(validStored.result.current.profile).toEqual({
      name: "Carlos",
      avatarColor: avatarPalette[2],
    });

    await Storage.setItemAsync(
      "local_profile",
      JSON.stringify({ name: "Carlos", avatarColor: "#INVALID" })
    );

    const first = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(first.result.current.isLoaded).toBe(true);
    });
    expect(first.result.current.profile).toEqual({
      name: "Carlos",
      avatarColor: avatarPalette[0],
    });

    await Storage.setItemAsync("local_profile", "{invalid-json");
    await db.runAsync(
      "UPDATE owners SET deleted_at = '2026-01-01T00:00:00.000Z'"
    );

    const second = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(second.result.current.isLoaded).toBe(true);
    });
    expect(second.result.current.profile).toEqual({
      name: "EU",
      avatarColor: avatarPalette[0],
    });

    await Storage.setItemAsync(
      "local_profile",
      JSON.stringify("not-an-object")
    );
    const third = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(third.result.current.isLoaded).toBe(true);
    });
    expect(third.result.current.profile.name).toBe("EU");

    await Storage.setItemAsync(
      "local_profile",
      JSON.stringify({ name: "   ", avatarColor: avatarPalette[1] })
    );
    const fourth = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(fourth.result.current.isLoaded).toBe(true);
    });
    expect(fourth.result.current.profile.name).toBe("EU");
  });

  it("refreshes profile from SQLite self owner and falls back on error", async () => {
    const { result } = await renderHook(() => useProfile(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoaded).toBe(true);
    });

    await db.runAsync(
      "UPDATE owners SET name = 'Helena Souza' WHERE is_self = 1"
    );

    await act(async () => {
      await result.current.refreshProfile();
    });

    expect(result.current.profile).toEqual({
      name: "Helena Souza",
      avatarColor: avatarPalette[0],
    });

    const stored = await Storage.getItemAsync("local_profile");
    expect(JSON.parse(stored!)).toEqual({
      name: "Helena Souza",
      avatarColor: avatarPalette[0],
    });

    const dbSpy = jest
      .spyOn(db, "getFirstAsync")
      .mockRejectedValueOnce(new Error("refresh failed"));

    await act(async () => {
      await result.current.refreshProfile();
    });

    expect(result.current.profile).toEqual({
      name: "EU",
      avatarColor: avatarPalette[0],
    });
    dbSpy.mockRestore();
  });

  it("handles storage/db rejection and unmount cancellation", async () => {
    const dbSpy = jest
      .spyOn(db, "getFirstAsync")
      .mockRejectedValueOnce(new Error("db read failed"));

    const first = await renderHook(() => useProfile(), { wrapper });
    await waitFor(() => {
      expect(first.result.current.isLoaded).toBe(true);
    });
    expect(first.result.current.profile.name).toBe("EU");

    dbSpy.mockRestore();

    let resolveStorage!: (value: string | null) => void;
    const getSpy = jest.spyOn(Storage, "getItemAsync").mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStorage = resolve;
      })
    );

    const second = await renderHook(() => useProfile(), { wrapper });
    await second.unmount();
    resolveStorage(null);
    await Promise.resolve();

    let rejectDb!: (error: Error) => void;
    jest.spyOn(db, "getFirstAsync").mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectDb = reject;
      })
    );

    const third = await renderHook(() => useProfile(), { wrapper });
    await third.unmount();
    rejectDb(new Error("late error"));
    await Promise.resolve();

    getSpy.mockRestore();

    await expect(renderHook(() => useProfile())).rejects.toThrow(
      "useProfile precisa estar dentro de ProfileProvider"
    );
  });
});
