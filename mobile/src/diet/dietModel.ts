import { MEALS, type FoodLogEntry, type Macros, type Meal } from '@/src/api/foodLog';
import type { Food } from '@/src/api/foods';
import { parseWeight } from '@/src/units/weight';

export type MealGroup = { meal: Meal; entries: FoodLogEntry[]; calories: number };

export type ParsedServings = { ok: true; servings: number } | { ok: false; message: string };

export const MEAL_LABEL: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
};

// The same limit the backend enforces, checked here so the form can explain.
const MAX_SERVINGS = 100;
// The backend keeps servings to two decimal places.
const SERVINGS_SCALE = 100;
// Amounts such as "150 g" are shown to one decimal place at most.
const AMOUNT_SCALE = 10;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function roundTo(value: number, scale: number): number {
  return Math.round(value * scale) / scale;
}

function toLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The calendar day a moment falls on where the user is, as "YYYY-MM-DD". */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value);
}

/** The day `days` after the one given, or before it when negative. */
export function shiftDateKey(dateKey: string, days: number): string {
  const date = toLocalDate(dateKey);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** "Today", "Yesterday", or a date such as "Fri, Oct 9". */
export function describeDay(dateKey: string, todayKey: string, locale?: string): string {
  if (dateKey === todayKey) {
    return 'Today';
  }
  if (dateKey === shiftDateKey(todayKey, -1)) {
    return 'Yesterday';
  }
  return toLocalDate(dateKey).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** A day's entries under their meals. Every meal is listed, eaten or not. */
export function groupEntriesByMeal(entries: readonly FoodLogEntry[]): MealGroup[] {
  return MEALS.map((meal) => {
    const mealEntries = entries.filter((entry) => entry.meal === meal);
    const calories = mealEntries.reduce((total, entry) => total + entry.calories, 0);
    return { meal, entries: mealEntries, calories };
  });
}

/** What the given number of servings of a food adds up to. */
export function scaleMacros(food: Food, servings: number): Macros {
  return {
    calories: food.calories * servings,
    proteinG: food.proteinG * servings,
    carbsG: food.carbsG * servings,
    fatG: food.fatG * servings,
  };
}

/** Calories as a whole number, such as "1,850 kcal". */
export function formatCalories(calories: number, locale?: string): string {
  return `${Math.round(calories).toLocaleString(locale)} kcal`;
}

export function formatGrams(grams: number): string {
  return `${Math.round(grams)} g`;
}

/** Grams eaten against a target, such as "73 / 180 g". */
export function formatGramsOfTarget(grams: number, targetGrams: number): string {
  return `${Math.round(grams)} / ${formatGrams(targetGrams)}`;
}

/** How far a day is from its calorie target, such as "1,912 kcal left" or "50 kcal over". */
export function describeCaloriesLeft(
  calories: number,
  targetCalories: number,
  locale?: string
): string {
  const left = Math.round(targetCalories) - Math.round(calories);
  return left >= 0
    ? `${formatCalories(left, locale)} left`
    : `${formatCalories(-left, locale)} over`;
}

/** One line of protein, carbs and fat, such as "P 31 g · C 0 g · F 4 g". */
export function describeMacros(macros: Macros): string {
  return [
    `P ${formatGrams(macros.proteinG)}`,
    `C ${formatGrams(macros.carbsG)}`,
    `F ${formatGrams(macros.fatG)}`,
  ].join(' · ');
}

/** How much food some servings come to, such as "150 g". */
export function describeAmount(food: Food, servings: number): string {
  return `${roundTo(food.servingSize * servings, AMOUNT_SCALE)} ${food.servingUnit}`;
}

/** A food's brand, serving and calories, such as "Chobani · 150 g · 120 kcal". */
export function describeFood(food: Food, locale?: string): string {
  const details = [food.brand, describeAmount(food, 1), formatCalories(food.calories, locale)];
  return details.filter(Boolean).join(' · ');
}

/** Reads typed servings such as "1.5" or "1,5", or says what is wrong with them. */
export function parseServings(text: string): ParsedServings {
  const typed = parseWeight(text);
  if (typed === null) {
    return { ok: false, message: 'Enter how many servings, such as 1.5.' };
  }
  const servings = roundTo(typed, SERVINGS_SCALE);
  if (servings <= 0 || servings > MAX_SERVINGS) {
    return { ok: false, message: `Servings go from 0.01 to ${MAX_SERVINGS}.` };
  }
  return { ok: true, servings };
}

/** The number to put in the servings field, such as "1.5". */
export function toServingsText(servings: number): string {
  return String(roundTo(servings, SERVINGS_SCALE));
}

/** The amount field's text for what is typed in the servings field. */
export function amountTextFor(food: Food, servingsText: string): string {
  const servings = parseWeight(servingsText);
  return servings === null ? '' : String(roundTo(food.servingSize * servings, AMOUNT_SCALE));
}

/** The servings field's text for what is typed in the amount field. */
export function servingsTextFor(food: Food, amountText: string): string {
  const amount = parseWeight(amountText);
  return amount === null ? '' : toServingsText(amount / food.servingSize);
}
