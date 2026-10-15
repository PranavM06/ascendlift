import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, unexpectedResponse } from '@/src/api/http';
import { toNumber } from '@/src/api/workouts';

/** A day's calorie and macro goals, as the user entered them. */
export type Targets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type DayTargets = Targets & {
  /** The first day these targets apply to, as "YYYY-MM-DD". */
  effectiveDate: string;
};

/** Every targets query's key starts with this. */
export const TARGETS_QUERY_KEY = ['targets'] as const;

function toDayTargets(data: unknown): DayTargets | null {
  if (data === null) {
    return null;
  }
  if (!isRecord(data) || typeof data.effective_date !== 'string') {
    throw unexpectedResponse();
  }
  return {
    calories: toNumber(data.calories),
    proteinG: toNumber(data.protein_g),
    carbsG: toNumber(data.carbs_g),
    fatG: toNumber(data.fat_g),
    effectiveDate: data.effective_date,
  };
}

/** The targets in effect on the day given as "YYYY-MM-DD"; null if none were set by then. */
export async function fetchTargets(onDate: string): Promise<DayTargets | null> {
  return toDayTargets(
    await authorizedRequest(`/targets?on_date=${encodeURIComponent(onDate)}`)
  );
}
