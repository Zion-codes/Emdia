import { ComponentProps, type JSX } from "react";
import { Text as NativeText, StyleSheet } from "react-native";
import { fontFamily } from "../../theme/tokens";

type TextProps = ComponentProps<typeof NativeText>;

export function Text({ selectable, style, ...props }: TextProps): JSX.Element {
  return (
    <NativeText
      {...props}
      style={[
        styles.text,
        selectable ? styles.selectable : styles.unselectable,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: fontFamily.text,
  },
  selectable: {
    userSelect: "text",
  },
  unselectable: {
    userSelect: "none",
  },
});
