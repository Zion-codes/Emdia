import {
  createContext,
  type JSX,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getStored, setStored } from "../shared/storage";

const APPEARANCE_KEY = "appearance";

export type AppearancePreference = "system" | "light" | "dark";

type AppearanceContextValue = {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function toPreference(value: string | null): AppearancePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function AppearanceProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element | null {
  const [preference, setPreferenceState] =
    useState<AppearancePreference | null>(null);

  useEffect(() => {
    void getStored(APPEARANCE_KEY).then((value) => {
      setPreferenceState(toPreference(value));
    });
  }, []);

  const setPreference = useCallback((next: AppearancePreference): void => {
    setPreferenceState(next);
    void setStored(APPEARANCE_KEY, next);
  }, []);

  if (preference === null) {
    return null;
  }

  return (
    <AppearanceContext.Provider value={{ preference, setPreference }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);

  if (!context) {
    throw new Error("useAppearance precisa estar dentro de AppearanceProvider");
  }

  return context;
}

export function useAppearancePreference(): AppearancePreference {
  return useContext(AppearanceContext)?.preference ?? "system";
}
