import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

export function useAndroidBackHandler(
  handler: () => boolean,
  enabled = true
): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (Platform.OS !== "android" || !enabled) {
      return;
    }

    const onBackPress = (): boolean => handlerRef.current();
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress
    );

    return () => {
      subscription.remove();
    };
  }, [enabled]);
}
