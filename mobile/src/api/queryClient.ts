import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/src/api/http';

const MAX_RETRIES = 2;
const FIRST_CLIENT_ERROR_STATUS = 400;
const FIRST_SERVER_ERROR_STATUS = 500;

/** Retry connection and server failures, but not requests the server refused. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const wasRefused =
    error instanceof ApiError &&
    error.status >= FIRST_CLIENT_ERROR_STATUS &&
    error.status < FIRST_SERVER_ERROR_STATUS;
  return !wasRefused && failureCount < MAX_RETRIES;
}

/** Shared so signing out can drop one user's cached data before the next signs in. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});
