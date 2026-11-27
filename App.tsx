import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { type JSX, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import RootNavigator from "./src/navigation/RootNavigator";
import { LockScreen } from "./src/shared/components/LockScreen";
import {
  createThemedStyles,
  useColorSchemeName,
  useThemedStyles,
} from "./src/shared/theme";
import { AppearanceProvider } from "./src/state/appearance";
import { AppLockProvider, useAppLock } from "./src/state/appLock";
import { DatabaseProvider } from "./src/state/database";
import { PrivacyProvider } from "./src/state/privacy";
import { ProfileProvider } from "./src/state/profile";
import { RecurrenceSync } from "./src/state/recurrence";

function AppStatusBar(): JSX.Element {
  const scheme = useColorSchemeName();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

function AppGate({ queryClient }: { queryClient: QueryClient }): JSX.Element {
  const { isInitialized } = useAppLock();
  const styles = useThemedStyles(themedStyles);

  if (!isInitialized) {
    return <View style={styles.splashGuard} testID="app-lock-initializing" />;
  }

  return (
    <>
      <DatabaseProvider>
        <QueryClientProvider client={queryClient}>
          <RecurrenceSync />
          <PrivacyProvider>
            <ProfileProvider>
              <RootNavigator />
            </ProfileProvider>
          </PrivacyProvider>
        </QueryClientProvider>
      </DatabaseProvider>
      <LockScreen />
    </>
  );
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
        <AppLockProvider>
          <AppGate queryClient={queryClient} />
        </AppLockProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

const themedStyles = createThemedStyles((colors) => ({
  splashGuard: {
    flex: 1,
    backgroundColor: colors.background,
  },
}));
