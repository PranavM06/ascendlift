import { isRecord, jsonPost, requestJson, unexpectedResponse } from '@/src/api/http';
import type { AppleCredential } from '@/src/auth/appleSignIn';
import { apiUrl } from '@/src/config';

export type TokenPair = { accessToken: string; refreshToken: string };

function toTokenPair(data: unknown): TokenPair {
  if (
    !isRecord(data) ||
    typeof data.access_token !== 'string' ||
    typeof data.refresh_token !== 'string'
  ) {
    throw unexpectedResponse();
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

export async function exchangeAppleCredential(credential: AppleCredential): Promise<TokenPair> {
  const body = {
    identity_token: credential.identityToken,
    nonce: credential.nonce,
    name: credential.name,
  };
  return toTokenPair(await requestJson(apiUrl('/auth/apple'), jsonPost(body)));
}

export async function exchangeRefreshToken(refreshToken: string): Promise<TokenPair> {
  const body = { refresh_token: refreshToken };
  return toTokenPair(await requestJson(apiUrl('/auth/refresh'), jsonPost(body)));
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await requestJson(apiUrl('/auth/logout'), jsonPost({ refresh_token: refreshToken }));
}
