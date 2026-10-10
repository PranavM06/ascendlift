import { create } from 'zustand';

import { ApiError, UNAUTHORIZED_STATUS } from '@/src/api/http';
import { queryClient } from '@/src/api/queryClient';
import { requestAppleCredential } from '@/src/auth/appleSignIn';
import {
  exchangeAppleCredential,
  exchangeRefreshToken,
  revokeRefreshToken,
  type TokenPair,
} from '@/src/auth/authApi';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from '@/src/auth/tokenStorage';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

type SessionState = {
  /** 'loading' until the stored session has been checked at launch. */
  status: SessionStatus;
  accessToken: string | null;
};

export const useSession = create<SessionState>(() => ({ status: 'loading', accessToken: null }));

// Counts sign-ins and sign-outs. A refresh remembers the number it started
// under and discards its result if the number has moved on, so a slow refresh
// can neither undo a sign-out nor end a session that began after it.
let sessionGeneration = 0;
let refreshInFlight: Promise<string> | null = null;

function beginNewGeneration(): void {
  sessionGeneration += 1;
  refreshInFlight = null;
}

function signedOutError(): ApiError {
  return new ApiError(UNAUTHORIZED_STATUS, 'You have been signed out.');
}

function markSignedOut(): void {
  useSession.setState({ status: 'signedOut', accessToken: null });
}

async function startSession(tokens: TokenPair): Promise<void> {
  await saveRefreshToken(tokens.refreshToken);
  useSession.setState({ status: 'signedIn', accessToken: tokens.accessToken });
}

async function endSession(): Promise<void> {
  beginNewGeneration();
  try {
    await clearRefreshToken();
  } finally {
    // Sign out on screen even if the keychain refuses the delete.
    queryClient.clear();
    markSignedOut();
  }
}

async function rotateTokens(): Promise<string> {
  const generation = sessionGeneration;
  const refreshToken = await loadRefreshToken();
  if (refreshToken === null) {
    await endSession();
    throw signedOutError();
  }

  let tokens: TokenPair;
  try {
    tokens = await exchangeRefreshToken(refreshToken);
  } catch (error) {
    const wasRejected = error instanceof ApiError && error.status === UNAUTHORIZED_STATUS;
    if (wasRejected && generation === sessionGeneration) {
      await endSession();
    }
    throw error;
  }
  if (generation !== sessionGeneration) {
    throw signedOutError();
  }

  try {
    await startSession(tokens);
  } catch (error) {
    // The old token has been used up and the new one was not stored, so
    // nothing on the device can refresh this session any more.
    await endSession();
    throw error;
  }
  return tokens.accessToken;
}

/**
 * Gets a new access token. A refresh token works only once, so callers that
 * arrive while a refresh is under way share its result instead of starting
 * another, which the server would treat as a stolen token.
 */
export function refreshSession(): Promise<string> {
  if (refreshInFlight === null) {
    const refresh = rotateTokens().finally(() => {
      if (refreshInFlight === refresh) {
        refreshInFlight = null;
      }
    });
    refreshInFlight = refresh;
  }
  return refreshInFlight;
}

/** Called once at launch: signs in from the stored refresh token if there is one. */
export async function restoreSession(): Promise<void> {
  try {
    if ((await loadRefreshToken()) === null) {
      markSignedOut();
      return;
    }
    await refreshSession();
  } catch {
    // A rejected token has already ended the session. Any other failure, such
    // as no connection, leaves the stored token in place for the next launch.
    if (useSession.getState().status === 'loading') {
      markSignedOut();
    }
  }
}

/** Resolves to false if the user cancelled Apple's sheet. */
export async function signIn(): Promise<boolean> {
  const credential = await requestAppleCredential();
  if (credential === null) {
    return false;
  }
  const tokens = await exchangeAppleCredential(credential);
  beginNewGeneration();
  await startSession(tokens);
  return true;
}

async function revokeOnServer(refreshToken: string): Promise<void> {
  try {
    await revokeRefreshToken(refreshToken);
  } catch {
    // Best effort. The token is already gone from this device and expires on
    // the server by itself.
  }
}

/** Signs out on this device at once; the server is told in the background. */
export async function signOut(): Promise<void> {
  const refreshToken = await loadRefreshToken().catch(() => null);
  try {
    await endSession();
  } finally {
    if (refreshToken !== null) {
      void revokeOnServer(refreshToken);
    }
  }
}
