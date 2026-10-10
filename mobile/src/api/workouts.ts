import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, jsonPatch, jsonPost, unexpectedResponse } from '@/src/api/http';

export type ExerciseRef = { id: string; name: string };

export type WorkoutSet = {
  id: string;
  exercise: ExerciseRef;
  /** Order within the workout; later sets have higher numbers. */
  position: number;
  reps: number;
  weightKg: number;
  rpe: number | null;
};

export type Workout = {
  id: string;
  startedAt: string;
  /** Null while the workout is in progress. */
  endedAt: string | null;
  /** The template the workout was started from, if any and if it still exists. */
  templateId: string | null;
  sets: WorkoutSet[];
};

/** One finished workout as shown in the history list. */
export type WorkoutSummary = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  setCount: number;
  /** Each exercise once, in the order it was first logged. */
  exerciseNames: string[];
  /** Weight times reps, added up over every set. */
  volumeKg: number;
};

export type WorkoutHistoryPage = {
  items: WorkoutSummary[];
  /** How many finished workouts there are in all. */
  total: number;
};

export type RecordSet = {
  workoutId: string;
  /** When the workout that holds the set started. */
  achievedAt: string;
  reps: number;
  weightKg: number;
  /** Null when the set has too many reps for a trustworthy estimate. */
  estimated1rmKg: number | null;
};

export type ExerciseRecords = {
  heaviest: RecordSet | null;
  bestEstimated1rm: RecordSet | null;
};

export const HISTORY_PAGE_SIZE = 20;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export type LastSets = {
  workoutId: string;
  startedAt: string;
  sets: WorkoutSet[];
};

export type NewSet = {
  exerciseId: string;
  reps: number;
  weightKg: number;
  rpe: number | null;
};

/** The values of a set after an edit. A null `rpe` clears it. */
export type SetChanges = Omit<NewSet, 'exerciseId'>;

/** The backend sends decimals as strings such as "102.0583". */
function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw unexpectedResponse();
  }
  return parsed;
}

function toExerciseRef(data: unknown): ExerciseRef {
  if (!isRecord(data) || typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw unexpectedResponse();
  }
  return { id: data.id, name: data.name };
}

function toWorkoutSet(data: unknown): WorkoutSet {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.position !== 'number' ||
    typeof data.reps !== 'number'
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    exercise: toExerciseRef(data.exercise),
    position: data.position,
    reps: data.reps,
    weightKg: toNumber(data.weight_kg),
    rpe: data.rpe === null ? null : toNumber(data.rpe),
  };
}

function toWorkoutSets(data: unknown): WorkoutSet[] {
  if (!Array.isArray(data)) {
    throw unexpectedResponse();
  }
  return data.map(toWorkoutSet);
}

function toWorkout(data: unknown): Workout {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.started_at !== 'string' ||
    !isNullableString(data.ended_at) ||
    !isNullableString(data.template_id)
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    templateId: data.template_id,
    sets: toWorkoutSets(data.sets),
  };
}

function toWorkoutSummary(data: unknown): WorkoutSummary {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.started_at !== 'string' ||
    !isNullableString(data.ended_at) ||
    typeof data.set_count !== 'number' ||
    !Array.isArray(data.exercise_names) ||
    !data.exercise_names.every((name) => typeof name === 'string')
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    setCount: data.set_count,
    exerciseNames: data.exercise_names,
    volumeKg: toNumber(data.volume_kg),
  };
}

function toWorkoutHistoryPage(data: unknown): WorkoutHistoryPage {
  if (!isRecord(data) || !Array.isArray(data.items) || typeof data.total !== 'number') {
    throw unexpectedResponse();
  }
  return { items: data.items.map(toWorkoutSummary), total: data.total };
}

