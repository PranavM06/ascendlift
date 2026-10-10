import { create } from 'zustand';

import type { ExerciseRef } from '@/src/api/workouts';

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

export function clearPickedExercises(): void {
  usePickedExercises.setState({ workoutId: null, exercises: NO_EXERCISES });
}

export function usePickedExercisesFor(workoutId: string): ExerciseRef[] {
  return usePickedExercises((state) =>
    state.workoutId === workoutId ? state.exercises : NO_EXERCISES
  );
}
