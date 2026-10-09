import { ApiError, requestJson, UNAUTHORIZED_STATUS } from '@/src/api/http';
import { refreshSession, useSession } from '@/src/auth/session';
import { apiUrl } from '@/src/config';

type RequestOptions = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

function withBearer(options: RequestOptions, accessToken: string): RequestInit {
  return {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
  };
}

/**
 * Calls an endpoint as the signed-in user. Access tokens are short-lived, so a
 * rejected one is refreshed and the request retried once.
 */
export async function authorizedRequest(
  path: string,
  options: RequestOptions = {}
): Promise<unknown> {
  const url = apiUrl(path);
  const accessToken = useSession.getState().accessToken ?? (await refreshSession());
  try {
    return await requestJson(url, withBearer(options, accessToken));
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== UNAUTHORIZED_STATUS) {
      throw error;
    }
  }
  // Another request may have refreshed while this one was in the air; if so,
  // use its token rather than rotating again.
  const currentAccessToken = useSession.getState().accessToken;
  const retryAccessToken =
    currentAccessToken !== null && currentAccessToken !== accessToken
      ? currentAccessToken
      : await refreshSession();
  return requestJson(url, withBearer(options, retryAccessToken));
}
