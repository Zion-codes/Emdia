import { type JSX } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ICON_BOX, IconName, iconPaths } from "../icons/iconPaths";

export type { IconName };

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Icon({
  name,
  size = 24,
  color,
  style,
  testID,
}: IconProps): JSX.Element {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_BOX} ${ICON_BOX}`}
      style={style}
      testID={testID}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Path d={iconPaths[name]} fill={color} />
    </Svg>
  );
}
