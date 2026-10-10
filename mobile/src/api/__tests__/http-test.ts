import { ApiError, jsonPost, REQUEST_TIMEOUT_MS, requestJson } from '@/src/api/http';

const fetchMock = jest.fn();

function serverReplies(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch =fetchMock as unknown as typeof fetch;
});

test('returns the data from a successful envelope', async () => {
  // Arrange
  serverReplies(200, { success: true, data: { status: 'ok' }, error: null });

  // Act
  const data = await requestJson('http://api.test/health');

  // Assert
  expect(data).toEqual({ status: 'ok' });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://api.test/health',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
});

test('gives up with a connection problem when the server does not answer in time', async () => {
  // Arrange: a server that accepts the request and then never replies.
  jest.useFakeTimers();
  fetchMock.mockImplementationOnce(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      })
  );

  // Act
  const request = requestJson('http://api.test/health');
  const outcome = expect(request).rejects.toMatchObject({
    status: 0,
    message: "Can't reach the server. Check your connection and try again.",
  });
  jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);

  // Assert
  await outcome;
  jest.useRealTimers();
});

test('passes the caller’s method, headers and body through', async () => {
  // Arrange
  serverReplies(200, { success: true, data: null, error: null });

  // Act
  await requestJson('http://api.test/auth/logout', jsonPost({ refresh_token: 'abc' }));

  // Assert
  expect(fetchMock).toHaveBeenCalledWith(
    'http://api.test/auth/logout',
    expect.objectContaining({ method: 'POST', body: '{"refresh_token":"abc"}' })
  );
});

test('throws the server message and status when the envelope reports failure', async () => {
  // Arrange
  serverReplies(401, { success: false, data: null, error: 'Not authenticated' });

  // Act
  const request = requestJson('http://api.test/users/me');

  // Assert
  await expect(request).rejects.toMatchObject({
    name: 'ApiError',
    status: 401,
    message: 'Not authenticated',
  });
});

test('reports a connection problem when the request cannot be sent', async () => {
  // Arrange
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

  // Act
  const request = requestJson('http://api.test/health');

  // Assert
  await expect(request).rejects.toMatchObject({
    status: 0,
    message: "Can't reach the server. Check your connection and try again.",
  });
});

test('reports an unexpected response when the body is not an envelope', async () => {
  // Arrange
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 502,
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
  });

  // Act
  const request = requestJson('http://api.test/health');

  // Assert
  await expect(request).rejects.toMatchObject({
    status: 502,
    message: 'The server sent an unexpected response.',
  });
});

test('api errors can be told apart from other errors', async () => {
  // Arrange
  serverReplies(503, { success: false, data: null, error: 'Database unavailable' });

  // Act
  const error = await requestJson('http://api.test/health').catch((caught) => caught);

  // Assert
  expect(error).toBeInstanceOf(ApiError);
});

test('jsonPost builds a JSON POST request', () => {
  // Act
  const init = jsonPost({ refresh_token: 'abc' });

  // Assert
  expect(init).toEqual({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"refresh_token":"abc"}',
  });
});
