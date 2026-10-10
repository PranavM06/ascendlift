import { create } from 'zustand';

import type { FoodLogEntry, Meal } from '@/src/api/foodLog';
import type { Food } from '@/src/api/foods';

export type EntryDraft = {
  food: Food;
  meal: Meal;
  /** The day the food goes under, as "YYYY-MM-DD". */
  entryDate: string;
  /** The entry being edited; null while logging a new one. */
  entry: { id: string; servings: number } | null;
};

/**
 * The food about to be logged or the entry being edited. It lives outside the
 * entry screen so the screens that open it can hand over a whole food, which
 * does not fit in a link.
 */
export const useEntryDraft = create<{ draft: EntryDraft | null }>(() => ({ draft: null }));

/** Begins logging a food under a meal of a day. */
export function startNewEntry(food: Food, meal: Meal, entryDate: string): void {
  useEntryDraft.setState({ draft: { food, meal, entryDate, entry: null } });
}

/** Begins editing an entry that is already logged. */
export function startEditingEntry(entry: FoodLogEntry): void {
  useEntryDraft.setState({
    draft: {
      food: entry.food,
      meal: entry.meal,
      entryDate: entry.entryDate,
      entry: { id: entry.id, servings: entry.servings },
    },
  });
}
