import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import type { UnitPreference } from '@/src/api/users';
import type { WorkoutSummary } from '@/src/api/workouts';
import { useWorkoutHistory } from '@/src/training/useWorkout';
import { formatElapsed, formatVolume, formatWorkoutDate } from '@/src/training/workoutModel';
import { useUnitPreference } from '@/src/units/useUnitPreference';

// Start loading the next page when the list is within half a screen of its end.
const LOAD_MORE_THRESHOLD = 0.5;

function describeTotals(workout: WorkoutSummary, unit: UnitPreference): string {
  const sets = workout.setCount === 1 ? '1 set' : `${workout.setCount} sets`;
  const totals = [sets, formatVolume(workout.volumeKg, unit)];
  const duration =
    workout.endedAt === null ? [] : [formatElapsed(workout.startedAt, new Date(workout.endedAt))];
  return [...totals, ...duration].join(' · ');
}

function HistoryRow({ workout, unit }: { workout: WorkoutSummary; unit: UnitPreference }) {
  const date = formatWorkoutDate(workout.startedAt);
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/workout-detail', params: { id: workout.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Workout on ${date}`}>
      <Text style={styles.date}>{date}</Text>
      {workout.exerciseNames.length > 0 ? (
        <Text style={styles.exercises}>{workout.exerciseNames.join(', ')}</Text>
      ) : null}
      <Text style={styles.totals}>{describeTotals(workout, unit)}</Text>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const unit = useUnitPreference();
  const history = useWorkoutHistory();

  if (history.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (history.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(history.error, "Couldn't load your history.")}
        </Text>
        <Button label="Try again" onPress={() => history.refetch()} />
      </View>
    );
  }

  const workouts = history.data.pages.flatMap((page) => page.items);

  function loadMore() {
    if (history.hasNextPage && !history.isFetchingNextPage) {
      void history.fetchNextPage();
    }
  }

  return (
    <FlatList
      data={workouts}
      keyExtractor={(workout) => workout.id}
      renderItem={({ item }) => <HistoryRow workout={item} unit={unit} />}
      onEndReached={loadMore}
      onEndReachedThreshold={LOAD_MORE_THRESHOLD}
      contentContainerStyle={workouts.length === 0 ? styles.centered : undefined}
      ListEmptyComponent={<Text style={styles.empty}>No finished workouts yet.</Text>}
      ListFooterComponent={
        history.isFetchingNextPage ? <ActivityIndicator style={styles.footer} /> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#888',
  },
  date: {
    fontSize: 17,
    fontWeight: '600',
  },
  exercises: {
    fontSize: 15,
  },
  totals: {
    fontSize: 14,
    opacity: 0.6,
  },
  empty: {
    fontSize: 16,
    opacity: 0.7,
  },
  footer: {
    padding: 16,
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
    color: '#c0392b',
  },
});
