import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { ensureRecurringInstallments } from "../database";
import { useDatabase } from "./database";

export function RecurrenceSync(): null {
  const db = useDatabase();
  const queryClient = useQueryClient();
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    mountedRef.current = true;

    const runSync = async (): Promise<void> => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        const result = await ensureRecurringInstallments(db);
        if (
          mountedRef.current &&
          (result.createdInstallmentsCount > 0 ||
            result.deactivatedTransactionsCount > 0)
        ) {
          void queryClient.invalidateQueries();
        }
      } catch {
        return;
      } finally {
        inFlightRef.current = false;
      }
    };

    void runSync();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const previousAppState = appStateRef.current;
      appStateRef.current = nextAppState;

      if (previousAppState !== "active" && nextAppState === "active") {
        void runSync();
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [db, queryClient]);

  return null;
}
