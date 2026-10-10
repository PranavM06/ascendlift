import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, unexpectedResponse } from '@/src/api/http';

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

const PAGE_SIZE = 50;

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

/** The best matches for a name, or the start of the library when it is blank. */
export async function searchExercises(search: string): Promise<ExercisePage> {
  const term = search.trim();
  const query = term ? `&search=${encodeURIComponent(term)}` : '';
  return toExercisePage(await authorizedRequest(`/exercises?limit=${PAGE_SIZE}${query}`));
}
