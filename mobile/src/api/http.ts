/** Status used for requests that never reached the server. */
export const NETWORK_ERROR_STATUS = 0;
export const UNAUTHORIZED_STATUS = 401;
export const REQUEST_TIMEOUT_MS = 15_000;

const CONNECTION_MESSAGE = "Can't reach the server. Check your connection and try again.";
const UNEXPECTED_RESPONSE_MESSAGE = 'The server sent an unexpected response.';

/** A failed request whose message is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Every backend response is wrapped as `{ success, data, error }`. */
type Envelope = { success: boolean; data?: unknown; error?: unknown };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEnvelope(value: unknown): value is Envelope {
  return isRecord(value) && typeof value.success === 'boolean';
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  // fetch has no timeout of its own; without one a stalled connection would
  // leave the app waiting for about a minute.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(NETWORK_ERROR_STATUS, CONNECTION_MESSAGE);
  } finally {
    clearTimeout(timeout);
  }
}

async function readEnvelope(response: Response): Promise<Envelope> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(response.status, UNEXPECTED_RESPONSE_MESSAGE);
  }
  if (!isEnvelope(body)) {
    throw new ApiError(response.status, UNEXPECTED_RESPONSE_MESSAGE);
  }
  return body;
}

/** Sends a request and returns the envelope's data, or throws an ApiError. */
export async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await send(url, init);
  const envelope = await readEnvelope(response);
  if (!response.ok || !envelope.success) {
    const message =
      typeof envelope.error === 'string' ? envelope.error : UNEXPECTED_RESPONSE_MESSAGE;
    throw new ApiError(response.status, message);
  }
  return envelope.data;
}

type JsonRequest<Method extends string> = {
  method: Method;
  headers: Record<string, string>;
  body: string;
};

function jsonRequest<Method extends string>(method: Method, body: unknown): JsonRequest<Method> {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function jsonPost(body: unknown): JsonRequest<'POST'> {
  return jsonRequest('POST', body);
}

export function jsonPatch(body: unknown): JsonRequest<'PATCH'> {
  return jsonRequest('PATCH', body);
}

export function unexpectedResponse(): ApiError {
  return new ApiError(NETWORK_ERROR_STATUS, UNEXPECTED_RESPONSE_MESSAGE);
}

/** The text to show for a caught error: the server's message when there is one. */
export function userMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
