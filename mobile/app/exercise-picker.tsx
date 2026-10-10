import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, useThemeColor, View } from '@/components/Themed';
import { searchExercises, type Exercise } from '@/src/api/exercises';
import { userMessage } from '@/src/api/http';
import { pickExercise } from '@/src/training/pickedExercises';
import { useActiveWorkout } from '@/src/training/useWorkout';

// Long enough that typing a word sends one search, not one per letter.
const SEARCH_DEBOUNCE_MS = 250;
const PLACEHOLDER_COLOR = '#888';

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** "lower_back" is shown as "lower back". */
function readable(value: string): string {
  return value.replaceAll('_', ' ');
}

function describeExercise(exercise: Exercise): string {
  const details = [...exercise.muscleGroups.slice(0, 2), exercise.equipment ?? ''];
  return details.filter(Boolean).map(readable).join(' · ');
}

export default function ExercisePickerScreen() {
  const textColor = useThemeColor({}, 'text');
  const activeWorkout = useActiveWorkout();
  const [searchText, setSearchText] = useState('');
  const search = useDebounced(searchText.trim(), SEARCH_DEBOUNCE_MS);
  const results = useQuery({
    queryKey: ['exercises', 'search', search],
    queryFn: () => searchExercises(search),
    // Keep the old list on screen while the next search loads.
    placeholderData: keepPreviousData,
  });

  const workoutId = activeWorkout.data?.id;
  const exercises = results.data?.items ?? [];
  const hiddenCount = (results.data?.total ?? 0) - exercises.length;

  function handlePick(exercise: Exercise) {
    if (workoutId === undefined) {
      return;
    }
    pickExercise(workoutId, { id: exercise.id, name: exercise.name });
    router.back();
  }

  return (
    <View style={styles.screen}>
      <TextInput
        style={[styles.search, { color: textColor }]}
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search exercises"
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCorrect={false}
        autoFocus
        clearButtonMode="while-editing"
        accessibilityLabel="Search exercises"
      />

      {results.isPending ? <ActivityIndicator style={styles.status} /> : null}
      {results.isError ? (
        <Text style={[styles.status, styles.error]} accessibilityRole="alert">
          {userMessage(results.error, "Couldn't load exercises.")}
        </Text>
      ) : null}
      {results.isSuccess && exercises.length === 0 ? (
        <Text style={styles.status}>No exercises match “{search}”.</Text>
      ) : null}

      <FlatList
        data={exercises}
        keyExtractor={(exercise) => exercise.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => handlePick(item)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name}`}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.details}>{describeExercise(item)}</Text>
          </Pressable>
        )}
        ListFooterComponent={
          hiddenCount > 0 ? (
            <Text style={styles.status}>{hiddenCount} more. Search to narrow the list.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  search: {
    margin: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
  },
  status: {
    padding: 16,
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
  },
  error: {
    color: '#c0392b',
    opacity: 1,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
  },
  details: {
    fontSize: 14,
    opacity: 0.6,
  },
});
