import { useWindowDimensions } from "react-native";

const WIDE_WIDTH = 900;

const WIDER_WIDTH = 1280;

export function useIsWide(): boolean {
  const { width } = useWindowDimensions();

  return width >= WIDE_WIDTH;
}

export function useColumns(): number {
  const { width } = useWindowDimensions();

  if (width >= WIDER_WIDTH) {
    return 3;
  }

  return width >= WIDE_WIDTH ? 2 : 1;
}
