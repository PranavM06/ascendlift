import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import { fetchProfile, PROFILE_QUERY_KEY } from '@/src/api/users';
import { signOut } from '@/src/auth/session';

export default function HomeScreen() {
  const profile = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchProfile });
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      // Ending the session swaps this screen for the sign-in screen.
      await signOut();
    } catch {
      // The session has still ended on screen; only the keychain cleanup failed.
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <View style={styles.container}>
      {profile.isPending ? <ActivityIndicator /> : null}

      {profile.isError ? (
        <>
          <Text style={styles.error} accessibilityRole="alert">
            {userMessage(profile.error, "Couldn't load your profile.")}
          </Text>
          <Pressable style={styles.button} onPress={() => profile.refetch()}>
            <Text style={styles.buttonLabel}>Try again</Text>
          </Pressable>
        </>
      ) : null}

      {profile.isSuccess ? (
        <>
          <Text style={styles.title}>Welcome, {profile.data.name ?? 'lifter'}</Text>
          {profile.data.email ? <Text style={styles.detail}>{profile.data.email}</Text> : null}
          <Text style={styles.detail}>
            Units: {profile.data.unitPreference} · Time zone: {profile.data.timezone}
          </Text>
        </>
      ) : null}

      <Pressable
        style={styles.button}
        onPress={handleSignOut}
        disabled={isSigningOut}
        accessibilityRole="button">
        <Text style={styles.buttonLabel}>{isSigningOut ? 'Signing out…' : 'Sign out'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  detail: {
    fontSize: 16,
    opacity: 0.7,
  },
  error: {
    fontSize: 16,
    textAlign: 'center',
    color: '#c0392b',
  },
  button: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
