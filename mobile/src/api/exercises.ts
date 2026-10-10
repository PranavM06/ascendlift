import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, jsonPost, unexpectedResponse } from '@/src/api/http';

export type Exercise = {
  id: string;
  name: string;
  muscleGroups: string[];
  equipment: string | null;
  /** True for an exercise the user added themselves. */
  isCustom: boolean;
};

export type ExercisePage = {
  items: Exercise[];
  /** How many exercises match in all, which can be more than `items`. */
  total: number;
};

export type NewExercise = {
  name: string;
  /** The main muscle group first. */
  muscleGroups: string[];
  equipment: string | null;
};

/** Every exercise query's key starts with this, so one call can refresh them all. */
export const EXERCISES_QUERY_KEY = ['exercises'] as const;

// The values the backend accepts; see MuscleGroup and Equipment in its enums.
export const MUSCLE_GROUPS = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'middle_back',
  'lower_back',
  'traps',
  'neck',
  'abdominals',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'abductors',
  'adductors',
] as const;

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'kettlebells',
  'bands',
  'body_only',
  'ez_curl_bar',
  'exercise_ball',
  'medicine_ball',
  'other',
] as const;

const PAGE_SIZE = 50;

/** "lower_back" is shown as "lower back". */
export function readableLabel(value: string): string {
  return value.replaceAll('_', ' ');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toExercise(data: unknown): Exercise {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.name !== 'string' ||
    !isStringArray(data.muscle_groups) ||
    (data.equipment !== null && typeof data.equipment !== 'string') ||
    typeof data.is_custom !== 'boolean'
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    name: data.name,
    muscleGroups: data.muscle_groups,
    equipment: data.equipment,
    isCustom: data.is_custom,
  };
}

function toExercisePage(data: unknown): ExercisePage {
  if (!isRecord(data) || !Array.isArray(data.items) || typeof data.total !== 'number') {
    throw unexpectedResponse();
  }
  return { items: data.items.map(toExercise), total: data.total };
}

/** Adds an exercise that only this user can see. */
export async function createExercise(newExercise: NewExercise): Promise<Exercise> {
  const body = {
    name: newExercise.name,
    muscle_groups: newExercise.muscleGroups,
    equipment: newExercise.equipment,
  };
  return toExercise(await authorizedRequest('/exercises', jsonPost(body)));
}

/** The best matches for a name, or the start of the library when it is blank. */
export async function searchExercises(search: string): Promise<ExercisePage> {
  const term = search.trim();
  const query = term ? `&search=${encodeURIComponent(term)}` : '';
  return toExercisePage(await authorizedRequest(`/exercises?limit=${PAGE_SIZE}${query}`));
}
