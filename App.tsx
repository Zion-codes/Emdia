import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { type JSX, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootNavigator from "./src/navigation/RootNavigator";
import { useColorSchemeName } from "./src/shared/theme";
import { AppearanceProvider } from "./src/state/appearance";
import { DatabaseProvider } from "./src/state/database";
import { PrivacyProvider } from "./src/state/privacy";
import { RecurrenceSync } from "./src/state/recurrence";

function AppStatusBar(): JSX.Element {
  const scheme = useColorSchemeName();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function App(): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <AppStatusBar />
        <DatabaseProvider>
          <QueryClientProvider client={queryClient}>
            <RecurrenceSync />
            <PrivacyProvider>
              <RootNavigator />
            </PrivacyProvider>
          </QueryClientProvider>
        </DatabaseProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
