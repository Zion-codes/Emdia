import { type JSX } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabParamList, TabScreenProps } from "../../../navigation/types";
import { Text } from "../../../shared/components/Text";
import { createThemedStyles, useThemedStyles } from "../../../shared/theme";
import { layout, tabBarSpace } from "../../../theme/layout";
import { spacing, typography } from "../../../theme/tokens";

const SCREEN_CONTENT: Record<
  keyof TabParamList,
  { title: string; subtitle: string }
> = {
  Home: {
    title: "Início",
    subtitle: "Resumo financeiro em construção",
  },
  Transactions: {
    title: "Transações",
    subtitle: "Lançamentos e movimentações em construção",
  },
  Invoices: {
    title: "Faturas",
    subtitle: "Controle de cartões e faturas em construção",
  },
  More: {
    title: "Mais",
    subtitle: "Categorias, responsáveis e atalhos em construção",
  },
  Settings: {
    title: "Configurações",
    subtitle: "Preferências do aplicativo em construção",
  },
};

export function PlaceholderScreen({
  route,
}: TabScreenProps<keyof TabParamList>): JSX.Element {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(themedStyles);
  const content = SCREEN_CONTENT[route.name];

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top + layout.screenPadding,
          paddingBottom: insets.bottom + tabBarSpace,
        },
      ]}
    >
      <Text style={styles.title}>{content.title}</Text>
      <Text style={styles.subtitle}>{content.subtitle}</Text>
    </View>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.screenPadding,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.s12,
  },
  title: {
    ...typography.headline,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },
}));
