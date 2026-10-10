import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  deleteFoodLogEntry,
  fetchDay,
  logFood,
  updateFoodLogEntry,
  type FoodLogChanges,
} from '@/src/api/foodLog';
import { fetchRecentFoods, MIN_FOOD_SEARCH_LENGTH, searchFoods } from '@/src/api/foods';

/** Every diet query's key starts with this. */
const DIET_QUERY_KEY = ['diet'] as const;
const DAY_QUERY_KEY = [...DIET_QUERY_KEY, 'day'] as const;
const RECENT_FOODS_QUERY_KEY = [...DIET_QUERY_KEY, 'recent'] as const;
// The catalogue changes a few times a year, so a search need not be repeated
// while the app stays open.
const SEARCH_STALE_MS = 5 * 60 * 1000;

/** Days and recent foods both change whenever the log does. */
function refreshLog(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: DAY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: RECENT_FOODS_QUERY_KEY }),
  ]);
}

/** What the user logged on the day given as "YYYY-MM-DD". */
export function useDay(entryDate: string) {
  return useQuery({ queryKey: [...DAY_QUERY_KEY, entryDate], queryFn: () => fetchDay(entryDate) });
}

/** Foods matching the search. A search too short to send loads nothing. */
export function useFoodSearch(search: string) {
  return useQuery({
    queryKey: [...DIET_QUERY_KEY, 'search', search],
    queryFn: () => searchFoods(search),
    enabled: search.length >= MIN_FOOD_SEARCH_LENGTH,
    staleTime: SEARCH_STALE_MS,
    // Keep the old list on screen while the next search loads.
    placeholderData: keepPreviousData,
  });
}

export function useRecentFoods() {
  return useQuery({ queryKey: RECENT_FOODS_QUERY_KEY, queryFn: fetchRecentFoods });
}

export function useLogFood() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: logFood, onSuccess: () => refreshLog(queryClient) });
}

export function useUpdateFoodLogEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, changes }: { entryId: string; changes: FoodLogChanges }) =>
      updateFoodLogEntry(entryId, changes),
    onSuccess: () => refreshLog(queryClient),
  });
}

export function useDeleteFoodLogEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFoodLogEntry,
    onSuccess: () => refreshLog(queryClient),
  });
}
