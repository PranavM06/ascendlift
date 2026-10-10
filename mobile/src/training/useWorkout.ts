import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  deleteSet,
  deleteWorkout,
  fetchActiveWorkout,
  fetchLastSets,
  finishWorkout,
  logSet,
  startWorkout,
  updateSet,
  type NewSet,
  type SetChanges,
  type Workout,
  type WorkoutSet,
} from '@/src/api/workouts';
import { clearPickedExercises } from '@/src/training/pickedExercises';
import { stopRest } from '@/src/training/restTimer';

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
  stopRest();
  queryClient.setQueryData<ActiveWorkout>(ACTIVE_WORKOUT_QUERY_KEY, null);
  void queryClient.invalidateQueries({ queryKey: LAST_SETS_QUERY_KEY });
}

/**
 * After a failed change, reload the workout. The change may have reached the
 * server even though its response was lost, or the workout may have been
 * changed from another device.
 */
function resyncActiveWorkout(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ACTIVE_WORKOUT_QUERY_KEY });
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
    onError: () => resyncActiveWorkout(queryClient),
  });
}

export function useLogSet(workoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newSet: NewSet) => logSet(workoutId, newSet),
    onSuccess: (logged) =>
      updateActiveSets(queryClient, workoutId, (sets) =>
        // A refetch that landed first may already include the new set.
        sets.some((set) => set.id === logged.id) ? sets : [...sets, logged]
      ),
    onError: () => resyncActiveWorkout(queryClient),
  });
}

export function useUpdateSet(workoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ setId, changes }: { setId: string; changes: SetChanges }) =>
      updateSet(workoutId, setId, changes),
    onSuccess: (updated) =>
      updateActiveSets(queryClient, workoutId, (sets) =>
        sets.map((set) => (set.id === updated.id ? updated : set))
      ),
    onError: () => resyncActiveWorkout(queryClient),
  });
}

export function useDeleteSet(workoutId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (setId: string) => deleteSet(workoutId, setId),
    onSuccess: (_result, setId) =>
      updateActiveSets(queryClient, workoutId, (sets) => sets.filter((set) => set.id !== setId)),
    onError: () => resyncActiveWorkout(queryClient),
  });
}

export function useFinishWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: finishWorkout,
    onSuccess: () => closeActiveWorkout(queryClient),
    onError: () => resyncActiveWorkout(queryClient),
  });
}

export function useDiscardWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkout,
    onSuccess: () => closeActiveWorkout(queryClient),
    onError: () => resyncActiveWorkout(queryClient),
  });
}
