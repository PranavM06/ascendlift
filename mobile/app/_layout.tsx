import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import 'react-native-reanimated';

import { View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { queryClient } from '@/src/api/queryClient';
import { restoreSession } from '@/src/auth/session';
import { useAppAccess, type AppAccess } from '@/src/onboarding/useOnboarding';

type SettledAccess = Exclude<AppAccess, 'loading'>;

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Keep the splash screen up until the stored session and the profile have been
// checked, so a signed-in user never sees the sign-in or onboarding screen
// flash by.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const access = useAppAccess();
  // The last access that was not 'loading'. While the profile loads after
  // signing in, the sign-in screen stays up rather than the navigator being
  // taken down and rebuilt.
  const [settledAccess, setSettledAccess] = useState<SettledAccess | null>(null);
  if (access !== 'loading' && access !== settledAccess) {
    setSettledAccess(access);
  }
  const shownAccess = access === 'loading' ? settledAccess : access;

  useEffect(() => {
    if (access !== 'loading') {
      void SplashScreen.hideAsync();
    }
  }, [access]);

  if (shownAccess === null) {
    // Only before the first check at launch, behind the splash screen.
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Protected guard={shownAccess === 'ready'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="workout" options={{ title: 'Workout' }} />
        <Stack.Screen
          name="exercise-picker"
          options={{ title: 'Add exercise', presentation: 'modal' }}
        />
        <Stack.Screen name="template-editor" options={{ title: 'Template' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="workout-detail" options={{ title: 'Workout' }} />
        <Stack.Screen
          name="new-exercise"
          options={{ title: 'New exercise', presentation: 'modal' }}
        />
        <Stack.Screen name="food-search" options={{ title: 'Add food' }} />
        <Stack.Screen name="food-entry" options={{ title: 'Food' }} />
      </Stack.Protected>
      <Stack.Protected guard={shownAccess === 'onboarding'}>
        <Stack.Screen
          name="onboarding"
          options={{ title: 'Welcome to AscendLift', gestureEnabled: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={shownAccess === 'signedOut'}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void restoreSession();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootNavigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
