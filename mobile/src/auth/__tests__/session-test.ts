import { ApiError } from '@/src/api/http';
import { queryClient } from '@/src/api/queryClient';
import { requestAppleCredential } from '@/src/auth/appleSignIn';
import { exchangeAppleCredential, exchangeRefreshToken, revokeRefreshToken } from '@/src/auth/authApi';
import { refreshSession, restoreSession, signIn, signOut, useSession } from '@/src/auth/session';
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from '@/src/auth/tokenStorage';

jest.mock('@/src/auth/appleSignIn');
jest.mock('@/src/auth/authApi');
jest.mock('@/src/auth/tokenStorage');

const requestAppleCredentialMock = jest.mocked(requestAppleCredential);
const exchangeAppleCredentialMock = jest.mocked(exchangeAppleCredential);
const exchangeRefreshTokenMock = jest.mocked(exchangeRefreshToken);
const revokeRefreshTokenMock = jest.mocked(revokeRefreshToken);
const loadRefreshTokenMock = jest.mocked(loadRefreshToken);
const saveRefreshTokenMock = jest.mocked(saveRefreshToken);
const clearRefreshTokenMock = jest.mocked(clearRefreshToken);

const SIGNED_OUT = { status: 'signedOut', accessToken: null } as const;
const NEW_PAIR = { accessToken: 'access-2', refreshToken: 'refresh-2' };
const APPLE_CREDENTIAL = { identityToken: 'apple-jwt', nonce: 'raw-nonce', name: 'Pranav' };

type TokenPair = typeof NEW_PAIR;

/** A refresh request the test settles by hand, to control when it finishes. */
function slowRefresh() {
  let resolve!: (tokens: TokenPair) => void;
  let reject!: (error: Error) => void;
  const response = new Promise<TokenPair>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  exchangeRefreshTokenMock.mockReturnValueOnce(response);
  return { resolve, reject };
}

beforeEach(() => {
  jest.resetAllMocks();
  useSession.setState({ status: 'loading', accessToken: null });
});

