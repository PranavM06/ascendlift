import type { TemplateExercise } from '@/src/api/templates';
import type { UnitPreference } from '@/src/api/users';
import type { ExerciseRecords, ExerciseRef, WorkoutSet } from '@/src/api/workouts';
import { formatWeight, KG_PER_LB, parseWeight, toKg, UNIT_LABEL } from '@/src/units/weight';

export type ExerciseGroup = { exercise: ExerciseRef; sets: WorkoutSet[] };

export type SetSuggestion = { weightKg: number; reps: number };

/** The set form's fields, exactly as typed. */
export type SetEntry = { weightText: string; repsText: string; rpeText: string };

export type ParsedSetEntry =
  | { ok: true; weightKg: number; reps: number; rpe: number | null }
  | { ok: false; message: string };

// The same limits the backend enforces, checked here so the form can explain.
const MAX_WEIGHT_KG = 2000;
const MAX_REPS = 1000;
const MIN_RPE = 1;
const MAX_RPE = 10;
const RPE_STEP = 0.5;
const WHOLE_NUMBER_PATTERN = /^\d+$/;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/**
 * Lays a workout out as one group per exercise, in the order each exercise was
 * first logged. Exercises picked but not yet logged follow, in the order picked.
 */
export function groupSetsByExercise(
  sets: readonly WorkoutSet[],
  pickedExercises: readonly ExerciseRef[]
): ExerciseGroup[] {
  const inOrder = [...sets].sort((first, second) => first.position - second.position);
  const exercises = [...inOrder.map((set) => set.exercise), ...pickedExercises];
  const uniqueExercises = exercises.filter(
    (exercise, index) => exercises.findIndex((other) => other.id === exercise.id) === index
  );
  return uniqueExercises.map((exercise) => ({
    exercise,
    sets: inOrder.filter((set) => set.exercise.id === exercise.id),
  }));
}

/**
 * What to pre-fill for the next set: the set just logged, or, for the first
 * set, the first one from the last workout with this exercise.
 */
export function suggestNextSet(
  loggedSets: readonly WorkoutSet[],
  lastTimeSets: readonly WorkoutSet[]
): SetSuggestion | null {
  const source = loggedSets.at(-1) ?? lastTimeSets.at(0);
  return source ? { weightKg: source.weightKg, reps: source.reps } : null;
}

export function describeSet(set: WorkoutSet, unit: UnitPreference): string {
  const rpe = set.rpe === null ? '' : ` @ ${set.rpe}`;
  return `${formatWeight(set.weightKg, unit)} × ${set.reps}${rpe}`;
}

/** A workout's total volume in the user's unit, such as "3,307 lb". */
export function formatVolume(volumeKg: number, unit: UnitPreference, locale?: string): string {
  const volume = unit === 'lbs' ? volumeKg / KG_PER_LB : volumeKg;
  return `${Math.round(volume).toLocaleString(locale)} ${UNIT_LABEL[unit]}`;
}

/** The day a workout happened, such as "Fri, Oct 9". */
export function formatWorkoutDate(startedAt: string, locale?: string): string {
  return new Date(startedAt).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** One line on the user's records for an exercise; null when they have none. */
export function describeRecords(records: ExerciseRecords, unit: UnitPreference): string | null {
  const { heaviest, bestEstimated1rm } = records;
  if (heaviest === null) {
    return null;
  }
  const best = `Best: ${formatWeight(heaviest.weightKg, unit)} × ${heaviest.reps}`;
  const estimate = bestEstimated1rm?.estimated1rmKg ?? null;
  return estimate === null ? best : `${best} · est. 1RM ${formatWeight(estimate, unit)}`;
}

/** What a template asks for on one exercise, such as "Plan: 3 × 5–8". */
export function describePlan(plan: TemplateExercise, unit: UnitPreference): string {
  const reps = plan.repMin === plan.repMax ? `${plan.repMin}` : `${plan.repMin}–${plan.repMax}`;
  const weight = plan.targetWeightKg === null ? '' : ` at ${formatWeight(plan.targetWeightKg, unit)}`;
  const rpe = plan.targetRpe === null ? '' : ` @ ${plan.targetRpe}`;
  return `Plan: ${plan.targetSets} × ${reps}${weight}${rpe}`;
}

/** Reads the three fields of the set form, or says what is wrong with them. */
export function parseSetEntry(entry: SetEntry, unit: UnitPreference): ParsedSetEntry {
  const weight = parseWeight(entry.weightText);
  if (weight === null) {
    return { ok: false, message: 'Enter a weight, such as 135.' };
  }
  const weightKg = toKg(weight, unit);
  if (weightKg > MAX_WEIGHT_KG) {
    return { ok: false, message: 'That weight is too heavy to log.' };
  }

  const repsText = entry.repsText.trim();
  const reps = Number(repsText);
  if (!WHOLE_NUMBER_PATTERN.test(repsText) || reps > MAX_REPS) {
    return { ok: false, message: 'Enter the reps as a whole number.' };
  }

  const rpeText = entry.rpeText.trim();
  const rpe = rpeText === '' ? null : parseWeight(rpeText);
  const isValidRpe =
    rpe !== null && rpe >= MIN_RPE && rpe <= MAX_RPE && Number.isInteger(rpe / RPE_STEP);
  if (rpeText !== '' && !isValidRpe) {
    return { ok: false, message: 'RPE goes from 1 to 10 in half steps.' };
  }
  return { ok: true, weightKg, reps, rpe };
}

/** Time since the workout started, as "m:ss" or "h:mm:ss". */
export function formatElapsed(startedAt: string, now: Date): string {
  const elapsedMs = Math.max(0, now.getTime() - new Date(startedAt).getTime());
  return formatDuration(Math.floor(elapsedMs / MS_PER_SECOND));
}

/** A number of seconds as "m:ss", or "h:mm:ss" from an hour up. */
export function formatDuration(totalSeconds: number): string {
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);

  const paddedSeconds = String(seconds).padStart(2, '0');
  if (hours === 0) {
    return `${minutes}:${paddedSeconds}`;
  }
  return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
}
