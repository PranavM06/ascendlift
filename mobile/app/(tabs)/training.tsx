import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import { useActiveWorkout, useStartWorkout } from '@/src/training/useWorkout';

function describeProgress(setCount: number): string {
  return setCount === 1 ? '1 set logged so far.' : `${setCount} sets logged so far.`;
}

export default function TrainingScreen() {
  const activeWorkout = useActiveWorkout();
  const start = useStartWorkout();

  if (activeWorkout.isPending) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }
  if (activeWorkout.isError) {
    return (
      <View style={styles.container}>
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(activeWorkout.error, "Couldn't load your training.")}
        </Text>
        <Button label="Try again" onPress={() => activeWorkout.refetch()} />
      </View>
    );
  }

  const workout = activeWorkout.data;
  if (workout !== null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Workout in progress</Text>
        <Text style={styles.detail}>{describeProgress(workout.sets.length)}</Text>
        <Button label="Resume workout" variant="primary" onPress={() => router.push('/workout')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ready to lift?</Text>
      <Text style={styles.detail}>Start a workout and log your sets as you go.</Text>
      <Button
        label={start.isPending ? 'Starting…' : 'Start workout'}
        variant="primary"
        onPress={() => start.mutate(undefined, { onSuccess: () => router.push('/workout') })}
        disabled={start.isPending}
      />
      {start.isError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(start.error, "Couldn't start a workout. Try again.")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  detail: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
    color: '#c0392b',
  },
});
