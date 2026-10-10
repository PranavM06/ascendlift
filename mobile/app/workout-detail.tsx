import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import { useDeleteFinishedWorkout, useWorkoutDetail } from '@/src/training/useWorkout';
import {
  describeSet,
  formatElapsed,
  formatWorkoutDate,
  groupSetsByExercise,
} from '@/src/training/workoutModel';
import { useUnitPreference } from '@/src/units/useUnitPreference';

function WorkoutDetail({ workoutId }: { workoutId: string }) {
  const unit = useUnitPreference();
  const detail = useWorkoutDetail(workoutId);
  const remove = useDeleteFinishedWorkout();

  if (detail.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (detail.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(detail.error, "Couldn't load this workout.")}
        </Text>
        <Button label="Try again" onPress={() => detail.refetch()} />
      </View>
    );
  }

  const workout = detail.data;
  const groups = groupSetsByExercise(workout.sets, []);
  const duration =
    workout.endedAt === null ? null : formatElapsed(workout.startedAt, new Date(workout.endedAt));

  function confirmDelete() {
    Alert.alert('Delete workout?', 'This removes it and its sets from your history.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        // The failure is shown through the mutation's error state.
        onPress: () =>
          remove.mutateAsync(workout.id).then(
            () => router.back(),
            () => undefined
          ),
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.date}>{formatWorkoutDate(workout.startedAt)}</Text>
      {duration ? <Text style={styles.detail}>Lasted {duration}</Text> : null}

      {groups.length === 0 ? <Text style={styles.detail}>No sets were logged.</Text> : null}
      {groups.map((group) => (
        <View key={group.exercise.id} style={styles.group}>
          <Text style={styles.exercise}>{group.exercise.name}</Text>
          {group.sets.map((set, index) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setNumber}>{index + 1}</Text>
              <Text style={styles.setText}>{describeSet(set, unit)}</Text>
            </View>
          ))}
        </View>
      ))}

      {remove.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(remove.error, "Couldn't delete the workout. Try again.")}
        </Text>
      ) : null}
      <Button
        label={remove.isPending ? 'Deleting…' : 'Delete workout'}
        variant="danger"
        onPress={confirmDelete}
        disabled={remove.isPending}
      />
    </ScrollView>
  );
}

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  if (typeof id !== 'string') {
    return (
      <View style={styles.centered}>
        <Text style={styles.detail}>This workout could not be found.</Text>
      </View>
    );
  }
  return <WorkoutDetail workoutId={id} />;
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  date: {
    fontSize: 24,
    fontWeight: '600',
  },
  detail: {
    fontSize: 16,
    opacity: 0.7,
  },
  group: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 6,
  },
  exercise: {
    fontSize: 18,
    fontWeight: '600',
  },
  setRow: {
    flexDirection: 'row',
    gap: 12,
  },
  setNumber: {
    width: 20,
    fontSize: 16,
    opacity: 0.6,
  },
  setText: {
    fontSize: 16,
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
    color: '#c0392b',
  },
});
