import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ApiError } from '@/src/api/http';
import { fetchProfile, type UserProfile } from '@/src/api/users';
import { useSession, type SessionStatus } from '@/src/auth/session';
import { useAppAccess } from '@/src/onboarding/useOnboarding';

jest.mock('@/src/api/users', () => ({
  ...jest.requireActual('@/src/api/users'),
  fetchProfile: jest.fn(),
}));

const fetchProfileMock = jest.mocked(fetchProfile);

const NEW_PROFILE: UserProfile = {
  id: 'user-1',
  name: null,
  email: null,
  timezone: 'UTC',
  unitPreference: 'lbs',
  onboardedAt: null,
};

async function renderAccess(status: SessionStatus) {
  useSession.setState({ status, accessToken: status === 'signedIn' ? 'access-token' : null });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return renderHook(() => useAppAccess(), { wrapper });
}

beforeEach(() => {
  fetchProfileMock.mockReset();
});

describe('useAppAccess', () => {
  test('is loading while the stored session is checked', async () => {
    // Act
    const { result } = await renderAccess('loading');

    // Assert
    expect(result.current).toBe('loading');
    expect(fetchProfileMock).not.toHaveBeenCalled();
  });

  test('sends a signed-out user to sign in without loading a profile', async () => {
    // Act
    const { result } = await renderAccess('signedOut');

    // Assert
    expect(result.current).toBe('signedOut');
    expect(fetchProfileMock).not.toHaveBeenCalled();
  });

  test('sends a user who has not onboarded to onboarding', async () => {
    // Arrange
    fetchProfileMock.mockResolvedValue(NEW_PROFILE);

    // Act
    const { result } = await renderAccess('signedIn');

    // Assert
    await waitFor(() => expect(result.current).toBe('onboarding'));
  });

  test('lets an onboarded user into the app', async () => {
    // Arrange
    fetchProfileMock.mockResolvedValue({ ...NEW_PROFILE, onboardedAt: '2026-10-14T15:00:00Z' });

    // Act
    const { result } = await renderAccess('signedIn');

    // Assert
    await waitFor(() => expect(result.current).toBe('ready'));
  });

  test('lets the user in when the profile cannot be loaded', async () => {
    // Arrange
    fetchProfileMock.mockRejectedValue(new ApiError(0, 'No connection'));

    // Act
    const { result } = await renderAccess('signedIn');

    // Assert
    await waitFor(() => expect(result.current).toBe('ready'));
  });
});