describe('restoreSession', () => {
  test('signs out when no refresh token is stored', async () => {
    // Arrange
    loadRefreshTokenMock.mockResolvedValue(null);

    // Act
    await restoreSession();

    // Assert
    expect(useSession.getState()).toEqual(SIGNED_OUT);
    expect(exchangeRefreshTokenMock).not.toHaveBeenCalled();
  });

  test('signs in and stores the rotated refresh token', async () => {
    // Arrange
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockResolvedValue(NEW_PAIR);

    // Act
    await restoreSession();

    // Assert
    expect(exchangeRefreshTokenMock).toHaveBeenCalledWith('refresh-1');
    expect(saveRefreshTokenMock).toHaveBeenCalledWith('refresh-2');
    expect(useSession.getState()).toEqual({ status: 'signedIn', accessToken: 'access-2' });
  });

  test('forgets a refresh token the server rejects', async () => {
    // Arrange
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockRejectedValue(new ApiError(401, 'Invalid or expired refresh token'));

    // Act
    await restoreSession();

    // Assert
    expect(clearRefreshTokenMock).toHaveBeenCalled();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('keeps the refresh token when the server cannot be reached', async () => {
    // Arrange
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockRejectedValue(new ApiError(0, "Can't reach the server."));

    // Act
    await restoreSession();

    // Assert
    expect(clearRefreshTokenMock).not.toHaveBeenCalled();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });
});

describe('refreshSession', () => {
  test('shares one request between simultaneous callers', async () => {
    // Arrange: a refresh token works once, so two requests would sign the user out.
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockResolvedValue(NEW_PAIR);

    // Act
    const tokens = await Promise.all([refreshSession(), refreshSession()]);

    // Assert
    expect(tokens).toEqual(['access-2', 'access-2']);
    expect(exchangeRefreshTokenMock).toHaveBeenCalledTimes(1);
  });

  test('starts a new request once the previous one has finished', async () => {
    // Arrange
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockResolvedValue(NEW_PAIR);

    // Act
    await refreshSession();
    await refreshSession();

    // Assert
    expect(exchangeRefreshTokenMock).toHaveBeenCalledTimes(2);
  });

  test('rejects and signs out when the refresh token is rejected', async () => {
    // Arrange
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockRejectedValue(new ApiError(401, 'Invalid or expired refresh token'));

    // Act
    const refresh = refreshSession();

    // Assert
    await expect(refresh).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('ends the session if the rotated token cannot be saved', async () => {
    // Arrange: the old token is now used up, so keeping it would trip reuse detection.
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    exchangeRefreshTokenMock.mockResolvedValue(NEW_PAIR);
    saveRefreshTokenMock.mockRejectedValue(new Error('keychain unavailable'));

    // Act
    const refresh = refreshSession();

    // Assert
    await expect(refresh).rejects.toThrow('keychain unavailable');
    expect(clearRefreshTokenMock).toHaveBeenCalled();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('does not sign the user back in when it finishes after a sign-out', async () => {
    // Arrange
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    const server = slowRefresh();
    const refresh = refreshSession();

    // Act
    await signOut();
    server.resolve(NEW_PAIR);

    // Assert
    await expect(refresh).rejects.toMatchObject({ status: 401 });
    expect(saveRefreshTokenMock).not.toHaveBeenCalled();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('does not end a newer session when an older refresh is rejected late', async () => {
    // Arrange
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    const server = slowRefresh();
    const staleRefresh = refreshSession();
    requestAppleCredentialMock.mockResolvedValue(APPLE_CREDENTIAL);
    exchangeAppleCredentialMock.mockResolvedValue({
      accessToken: 'access-3',
      refreshToken: 'refresh-3',
    });

    // Act
    await signIn();
    server.reject(new ApiError(401, 'Invalid or expired refresh token'));

    // Assert
    await expect(staleRefresh).rejects.toMatchObject({ status: 401 });
    expect(clearRefreshTokenMock).not.toHaveBeenCalled();
    expect(useSession.getState()).toEqual({ status: 'signedIn', accessToken: 'access-3' });
  });
});

describe('signIn', () => {
  test('exchanges the Apple credential and starts the session', async () => {
    // Arrange
    const credential = { identityToken: 'apple-jwt', nonce: 'raw-nonce', name: 'Pranav' };
    requestAppleCredentialMock.mockResolvedValue(credential);
    exchangeAppleCredentialMock.mockResolvedValue(NEW_PAIR);

    // Act
    const signedIn = await signIn();

    // Assert
    expect(signedIn).toBe(true);
    expect(exchangeAppleCredentialMock).toHaveBeenCalledWith(credential);
    expect(saveRefreshTokenMock).toHaveBeenCalledWith('refresh-2');
    expect(useSession.getState()).toEqual({ status: 'signedIn', accessToken: 'access-2' });
  });

  test('does nothing when the user cancels', async () => {
    // Arrange
    useSession.setState(SIGNED_OUT);
    requestAppleCredentialMock.mockResolvedValue(null);

    // Act
    const signedIn = await signIn();

    // Assert
    expect(signedIn).toBe(false);
    expect(exchangeAppleCredentialMock).not.toHaveBeenCalled();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });
});

describe('signOut', () => {
  test('revokes the refresh token, forgets it, and clears cached data', async () => {
    // Arrange
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    queryClient.setQueryData(['profile'], { name: 'Pranav' });

    // Act
    await signOut();

    // Assert
    expect(revokeRefreshTokenMock).toHaveBeenCalledWith('refresh-1');
    expect(clearRefreshTokenMock).toHaveBeenCalled();
    expect(queryClient.getQueryData(['profile'])).toBeUndefined();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('does not wait for the server before signing out on this device', async () => {
    // Arrange: a request that never completes, as on a stalled connection.
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    revokeRefreshTokenMock.mockReturnValue(new Promise<void>(() => undefined));

    // Act
    await signOut();

    // Assert
    expect(revokeRefreshTokenMock).toHaveBeenCalledWith('refresh-1');
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('signs out on screen even if the stored token cannot be deleted', async () => {
    // Arrange
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    clearRefreshTokenMock.mockRejectedValue(new Error('keychain unavailable'));

    // Act
    const signingOut = signOut();

    // Assert
    await expect(signingOut).rejects.toThrow('keychain unavailable');
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });

  test('still signs out on this device when the server cannot be reached', async () => {
    // Arrange
    useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
    loadRefreshTokenMock.mockResolvedValue('refresh-1');
    revokeRefreshTokenMock.mockRejectedValue(new ApiError(0, "Can't reach the server."));

    // Act
    await signOut();

    // Assert
    expect(clearRefreshTokenMock).toHaveBeenCalled();
    expect(useSession.getState()).toEqual(SIGNED_OUT);
  });
});
