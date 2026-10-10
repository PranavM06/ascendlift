import { create } from 'zustand';

import type { ExerciseRef } from '@/src/api/workouts';
import { addDraftExercise } from '@/src/training/templateDraft';

type PickedExercisesState = {
  /** The workout the picks belong to, so they never carry into the next one. */
  workoutId: string | null;
  exercises: ExerciseRef[];
};

const NO_EXERCISES: ExerciseRef[] = [];

/**
 * Exercises added to the workout in progress that have no set yet. The server
 * only learns about an exercise when its first set is logged, so until then
 * the pick lives here.
 */
export const usePickedExercises = create<PickedExercisesState>(() => ({
  workoutId: null,
  exercises: NO_EXERCISES,
}));

export function pickExercise(workoutId: string, exercise: ExerciseRef): void {
  usePickedExercises.setState((state) => {
    const current = state.workoutId === workoutId ? state.exercises : NO_EXERCISES;
    const isAlreadyPicked = current.some((picked) => picked.id === exercise.id);
    return { workoutId, exercises: isAlreadyPicked ? current : [...current, exercise] };
  });
}

/** Where an exercise chosen in the picker goes. */
export type PickTarget = 'workout' | 'template';

/** Hands a chosen exercise to the workout in progress or to the template being edited. */
export function deliverPick(
  target: PickTarget,
  exercise: ExerciseRef,
  workoutId: string | undefined
): void {
  if (target === 'template') {
    addDraftExercise(exercise);
  } else if (workoutId !== undefined) {
    pickExercise(workoutId, exercise);
  }
}

export function toPickTarget(param: unknown): PickTarget {
  return param === 'template' ? 'template' : 'workout';
}

export function clearPickedExercises(): void {
  usePickedExercises.setState({ workoutId: null, exercises: NO_EXERCISES });
}

export function usePickedExercisesFor(workoutId: string): ExerciseRef[] {
  return usePickedExercises((state) =>
    state.workoutId === workoutId ? state.exercises : NO_EXERCISES
  );
}
