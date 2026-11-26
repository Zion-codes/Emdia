import {
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SQLite from "expo-sqlite";
import { type JSX } from "react";
import { Text } from "react-native";
import { openDatabase } from "../database";
import { DatabaseProvider, useDatabase } from "./database";

jest.mock("../database", () => ({
  openDatabase: jest.fn(),
}));

const mockOpenDatabase = jest.mocked(openDatabase);

function Consumer(): JSX.Element {
  const db = useDatabase();
  return <Text testID="db-ready">{typeof db.execAsync}</Text>;
}

describe("DatabaseProvider", () => {
  it("renders null while loading and renders children when database is ready", async () => {
    let resolveDb!: (db: SQLite.SQLiteDatabase) => void;
    const pendingDb = new Promise<SQLite.SQLiteDatabase>((resolve) => {
      resolveDb = resolve;
    });

    mockOpenDatabase.mockReturnValueOnce(pendingDb);

    await render(
      <DatabaseProvider>
        <Consumer />
      </DatabaseProvider>
    );

    expect(screen.queryByTestId("db-ready")).toBeNull();

    resolveDb({
      execAsync: jest.fn(),
    } as unknown as SQLite.SQLiteDatabase);

    await waitFor(() => {
      expect(screen.getByTestId("db-ready").props.children).toBe("function");
    });
  });

  it("renders pt-BR error fallback when initialization fails", async () => {
    mockOpenDatabase.mockRejectedValueOnce(new Error("init failed"));

    await render(
      <DatabaseProvider>
        <Consumer />
      </DatabaseProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Erro ao abrir o banco de dados")).toBeTruthy();
      expect(
        screen.getByText(
          "Não foi possível inicializar os dados locais do aplicativo."
        )
      ).toBeTruthy();
    });
  });

  it("ignores resolution and rejection after unmount", async () => {
    let resolveDb!: (db: SQLite.SQLiteDatabase) => void;
    const pendingResolve = new Promise<SQLite.SQLiteDatabase>((resolve) => {
      resolveDb = resolve;
    });

    mockOpenDatabase.mockReturnValueOnce(pendingResolve);

    const firstRender = await render(
      <DatabaseProvider>
        <Consumer />
      </DatabaseProvider>
    );

    await firstRender.unmount();

    resolveDb({
      execAsync: jest.fn(),
    } as unknown as SQLite.SQLiteDatabase);
    await pendingResolve;

    let rejectDb!: (error: Error) => void;
    const pendingReject = new Promise<SQLite.SQLiteDatabase>((_, reject) => {
      rejectDb = reject;
    });
    mockOpenDatabase.mockReturnValueOnce(pendingReject);

    const secondRender = await render(
      <DatabaseProvider>
        <Consumer />
      </DatabaseProvider>
    );

    await secondRender.unmount();

    rejectDb(new Error("late failure"));
    await pendingReject.catch(() => undefined);
  });

  it("throws when useDatabase is used outside DatabaseProvider", async () => {
    await expect(renderHook(() => useDatabase())).rejects.toThrow(
      "useDatabase precisa estar dentro de DatabaseProvider"
    );
  });
});
