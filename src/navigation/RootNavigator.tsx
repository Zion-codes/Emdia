import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { type JSX } from "react";
import { useColorSchemeName } from "../shared/theme";
import MainTabs from "./MainTabs";
import { navigationThemes } from "./theme";
import { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator(): JSX.Element {
  const scheme = useColorSchemeName();

  return (
    <NavigationContainer theme={navigationThemes[scheme]}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
