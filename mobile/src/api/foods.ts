import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, unexpectedResponse } from '@/src/api/http';
import { toNumber } from '@/src/api/workouts';

/** A food from the backend's catalogue. Its nutrients are for one serving. */
export type Food = {
  id: string;
  name: string;
  /** Who makes it, for packaged foods; null for generic ones. */
  brand: string | null;
  servingSize: number;
  /** "g", or "ml" for drinks. */
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** The shortest and longest search the backend accepts. */
export const MIN_FOOD_SEARCH_LENGTH = 2;
export const MAX_FOOD_SEARCH_LENGTH = 100;

export function toFood(data: unknown): Food {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.name !== 'string' ||
    (data.brand !== null && typeof data.brand !== 'string') ||
    typeof data.serving_unit !== 'string'
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    name: data.name,
    brand: data.brand,
    servingSize: toNumber(data.serving_size),
    servingUnit: data.serving_unit,
    calories: toNumber(data.calories),
    proteinG: toNumber(data.protein_g),
    carbsG: toNumber(data.carbs_g),
    fatG: toNumber(data.fat_g),
  };
}

function toFoods(data: unknown): Food[] {
  if (!Array.isArray(data)) {
    throw unexpectedResponse();
  }
  return data.map(toFood);
}

/** The best matches for a search of at least two characters, best first. */
export async function searchFoods(search: string): Promise<Food[]> {
  return toFoods(await authorizedRequest(`/foods?search=${encodeURIComponent(search.trim())}`));
}

/** The foods the user logged most recently, each once, latest first. */
export async function fetchRecentFoods(): Promise<Food[]> {
  return toFoods(await authorizedRequest('/foods/recent'));
}
