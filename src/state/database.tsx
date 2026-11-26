import * as SQLite from "expo-sqlite";
import {
  createContext,
  type JSX,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { View } from "react-native";
import { openDatabase } from "../database";
import { Text } from "../shared/components/Text";
import { createThemedStyles, useThemedStyles } from "../shared/theme";
import { layout } from "../theme/layout";
import { spacing, typography } from "../theme/tokens";

type DatabaseState =
  | { status: "loading" }
  | { status: "ready"; db: SQLite.SQLiteDatabase }
  | { status: "error" };

const DatabaseContext = createContext<SQLite.SQLiteDatabase | null>(null);

export function DatabaseProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element | null {
  const [state, setState] = useState<DatabaseState>({ status: "loading" });
  const styles = useThemedStyles(themedStyles);

  useEffect(() => {
    let cancelled = false;

    void openDatabase()
      .then((db) => {
        if (!cancelled) {
          setState({ status: "ready", db });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return null;
  }

  if (state.status === "error") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Erro ao abrir o banco de dados</Text>
        <Text style={styles.message}>
          Não foi possível inicializar os dados locais do aplicativo.
        </Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={state.db}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): SQLite.SQLiteDatabase {
  const db = useContext(DatabaseContext);

  if (!db) {
    throw new Error("useDatabase precisa estar dentro de DatabaseProvider");
  }

  return db;
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPadding,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.s12,
  },
  title: {
    ...typography.headline,
    color: colors.text,
    textAlign: "center",
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
}));
