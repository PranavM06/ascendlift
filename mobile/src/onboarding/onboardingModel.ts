import type { Phase, TrainingStyle } from '@/src/api/onboarding';
import type { Targets } from '@/src/api/targets';
import type { UnitPreference } from '@/src/api/users';
import { formatCalories } from '@/src/diet/dietModel';
import { KG_PER_LB, parseWeight, toKg, UNIT_LABEL } from '@/src/units/weight';

export const ONBOARDING_STEPS = ['units', 'goal', 'targets', 'bodyweight'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type Choice<Value extends string> = { value: Value; label: string; description: string };

export type Parsed<Value> = { ok: true; value: Value } | { ok: false; message: string };

/** What is typed in the targets form, one field per number. */
export type TargetTexts = Record<keyof Targets, string>;

export const EMPTY_TARGET_TEXTS: TargetTexts = { calories: '', proteinG: '', carbsG: '', fatG: '' };

export const UNIT_CHOICES: readonly Choice<UnitPreference>[] = [
  { value: 'lbs', label: 'Pounds (lb)', description: 'Weights rounded to 2.5 lb plates' },
  { value: 'kg', label: 'Kilograms (kg)', description: 'Weights rounded to 1.25 kg plates' },
];

export const TRAINING_STYLE_CHOICES: readonly Choice<TrainingStyle>[] = [
  {
    value: 'powerlifting',
    label: 'Powerlifting',
    description: 'Get stronger in the squat, bench and deadlift',
  },
  { value: 'bodybuilding', label: 'Bodybuilding', description: 'Build muscle size and shape' },
  {
    value: 'general_strength',
    label: 'General strength',
    description: 'Get stronger and fitter overall',
  },
];

export const PHASE_CHOICES: readonly Choice<Phase>[] = [
  { value: 'cut', label: 'Cut', description: 'Lose fat while keeping muscle' },
  { value: 'maintain', label: 'Maintain', description: 'Hold your weight steady' },
  { value: 'bulk', label: 'Bulk', description: 'Gain weight to build muscle' },
];

// The same bounds the backend enforces, checked here so the form can explain.
const MIN_CALORIES = 500;
const MAX_CALORIES = 10_000;
const MAX_MACRO_GRAMS = 1_000;
const MIN_BODYWEIGHT_KG = 20;
const MAX_BODYWEIGHT_KG = 400;
// The bodyweight range is shown to one decimal place.
const RANGE_SCALE = 10;
const KCAL_PER_GRAM = { proteinG: 4, carbsG: 4, fatG: 9 } as const;
const MACRO_NAME = { proteinG: 'protein', carbsG: 'carbs', fatG: 'fat' } as const;
const MACROS = ['proteinG', 'carbsG', 'fatG'] as const;
const EXAMPLE_BODYWEIGHT: Record<UnitPreference, number> = { lbs: 180, kg: 80 };
const WHOLE_NUMBER_PATTERN = /^\d+$/;
// Used when the device does not report its time zone; the backend accepts it.
const FALLBACK_TIMEZONE = 'UTC';

/** Reads a whole number such as "2400" or "2,400"; null if it is not one. */
function parseWholeNumber(text: string): number | null {
  const digits = text.replace(/[\s,]/g, '');
  return WHOLE_NUMBER_PATTERN.test(digits) ? Number(digits) : null;
}

/** Reads the targets form, or says what is wrong with the first bad field. */
export function parseTargets(texts: TargetTexts): Parsed<Targets> {
  const calories = parseWholeNumber(texts.calories);
  if (calories === null || calories < MIN_CALORIES || calories > MAX_CALORIES) {
    return {
      ok: false,
      message: `Enter daily calories from ${MIN_CALORIES} to ${MAX_CALORIES.toLocaleString('en-US')}.`,
    };
  }
  const grams = { proteinG: 0, carbsG: 0, fatG: 0 };
  for (const macro of MACROS) {
    const value = parseWholeNumber(texts[macro]);
    if (value === null || value > MAX_MACRO_GRAMS) {
      return {
        ok: false,
        message: `Enter ${MACRO_NAME[macro]} in whole grams, up to ${MAX_MACRO_GRAMS.toLocaleString('en-US')}.`,
      };
    }
    grams[macro] = value;
  }
  return { ok: true, value: { calories, ...grams } };
}

/** The calories that protein, carbs and fat add up to. */
export function caloriesFromMacros(macros: Omit<Targets, 'calories'>): number {
  return MACROS.reduce((total, macro) => total + macros[macro] * KCAL_PER_GRAM[macro], 0);
}

/** A hint such as "Your macros add up to 2,350 kcal."; null until every macro is filled in. */
export function describeMacroCalories(texts: TargetTexts, locale?: string): string | null {
  const [proteinG, carbsG, fatG] = MACROS.map((macro) => parseWholeNumber(texts[macro]));
  if (proteinG === null || carbsG === null || fatG === null) {
    return null;
  }
  const calories = caloriesFromMacros({ proteinG, carbsG, fatG });
  return `Your macros add up to ${formatCalories(calories, locale)}.`;
}

/** The accepted bodyweight range in the user's unit, narrowed to one decimal place. */
function bodyweightRange(unit: UnitPreference): { min: number; max: number } {
  const perKg = unit === 'lbs' ? 1 / KG_PER_LB : 1;
  return {
    min: Math.ceil(MIN_BODYWEIGHT_KG * perKg * RANGE_SCALE) / RANGE_SCALE,
    max: Math.floor(MAX_BODYWEIGHT_KG * perKg * RANGE_SCALE) / RANGE_SCALE,
  };
}

/** Reads a typed bodyweight in the user's unit and returns it in kg. */
export function parseBodyweight(text: string, unit: UnitPreference): Parsed<number> {
  const typed = parseWeight(text);
  if (typed === null) {
    return {
      ok: false,
      message: `Enter your weight in ${UNIT_LABEL[unit]}, such as ${EXAMPLE_BODYWEIGHT[unit]}.`,
    };
  }
  const kg = toKg(typed, unit);
  if (kg < MIN_BODYWEIGHT_KG || kg > MAX_BODYWEIGHT_KG) {
    const { min, max } = bodyweightRange(unit);
    return { ok: false, message: `Enter a weight from ${min} to ${max} ${UNIT_LABEL[unit]}.` };
  }
  return { ok: true, value: kg };
}

/** The device's IANA time zone, such as "America/Chicago". */
export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
}
