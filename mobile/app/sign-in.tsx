import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { userMessage } from '@/src/api/http';
import { signIn } from '@/src/auth/session';

const APPLE_BUTTON_CORNER_RADIUS = 8;

export default function SignInScreen() {
  const colorScheme = useColorScheme();
  // null until the device has been asked whether it supports Sign in with Apple.
  const [isAppleAvailable, setIsAppleAvailable] = useState<boolean | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const signInStarted = useRef(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setIsAppleAvailable)
      .catch(() => setIsAppleAvailable(false));
  }, []);

  async function handleSignIn() {
    // State updates land after this handler returns, so a ref is what stops a
    // quick second tap from starting a second sign-in.
    if (signInStarted.current) {
      return;
    }
    signInStarted.current = true;
    setErrorMessage(null);
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (error) {
      setErrorMessage(userMessage(error, 'Sign in failed. Please try again.'));
    } finally {
      signInStarted.current = false;
      setIsSigningIn(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AscendLift</Text>
      <Text style={styles.tagline}>Track your lifting and your macros.</Text>

      <View style={styles.action}>
        {isSigningIn ? <ActivityIndicator /> : null}
        {!isSigningIn && isAppleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              colorScheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={APPLE_BUTTON_CORNER_RADIUS}
            style={styles.appleButton}
            onPress={handleSignIn}
          />
        ) : null}
        {isAppleAvailable === false ? (
          <Text style={styles.notice}>Sign in with Apple needs an iPhone or iPad.</Text>
        ) : null}
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
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
    fontSize: 34,
    fontWeight: '700',
  },
  tagline: {
    fontSize: 16,
    opacity: 0.7,
  },
  action: {
    height: 48,
    marginTop: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  notice: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
  },
  error: {
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
    color: '#c0392b',
  },
});
