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
import { formatCurrency, HIDDEN_MONEY } from "../shared/utils/format";

const HIDE_VALUES_KEY = "hide_values";

type PrivacyContextValue = {
  isHidden: boolean;
  toggle: () => void;
};

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    void getStored(HIDE_VALUES_KEY).then((value) => {
      setIsHidden(value === "true");
    });
  }, []);

  const toggle = useCallback((): void => {
    setIsHidden((current) => {
      const next = !current;
      void setStored(HIDE_VALUES_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <PrivacyContext.Provider value={{ isHidden, toggle }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy(): PrivacyContextValue {
  const context = useContext(PrivacyContext);

  if (!context) {
    throw new Error("usePrivacy precisa estar dentro de PrivacyProvider");
  }

  return context;
}

export function useMoney(): (value: number) => string {
  const { isHidden } = usePrivacy();

  return useCallback(
    (value: number): string =>
      isHidden ? HIDDEN_MONEY : formatCurrency(value),
    [isHidden]
  );
}
