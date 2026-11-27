import {
  createContext,
  type JSX,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  authenticateWithBiometrics,
  type BiometricAuthResult,
  checkBiometricAvailability,
} from "../shared/biometrics";
import { getStored, setStored } from "../shared/storage";

const BIOMETRIC_LOCK_KEY = "biometric_lock_enabled";

type AppLockContextValue = {
  isInitialized: boolean;
  isEnabled: boolean;
  isAvailable: boolean;
  isLocked: boolean;
  isAuthenticating: boolean;
  errorMessage: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  unlock: () => Promise<boolean>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

function getAuthErrorMessage(
  result: Exclude<BiometricAuthResult, "authenticated">
): string {
  if (result === "cancelled") {
    return "Autenticação cancelada. Toque em Desbloquear para tentar novamente.";
  }

  if (result === "unavailable") {
    return "Biometria indisponível neste dispositivo.";
  }

  return "Não foi possível validar sua biometria. Tente novamente.";
}

export function AppLockProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEnabledRef = useRef(false);
  const isAuthenticatingRef = useRef(false);
  const wentToBackgroundRef = useRef(false);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (isAuthenticatingRef.current) {
      return false;
    }

    setErrorMessage(null);
    isAuthenticatingRef.current = true;
    setIsAuthenticating(true);

    try {
      const result = await authenticateWithBiometrics("Desbloquear o Em Dia");

      if (result === "authenticated") {
        setIsLocked(false);
        return true;
      }

      if (result === "unavailable") {
        await setStored(BIOMETRIC_LOCK_KEY, "false");
        setErrorMessage(null);
        setIsLocked(false);
        setIsEnabled(false);
        isEnabledRef.current = false;
        setIsAvailable(false);
        return true;
      }

      setErrorMessage(getAuthErrorMessage(result));
      return false;
    } finally {
      isAuthenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      getStored(BIOMETRIC_LOCK_KEY),
      checkBiometricAvailability(),
    ]).then(([stored, available]) => {
      if (cancelled) {
        return;
      }

      const enabled = stored === "true";
      setIsAvailable(available);
      setIsEnabled(enabled);
      isEnabledRef.current = enabled;

      if (enabled) {
        setIsLocked(true);
        setIsInitialized(true);
        void unlock();
      } else {
        setIsInitialized(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus): void => {
        if (nextState === "background") {
          if (isEnabledRef.current && !isAuthenticatingRef.current) {
            wentToBackgroundRef.current = true;
            setIsLocked(true);
          }
          return;
        }

        if (
          nextState === "active" &&
          wentToBackgroundRef.current &&
          isEnabledRef.current &&
          !isAuthenticatingRef.current
        ) {
          wentToBackgroundRef.current = false;
          setIsLocked(true);
          void unlock();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [unlock]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (isAuthenticatingRef.current) {
      return false;
    }

    setErrorMessage(null);
    isAuthenticatingRef.current = true;
    setIsAuthenticating(true);

    try {
      const available = await checkBiometricAvailability();
      setIsAvailable(available);

      if (!available) {
        setErrorMessage(
          "Biometria não disponível ou não cadastrada neste dispositivo."
        );
        return false;
      }

      const result = await authenticateWithBiometrics(
        "Confirmar biometria para ativar o bloqueio"
      );

      if (result === "authenticated") {
        await setStored(BIOMETRIC_LOCK_KEY, "true");
        setIsEnabled(true);
        isEnabledRef.current = true;
        return true;
      }

      setErrorMessage(getAuthErrorMessage(result));
      return false;
    } finally {
      isAuthenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<boolean> => {
    if (isAuthenticatingRef.current) {
      return false;
    }

    setErrorMessage(null);
    isAuthenticatingRef.current = true;
    setIsAuthenticating(true);

    try {
      const available = await checkBiometricAvailability();
      setIsAvailable(available);

      if (available) {
        const result = await authenticateWithBiometrics(
          "Confirmar biometria para desativar o bloqueio"
        );

        if (result !== "authenticated") {
          setErrorMessage(getAuthErrorMessage(result));
          return false;
        }
      }

      await setStored(BIOMETRIC_LOCK_KEY, "false");
      setIsEnabled(false);
      isEnabledRef.current = false;
      setIsLocked(false);
      return true;
    } finally {
      isAuthenticatingRef.current = false;
      setIsAuthenticating(false);
    }
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isInitialized,
        isEnabled,
        isAvailable,
        isLocked,
        isAuthenticating,
        errorMessage,
        enable,
        disable,
        unlock,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockContextValue {
  const context = useContext(AppLockContext);

  if (!context) {
    throw new Error("useAppLock precisa estar dentro de AppLockProvider");
  }

  return context;
}
