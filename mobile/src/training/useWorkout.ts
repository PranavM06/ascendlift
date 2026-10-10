import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  deleteSet,
  deleteWorkout,
  fetchActiveWorkout,
  fetchLastSets,
  finishWorkout,
  logSet,
  startWorkout,
  type NewSet,
  type Workout,
  type WorkoutSet,
} from '@/src/api/workouts';
import { clearPickedExercises } from '@/src/training/pickedExercises';

export const ACTIVE_WORKOUT_QUERY_KEY = ['workouts', 'active'] as const;
const LAST_SETS_QUERY_KEY = ['workouts', 'last-sets'] as const;
// What was lifted last time cannot change while a workout is in progress.
const LAST_SETS_STALE_MS = 5 * 60 * 1000;

type ActiveWorkout = Workout | null;

function updateActiveSets(
  queryClient: QueryClient,
  workoutId: string,
  change: (sets: WorkoutSet[]) => WorkoutSet[]
): void {
  queryClient.setQueryData<ActiveWorkout>(ACTIVE_WORKOUT_QUERY_KEY, (current) =>
    current && current.id === workoutId ? { ...current, sets: change(current.sets) } : current
  );
}

function closeActiveWorkout(queryClient: QueryClient): void {
  clearPickedExercises();
  queryClient.setQueryData<ActiveWorkout>(ACTIVE_WORKOUT_QUERY_KEY, null);
  void queryClient.invalidateQueries({ queryKey: LAST_SETS_QUERY_KEY });
}

export function useActiveWorkout() {
  return useQuery({ queryKey: ACTIVE_WORKOUT_QUERY_KEY, queryFn: fetchActiveWorkout });
}

export function useLastSets(exerciseId: string) {
  return useQuery({
    queryKey: [...LAST_SETS_QUERY_KEY, exerciseId],
    queryFn: () => fetchLastSets(exerciseId),
    staleTime: LAST_SETS_STALE_MS,
  });
}

export function useStartWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startWorkout,
    onSuccess: (workout) => {
      queryClient.setQueryData<ActiveWorkout>(ACTIVE_WORKOUT_QUERY_KEY, workout);
    },
    // Most likely a workout is already in progress, started on another device.
    onError: () => queryClient.invalidateQueries({ queryKey: ACTIVE_WORKOUT_QUERY_KEY }),
  });
}

export function useLogSet(workoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newSet: NewSet) => logSet(workoutId, newSet),
    onSuccess: (logged) => updateActiveSets(queryClient, workoutId, (sets) => [...sets, logged]),
  });
}

export function useDeleteSet(workoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => deleteSet(workoutId, setId),
    onSuccess: (_result, setId) =>
      updateActiveSets(queryClient, workoutId, (sets) => sets.filter((set) => set.id !== setId)),
  });
}

export function useFinishWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: finishWorkout,
    onSuccess: () => closeActiveWorkout(queryClient),
  });
}

export function useDiscardWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkout,
    onSuccess: () => closeActiveWorkout(queryClient),
  });
}
