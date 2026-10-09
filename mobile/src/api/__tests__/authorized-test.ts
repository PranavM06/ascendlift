import { authorizedRequest } from '@/src/api/authorized';
import { ApiError, requestJson } from '@/src/api/http';
import { refreshSession, useSession } from '@/src/auth/session';

jest.mock('@/src/api/http', () => ({
  ...jest.requireActual('@/src/api/http'),
  requestJson: jest.fn(),
}));
jest.mock('@/src/auth/session', () => ({
  refreshSession: jest.fn(),
  useSession: { getState: jest.fn() },
}));

const requestJsonMock = jest.mocked(requestJson);
const refreshSessionMock = jest.mocked(refreshSession);
const getStateMock = jest.mocked(useSession.getState);

function bearer(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } };
}

beforeEach(() => {
  jest.resetAllMocks();
  getStateMock.mockReturnValue({ status: 'signedIn', accessToken: 'access-1' });
});

test('sends the current access token as a bearer header', async () => {
  // Arrange
  requestJsonMock.mockResolvedValueOnce({ id: 'user-1' });

  // Act
  const data = await authorizedRequest('/users/me');

  // Assert
  expect(data).toEqual({ id: 'user-1' });
  expect(requestJsonMock).toHaveBeenCalledWith('http://api.test/users/me', bearer('access-1'));
  expect(refreshSessionMock).not.toHaveBeenCalled();
});

test('keeps the caller’s method, body and headers', async () => {
  // Arrange
  requestJsonMock.mockResolvedValueOnce({});

  // Act
  await authorizedRequest('/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{"unit_preference":"kg"}',
  });

  // Assert
  expect(requestJsonMock).toHaveBeenCalledWith('http://api.test/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer access-1' },
    body: '{"unit_preference":"kg"}',
  });
});

test('refreshes once and retries when the access token has expired', async () => {
  // Arrange
  requestJsonMock
    .mockRejectedValueOnce(new ApiError(401, 'Not authenticated'))
    .mockResolvedValueOnce({ id: 'user-1' });
  refreshSessionMock.mockResolvedValueOnce('access-2');

  // Act
  const data = await authorizedRequest('/users/me');

  // Assert
  expect(data).toEqual({ id: 'user-1' });
  expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  expect(requestJsonMock).toHaveBeenLastCalledWith('http://api.test/users/me', bearer('access-2'));
});

test('retries with the newer token when another request has already refreshed', async () => {
  // Arrange: by the time this request is rejected, the session holds a new token.
  getStateMock
    .mockReturnValueOnce({ status: 'signedIn', accessToken: 'access-1' })
    .mockReturnValue({ status: 'signedIn', accessToken: 'access-2' });
  requestJsonMock
    .mockRejectedValueOnce(new ApiError(401, 'Not authenticated'))
    .mockResolvedValueOnce({ id: 'user-1' });

  // Act
  await authorizedRequest('/users/me');

  // Assert
  expect(refreshSessionMock).not.toHaveBeenCalled();
  expect(requestJsonMock).toHaveBeenLastCalledWith('http://api.test/users/me', bearer('access-2'));
});

test('gives up after one retry instead of looping', async () => {
  // Arrange
  requestJsonMock.mockRejectedValue(new ApiError(401, 'Not authenticated'));
  refreshSessionMock.mockResolvedValueOnce('access-2');

  // Act
  const request = authorizedRequest('/users/me');

  // Assert
  await expect(request).rejects.toMatchObject({ status: 401 });
  expect(requestJsonMock).toHaveBeenCalledTimes(2);
});

test('does not refresh for errors other than an expired token', async () => {
  // Arrange
  requestJsonMock.mockRejectedValueOnce(new ApiError(503, 'Database unavailable'));

  // Act
  const request = authorizedRequest('/users/me');

  // Assert
  await expect(request).rejects.toMatchObject({ status: 503 });
  expect(refreshSessionMock).not.toHaveBeenCalled();
});

test('refreshes first when there is no access token in memory', async () => {
  // Arrange
  getStateMock.mockReturnValue({ status: 'signedIn', accessToken: null });
  refreshSessionMock.mockResolvedValueOnce('access-2');
  requestJsonMock.mockResolvedValueOnce({ id: 'user-1' });

  // Act
  await authorizedRequest('/users/me');

  // Assert
  expect(requestJsonMock).toHaveBeenCalledWith('http://api.test/users/me', bearer('access-2'));
});
