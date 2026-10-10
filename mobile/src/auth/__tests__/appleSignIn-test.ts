import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { requestAppleCredential } from '@/src/auth/appleSignIn';

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
  digestStringAsync: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

const signInAsyncMock = jest.mocked(AppleAuthentication.signInAsync);
const randomUuidMock = jest.mocked(Crypto.randomUUID);
const digestMock = jest.mocked(Crypto.digestStringAsync);

type AppleCredential = Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>;

function appleReturns(credential: Partial<AppleCredential>): void {
  signInAsyncMock.mockResolvedValueOnce(credential as AppleCredential);
}

function fullName(givenName: string | null, familyName: string | null) {
  return {
    givenName,
    familyName,
    middleName: null,
    namePrefix: null,
    nameSuffix: null,
    nickname: null,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  randomUuidMock.mockReturnValueOnce('uuid-one').mockReturnValueOnce('uuid-two');
  digestMock.mockResolvedValue('hashed-nonce');
});

test('gives Apple the hashed nonce and returns the raw one for the backend', async () => {
  // Arrange
  appleReturns({ identityToken: 'apple-jwt', fullName: null });

  // Act
  const credential = await requestAppleCredential();

  // Assert
  expect(digestMock).toHaveBeenCalledWith('SHA-256', 'uuid-oneuuid-two');
  expect(signInAsyncMock).toHaveBeenCalledWith({
    requestedScopes: [0, 1],
    nonce: 'hashed-nonce',
  });
  expect(credential).toEqual({
    identityToken: 'apple-jwt',
    nonce: 'uuid-oneuuid-two',
    name: null,
  });
});

test('joins the given and family name Apple provides on first sign-in', async () => {
  // Arrange
  appleReturns({ identityToken: 'apple-jwt', fullName: fullName('Pranav', 'Meka') });

  // Act
  const credential = await requestAppleCredential();

  // Assert
  expect(credential?.name).toBe('Pranav Meka');
});

test('uses whichever part of the name is present', async () => {
  // Arrange
  appleReturns({ identityToken: 'apple-jwt', fullName: fullName('Pranav', null) });

  // Act
  const credential = await requestAppleCredential();

  // Assert
  expect(credential?.name).toBe('Pranav');
});

test('returns null when the user cancels the Apple sheet', async () => {
  // Arrange
  signInAsyncMock.mockRejectedValueOnce(
    Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' })
  );

  // Act
  const credential = await requestAppleCredential();

  // Assert
  expect(credential).toBeNull();
});

test('rethrows Apple errors that are not a cancellation', async () => {
  // Arrange
  signInAsyncMock.mockRejectedValueOnce(
    Object.assign(new Error('failed'), { code: 'ERR_REQUEST_FAILED' })
  );

  // Act
  const request = requestAppleCredential();

  // Assert
  await expect(request).rejects.toThrow('failed');
});

test('fails clearly when Apple returns no identity token', async () => {
  // Arrange
  appleReturns({ identityToken: null, fullName: null });

  // Act
  const request = requestAppleCredential();

  // Assert
  await expect(request).rejects.toThrow('Apple did not return an identity token.');
});
