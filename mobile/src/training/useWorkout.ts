import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  deleteSet,
  deleteWorkout,
  fetchActiveWorkout,
  fetchLastSets,
  fetchRecords,
  fetchWorkout,
  fetchWorkoutHistory,
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

/** Every workout query's key starts with this, so one call can refresh them all. */
const WORKOUTS_QUERY_KEY = ['workouts'] as const;
export const ACTIVE_WORKOUT_QUERY_KEY = [...WORKOUTS_QUERY_KEY, 'active'] as const;
const LAST_SETS_QUERY_KEY = [...WORKOUTS_QUERY_KEY, 'last-sets'] as const;
const HISTORY_QUERY_KEY = [...WORKOUTS_QUERY_KEY, 'history'] as const;
/** Second part of the key of a single workout's query. */
const DETAIL_KEY_PART = 'detail';
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
  // History, records and "last time" all change when a workout ends.
  void queryClient.invalidateQueries({ queryKey: WORKOUTS_QUERY_KEY });
}

/** Finished workouts, newest first, loaded a page at a time. */
export function useWorkoutHistory() {
  return useInfiniteQuery({
    queryKey: HISTORY_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchWorkoutHistory(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loadedCount = pages.reduce((count, page) => count + page.items.length, 0);
      return loadedCount < lastPage.total ? loadedCount : undefined;
    },
  });
}

export function useWorkoutDetail(workoutId: string) {
  return useQuery({
    queryKey: [...WORKOUTS_QUERY_KEY, DETAIL_KEY_PART, workoutId],
    queryFn: () => fetchWorkout(workoutId),
  });
}

export function useRecords(exerciseId: string) {
  return useQuery({
    queryKey: [...WORKOUTS_QUERY_KEY, 'records', exerciseId],
    queryFn: () => fetchRecords(exerciseId),
    staleTime: LAST_SETS_STALE_MS,
  });
}

/** Deletes a finished workout from the history. */
export function useDeleteFinishedWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkout,
    onSuccess: () => {
      // Refresh history, records and "last time" in the background. The
      // detail of the workout just deleted is left alone: asking for it again
      // would fail and show an error on the screen that is about to close.
      void queryClient.invalidateQueries({
        queryKey: WORKOUTS_QUERY_KEY,
        predicate: (query) => query.queryKey[1] !== DETAIL_KEY_PART,
      });
    },
  });
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
    // Given a template id, the workout starts from that template.
    mutationFn: (templateId: string | undefined) => startWorkout(templateId),
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
