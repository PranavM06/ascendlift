import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, unexpectedResponse } from '@/src/api/http';

export type UnitPreference = 'lbs' | 'kg';

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  timezone: string;
  unitPreference: UnitPreference;
  /** When onboarding was finished; null until then. */
  onboardedAt: string | null;
};

export const PROFILE_QUERY_KEY = ['profile'] as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function toUserProfile(data: unknown): UserProfile {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    !isNullableString(data.name) ||
    !isNullableString(data.email) ||
    typeof data.timezone !== 'string' ||
    (data.unit_preference !== 'lbs' && data.unit_preference !== 'kg') ||
    !isNullableString(data.onboarded_at)
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    timezone: data.timezone,
    unitPreference: data.unit_preference,
    onboardedAt: data.onboarded_at,
  };
}

export async function fetchProfile(): Promise<UserProfile> {
  return toUserProfile(await authorizedRequest('/users/me'));
}
