import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { type JSX } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeScreen } from "../modules/home/screens/HomeScreen";
import { InvoicesScreen } from "../modules/invoices/screens/InvoicesScreen";
import { MoreScreen } from "../modules/more/screens/MoreScreen";
import { SettingsScreen } from "../modules/settings/screens/SettingsScreen";
import { TransactionsScreen } from "../modules/transactions/screens/TransactionsScreen";
import { Icon, IconName } from "../shared/components/Icon";
import {
  createThemedStyles,
  useColors,
  useThemedStyles,
} from "../shared/theme";
import { layout } from "../theme/layout";
import { fontFamily, typography } from "../theme/tokens";
import { TabParamList } from "./types";

const tabIcons: Record<
  keyof TabParamList,
  { focused: IconName; unfocused: IconName }
> = {
  Home: { focused: "home", unfocused: "home-outline" },
  Transactions: { focused: "receipt", unfocused: "receipt-outline" },
  Invoices: { focused: "card", unfocused: "card-outline" },
  More: { focused: "grid", unfocused: "grid-outline" },
  Settings: { focused: "options-outline", unfocused: "options-outline" },
};

const tabWeights: Record<keyof TabParamList, number> = {
  Home: 1.2,
  Transactions: 1.6,
  Invoices: 1.2,
  More: 1,
  Settings: 1.4,
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function MainTabs(): JSX.Element {
  const colors = useColors();
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      backBehavior="firstRoute"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.placeholder,
        tabBarStyle: [
          styles.tabBar,
          { bottom: layout.tabBarBottomMargin + insets.bottom },
        ],
        tabBarItemStyle: [styles.tabBarItem, { flex: tabWeights[route.name] }],
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarIcon: ({ focused, color, size }) => (
          <Icon
            name={
              focused
                ? tabIcons[route.name].focused
                : tabIcons[route.name].unfocused
            }
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Início" }}
      />
      <Tab.Screen
        name="Transactions"
        component={TransactionsScreen}
        options={{ title: "Transações" }}
      />
      <Tab.Screen
        name="Invoices"
        component={InvoicesScreen}
        options={{ title: "Faturas" }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: "Mais" }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Configurações" }}
      />
    </Tab.Navigator>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  tabBar: {
    position: "absolute",
    left: layout.tabBarSideMargin,
    right: layout.tabBarSideMargin,
    maxWidth: layout.maxContentWidth,
    marginHorizontal: "auto",
    bottom: layout.tabBarBottomMargin,
    height: layout.tabBarHeight,
    paddingTop: 0,
    paddingBottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    elevation: 0,
  },
  tabBarItem: {
    paddingVertical: 10,
  },
  tabBarLabel: {
    ...typography.tabLabel,
    fontFamily: fontFamily.text,
  },
}));
