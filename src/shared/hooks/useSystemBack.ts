import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";

export function useSystemBack(isActive: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onBackRef.current();

        return true;
      }
    );

    return () => subscription.remove();
  }, [isActive]);
}
