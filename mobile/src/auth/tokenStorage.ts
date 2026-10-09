import * as SecureStore from 'expo-secure-store';

// Only the refresh token is kept on the device, in the iOS keychain. The access
// token lives in memory and is re-issued from this one at launch.
const REFRESH_TOKEN_KEY = 'ascendlift.refresh_token';

export function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export function saveRefreshToken(refreshToken: string): Promise<void> {
  return SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
