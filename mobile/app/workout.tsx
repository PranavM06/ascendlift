import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { ExerciseCard } from '@/components/training/ExerciseCard';
import { RestTimer } from '@/components/training/RestTimer';
import { userMessage } from '@/src/api/http';
import type { TemplateExercise } from '@/src/api/templates';
import type { Workout } from '@/src/api/workouts';
import { usePickedExercisesFor } from '@/src/training/pickedExercises';
import { useNow } from '@/src/training/useNow';
import { useTemplate } from '@/src/training/useTemplates';
import { useActiveWorkout, useDiscardWorkout, useFinishWorkout } from '@/src/training/useWorkout';
import { formatElapsed, groupSetsByExercise } from '@/src/training/workoutModel';
import { useUnitPreference } from '@/src/units/useUnitPreference';

const NO_PLANS: TemplateExercise[] = [];

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const now = useNow();
  return <Text style={styles.elapsed}>{formatElapsed(startedAt, now)}</Text>;
}

function ActiveWorkout({ workout }: { workout: Workout }) {
  const unit = useUnitPreference();
  const pickedExercises = usePickedExercisesFor(workout.id);
  const finish = useFinishWorkout();
  const discard = useDiscardWorkout();

  // A workout started from a template lists the template's exercises up front,
  // each with its plan. If the template cannot be loaded the workout still works.
  const template = useTemplate(workout.templateId);
  const plans = template.data?.exercises ?? NO_PLANS;
  const plannedExercises = plans.map((plan) => plan.exercise);
  const groups = groupSetsByExercise(workout.sets, [...plannedExercises, ...pickedExercises]);
  const isClosing = finish.isPending || discard.isPending;
  const closeError = finish.error ?? discard.error;

  // Closing the workout removes this screen's content, so leaving waits on the
  // request itself rather than on a callback tied to the component.
  function leaveAfter(closing: Promise<unknown>) {
    closing.then(
      () => router.back(),
      // The failure is shown through the mutation's error state.
      () => undefined
    );
  }

  function confirmDiscard() {
    Alert.alert('Discard workout?', 'This deletes every set logged in it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => leaveAfter(discard.mutateAsync(workout.id)),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Outside the scroll view so the countdown stays in sight. */}
      <RestTimer />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ElapsedTime startedAt={workout.startedAt} />

        {groups.length === 0 ? (
          <Text style={styles.hint}>Add an exercise to start logging sets.</Text>
        ) : null}
        {groups.map((group) => (
          <ExerciseCard
            key={group.exercise.id}
            workoutId={workout.id}
            group={group}
            unit={unit}
            plan={plans.find((plan) => plan.exercise.id === group.exercise.id)}
          />
        ))}

        <Button label="Add exercise" onPress={() => router.push('/exercise-picker')} />

        {closeError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {userMessage(closeError, "Couldn't update the workout. Try again.")}
          </Text>
        ) : null}
        <Button
          label={finish.isPending ? 'Finishing…' : 'Finish workout'}
          variant="primary"
          onPress={() => leaveAfter(finish.mutateAsync(workout.id))}
          disabled={isClosing || workout.sets.length === 0}
        />
        <Button
          label="Discard workout"
          variant="danger"
          onPress={confirmDiscard}
          disabled={isClosing}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function WorkoutScreen() {
  const activeWorkout = useActiveWorkout();

  if (activeWorkout.isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (activeWorkout.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(activeWorkout.error, "Couldn't load your workout.")}
        </Text>
        <Button label="Try again" onPress={() => activeWorkout.refetch()} />
      </View>
    );
  }
  if (activeWorkout.data === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>No workout in progress.</Text>
      </View>
    );
  }
  return <ActiveWorkout workout={activeWorkout.data} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
  elapsed: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  hint: {
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
