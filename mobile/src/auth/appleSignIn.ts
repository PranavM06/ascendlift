import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

export type AppleCredential = {
  identityToken: string;
  /** The raw nonce; Apple only ever sees its hash. */
  nonce: string;
  /** Apple provides the name on the user's first sign-in only. */
  name: string | null;
};

const CANCELED_CODE = 'ERR_REQUEST_CANCELED';
const MAX_NAME_LENGTH = 100;

function isCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'code' in error && error.code === CANCELED_CODE
  );
}

function formatName(fullName: AppleAuthentication.AppleAuthenticationFullName | null): string | null {
  const parts = [fullName?.givenName, fullName?.familyName].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  const name = parts
    .map((part) => part.trim())
    .join(' ')
    .slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : null;
}

/**
 * Shows Apple's sign-in sheet. Resolves to null if the user cancels.
 *
 * Apple copies the hashed nonce into the identity token and the backend checks
 * it against the raw nonce, which ties the token to this sign-in attempt.
 */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if (isCancellation(error)) {
      return null;
    }
    throw error;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }
  return {
    identityToken: credential.identityToken,
    nonce: rawNonce,
    name: formatName(credential.fullName),
  };
}
