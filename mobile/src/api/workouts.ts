import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, jsonPost, unexpectedResponse } from '@/src/api/http';

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
  sets: WorkoutSet[];
};

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
    (data.ended_at !== null && typeof data.ended_at !== 'string')
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    sets: toWorkoutSets(data.sets),
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

export async function startWorkout(): Promise<Workout> {
  return toWorkout(await authorizedRequest('/workouts', { method: 'POST' }));
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
