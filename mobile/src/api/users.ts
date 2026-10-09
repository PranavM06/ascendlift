import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, unexpectedResponse } from '@/src/api/http';

export type UnitPreference = 'lbs' | 'kg';

export type UserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  timezone: string;
  unitPreference: UnitPreference;
};

export const PROFILE_QUERY_KEY = ['profile'] as const;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function toUserProfile(data: unknown): UserProfile {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    !isNullableString(data.name) ||
    !isNullableString(data.email) ||
    typeof data.timezone !== 'string' ||
    (data.unit_preference !== 'lbs' && data.unit_preference !== 'kg')
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    timezone: data.timezone,
    unitPreference: data.unit_preference,
  };
}

export async function fetchProfile(): Promise<UserProfile> {
  return toUserProfile(await authorizedRequest('/users/me'));
}
