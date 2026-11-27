import { type JSX, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import {
  type Edge,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { createThemedStyles, useThemedStyles } from "../theme";
import { layout, tabBarSpace } from "../../theme/layout";

type ScreenContainerProps = {
  children: ReactNode;
  edges?: Edge[];
  scrollable?: boolean;
  includeTabBarSpace?: boolean;
  keyboardVerticalOffset?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  scrollable = false,
  includeTabBarSpace = true,
  keyboardVerticalOffset = 0,
  style,
  contentContainerStyle,
  testID,
}: ScreenContainerProps): JSX.Element {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(themedStyles);
  const bottomPadding =
    insets.bottom + (includeTabBarSpace ? tabBarSpace : layout.screenPadding);

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, style]}
      testID={testID}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardVerticalOffset}
        testID="screen-container-kav"
      >
        {scrollable ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            testID="screen-container-scroll"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomPadding },
              contentContainerStyle,
            ]}
          >
            {children}
          </ScrollView>
        ) : (
          <View
            style={[
              styles.content,
              { paddingBottom: bottomPadding },
              contentContainerStyle,
            ]}
          >
            {children}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.screenPadding,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: layout.screenPadding,
  },
}));
