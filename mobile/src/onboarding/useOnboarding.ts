import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { completeOnboarding } from '@/src/api/onboarding';
import { TARGETS_QUERY_KEY } from '@/src/api/targets';
import { fetchProfile, PROFILE_QUERY_KEY } from '@/src/api/users';
import { useSession } from '@/src/auth/session';

/**
 * Which part of the app the user may see: 'loading' until the session and
 * profile have been checked, then sign-in, onboarding or the app itself.
 */
export type AppAccess = 'loading' | 'signedOut' | 'onboarding' | 'ready';

export function useAppAccess(): AppAccess {
  const status = useSession((session) => session.status);
  const isSignedIn = status === 'signedIn';
  const profile = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    enabled: isSignedIn,
  });

  if (status === 'loading') {
    return 'loading';
  }
  if (!isSignedIn) {
    return 'signedOut';
  }
  if (profile.isPending) {
    return 'loading';
  }
  // A profile that failed to load still lets the user in: Home shows the error
  // with a retry, and onboarding follows once the profile loads.
  if (profile.isSuccess && profile.data.onboardedAt === null) {
    return 'onboarding';
  }
  return 'ready';
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeOnboarding,
    onSuccess: (profile) => {
      // The onboarded profile is what moves the app on to its tabs.
      queryClient.setQueryData(PROFILE_QUERY_KEY, profile);
      return queryClient.invalidateQueries({ queryKey: TARGETS_QUERY_KEY });
    },
  });
}
