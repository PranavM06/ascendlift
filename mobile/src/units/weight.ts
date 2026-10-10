import type { UnitPreference } from '@/src/api/users';

export const KG_PER_LB = 0.45359237;
// The backend stores weights in kg with four decimal places, which is enough
// for a weight entered in pounds to convert back to the same number.
const STORED_KG_SCALE = 10_000;
// Editable fields show two decimal places.
const ENTRY_SCALE = 100;
/** Displayed weights are rounded to what the smallest pair of plates can make. */
const PLATE_STEP: Record<UnitPreference, number> = { lbs: 2.5, kg: 1.25 };

export const UNIT_LABEL: Record<UnitPreference, string> = { lbs: 'lb', kg: 'kg' };

const WEIGHT_PATTERN = /^\d+(?:[.,]\d+)?$/;

/** Converts a weight the user entered in their unit to the kg value to store. */
export function toKg(value: number, unit: UnitPreference): number {
  const kg = unit === 'lbs' ? value * KG_PER_LB : value;
  return Math.round(kg * STORED_KG_SCALE) / STORED_KG_SCALE;
}

/** Converts a stored kg value to the number to show in the user's unit. */
export function toDisplayWeight(kg: number, unit: UnitPreference): number {
  const value = unit === 'lbs' ? kg / KG_PER_LB : kg;
  const step = PLATE_STEP[unit];
  return Math.round(value / step) * step;
}

/**
 * Converts a stored kg value to the number to put in an editable field. Unlike
 * the display value it is not rounded to a plate step, so a weight that is
 * logged again without being edited stays exactly what it was.
 */
export function toEntryWeight(kg: number, unit: UnitPreference): number {
  const value = unit === 'lbs' ? kg / KG_PER_LB : kg;
  return Math.round(value * ENTRY_SCALE) / ENTRY_SCALE;
}

export function formatWeight(kg: number, unit: UnitPreference): string {
  return `${toDisplayWeight(kg, unit)} ${UNIT_LABEL[unit]}`;
}

/** Reads a typed weight such as "102.5" or "102,5"; null if it is not one. */
export function parseWeight(text: string): number | null {
  const trimmed = text.trim();
  if (!WEIGHT_PATTERN.test(trimmed)) {
    return null;
  }
  return Number(trimmed.replace(',', '.'));
}
