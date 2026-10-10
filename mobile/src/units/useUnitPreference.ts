import { useQuery } from '@tanstack/react-query';

import { fetchProfile, PROFILE_QUERY_KEY, type UnitPreference } from '@/src/api/users';

// The same default a new account gets on the server.
const DEFAULT_UNIT: UnitPreference = 'lbs';

/** The unit to show weights in; the default until the profile has loaded. */
export function useUnitPreference(): UnitPreference {
  const profile = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchProfile });
  return profile.data?.unitPreference ?? DEFAULT_UNIT;
}
