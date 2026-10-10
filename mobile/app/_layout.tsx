import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { queryClient } from '@/src/api/queryClient';
import { restoreSession, useSession } from '@/src/auth/session';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Keep the splash screen up until the stored session has been checked, so a
// signed-in user never sees the sign-in screen flash by.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const status = useSession((session) => session.status);

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (status !== 'loading') {
      void SplashScreen.hideAsync();
    }
  }, [status]);

  if (status === 'loading') {
    return null;
  }

  const isSignedIn = status === 'signedIn';

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Protected guard={isSignedIn}>
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
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