function toRecordSet(data: unknown): RecordSet | null {
  if (data === null) {
    return null;
  }
  if (
    !isRecord(data) ||
    typeof data.workout_id !== 'string' ||
    typeof data.achieved_at !== 'string' ||
    typeof data.reps !== 'number'
  ) {
    throw unexpectedResponse();
  }
  return {
    workoutId: data.workout_id,
    achievedAt: data.achieved_at,
    reps: data.reps,
    weightKg: toNumber(data.weight_kg),
    estimated1rmKg: data.estimated_1rm_kg === null ? null : toNumber(data.estimated_1rm_kg),
  };
}

function toExerciseRecords(data: unknown): ExerciseRecords {
  if (!isRecord(data)) {
    throw unexpectedResponse();
  }
  return {
    heaviest: toRecordSet(data.heaviest),
    bestEstimated1rm: toRecordSet(data.best_estimated_1rm),
  };
}

function toLastSets(data: unknown): LastSets {
  if (
    !isRecord(data) ||
    typeof data.workout_id !== 'string' ||
    typeof data.started_at !== 'string'
  ) {
    throw unexpectedResponse();
  }
  return {
    workoutId: data.workout_id,
    startedAt: data.started_at,
    sets: toWorkoutSets(data.sets),
  };
}

/** The workout in progress, or null when there is none. */
export async function fetchActiveWorkout(): Promise<Workout | null> {
  const data = await authorizedRequest('/workouts/active');
  return data === null ? null : toWorkout(data);
}

/** Starts a blank workout, or one from a template when its id is given. */
export async function startWorkout(templateId?: string): Promise<Workout> {
  const options =
    templateId === undefined ? { method: 'POST' } : jsonPost({ template_id: templateId });
  return toWorkout(await authorizedRequest('/workouts', options));
}

export async function fetchWorkout(workoutId: string): Promise<Workout> {
  return toWorkout(await authorizedRequest(`/workouts/${workoutId}`));
}

/** A page of finished workouts, newest first, starting `offset` workouts in. */
export async function fetchWorkoutHistory(offset: number): Promise<WorkoutHistoryPage> {
  return toWorkoutHistoryPage(
    await authorizedRequest(`/workouts?limit=${HISTORY_PAGE_SIZE}&offset=${offset}`)
  );
}

/** The user's best sets of an exercise across their finished workouts. */
export async function fetchRecords(exerciseId: string): Promise<ExerciseRecords> {
  return toExerciseRecords(
    await authorizedRequest(`/workouts/records?exercise_id=${encodeURIComponent(exerciseId)}`)
  );
}

export async function finishWorkout(workoutId: string): Promise<Workout> {
  return toWorkout(await authorizedRequest(`/workouts/${workoutId}/finish`, { method: 'POST' }));
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await authorizedRequest(`/workouts/${workoutId}`, { method: 'DELETE' });
}

export async function logSet(workoutId: string, newSet: NewSet): Promise<WorkoutSet> {
  const body = {
    exercise_id: newSet.exerciseId,
    reps: newSet.reps,
    weight_kg: newSet.weightKg,
    rpe: newSet.rpe,
  };
  return toWorkoutSet(await authorizedRequest(`/workouts/${workoutId}/sets`, jsonPost(body)));
}

export async function updateSet(
  workoutId: string,
  setId: string,
  changes: SetChanges
): Promise<WorkoutSet> {
  const body = { reps: changes.reps, weight_kg: changes.weightKg, rpe: changes.rpe };
  return toWorkoutSet(
    await authorizedRequest(`/workouts/${workoutId}/sets/${setId}`, jsonPatch(body))
  );
}

export async function deleteSet(workoutId: string, setId: string): Promise<void> {
  await authorizedRequest(`/workouts/${workoutId}/sets/${setId}`, { method: 'DELETE' });
}

/** What the user did for an exercise in their last finished workout with it. */
export async function fetchLastSets(exerciseId: string): Promise<LastSets | null> {
  const data = await authorizedRequest(
    `/workouts/last-sets?exercise_id=${encodeURIComponent(exerciseId)}`
  );
  return data === null ? null : toLastSets(data);
}
