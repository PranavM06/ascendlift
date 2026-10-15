import { authorizedRequest } from '@/src/api/authorized';
import { toFood, type Food } from '@/src/api/foods';
import { isRecord, jsonPatch, jsonPost, unexpectedResponse } from '@/src/api/http';
import { toNumber } from '@/src/api/workouts';

// The values the backend accepts; see Meal in its enums.
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type Meal = (typeof MEALS)[number];

export type Macros = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** One logged food. Its nutrients are for the servings logged. */
export type FoodLogEntry = Macros & {
  id: string;
  food: Food;
  servings: number;
  meal: Meal;
  /** The day it was eaten, as "YYYY-MM-DD". */
  entryDate: string;
};

/** Everything logged on one day, in the order logged, and what it adds up to. */
export type DayLog = {
  entryDate: string;
  totals: Macros;
  entries: FoodLogEntry[];
};

export type NewFoodLogEntry = {
  foodId: string;
  servings: number;
  meal: Meal;
  entryDate: string;
};

/** The values of an entry after an edit. */
export type FoodLogChanges = { servings: number; meal: Meal };

export function isMeal(value: unknown): value is Meal {
  return MEALS.some((meal) => meal === value);
}

function toMacros(data: unknown): Macros {
  if (!isRecord(data)) {
    throw unexpectedResponse();
  }
  return {
    calories: toNumber(data.calories),
    proteinG: toNumber(data.protein_g),
    carbsG: toNumber(data.carbs_g),
    fatG: toNumber(data.fat_g),
  };
}

function toFoodLogEntry(data: unknown): FoodLogEntry {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    !isMeal(data.meal) ||
    typeof data.entry_date !== 'string'
  ) {
    throw unexpectedResponse();
  }
  return {
    ...toMacros(data),
    id: data.id,
    food: toFood(data.food),
    servings: toNumber(data.servings),
    meal: data.meal,
    entryDate: data.entry_date,
  };
}

function toDayLog(data: unknown): DayLog {
  if (!isRecord(data) || typeof data.entry_date !== 'string' || !Array.isArray(data.entries)) {
    throw unexpectedResponse();
  }
  return {
    entryDate: data.entry_date,
    totals: toMacros(data.totals),
    entries: data.entries.map(toFoodLogEntry),
  };
}

/** What the user logged on the day given as "YYYY-MM-DD". */
export async function fetchDay(entryDate: string): Promise<DayLog> {
  return toDayLog(
    await authorizedRequest(`/food-log?entry_date=${encodeURIComponent(entryDate)}`)
  );
}

export async function logFood(newEntry: NewFoodLogEntry): Promise<FoodLogEntry> {
  const body = {
    food_id: newEntry.foodId,
    servings: newEntry.servings,
    meal: newEntry.meal,
    entry_date: newEntry.entryDate,
  };
  return toFoodLogEntry(await authorizedRequest('/food-log', jsonPost(body)));
}

export async function updateFoodLogEntry(
  entryId: string,
  changes: FoodLogChanges
): Promise<FoodLogEntry> {
  const body = { servings: changes.servings, meal: changes.meal };
  return toFoodLogEntry(await authorizedRequest(`/food-log/${entryId}`, jsonPatch(body)));
}

export async function deleteFoodLogEntry(entryId: string): Promise<void> {
  await authorizedRequest(`/food-log/${entryId}`, { method: 'DELETE' });
}
