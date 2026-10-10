import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { Text, useThemeColor, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import type { UnitPreference } from '@/src/api/users';
import type { WorkoutSet } from '@/src/api/workouts';
import { useDeleteSet, useLastSets, useLogSet } from '@/src/training/useWorkout';
import {
  describeSet,
  parseSetEntry,
  suggestNextSet,
  type ExerciseGroup,
} from '@/src/training/workoutModel';
import { toEntryWeight, UNIT_LABEL } from '@/src/units/weight';

type ExerciseCardProps = {
  workoutId: string;
  group: ExerciseGroup;
  unit: UnitPreference;
};

const NO_SETS: WorkoutSet[] = [];
const PLACEHOLDER_COLOR = '#888';
const DELETE_HIT_SLOP = 8;

/** One exercise in the workout: its logged sets and the form for the next one. */
export function ExerciseCard({ workoutId, group, unit }: ExerciseCardProps) {
  const textColor = useThemeColor({}, 'text');
  const lastSets = useLastSets(group.exercise.id);
  const logSet = useLogSet(workoutId);
  const deleteSet = useDeleteSet(workoutId);
  // null means "not typed in yet", so the field shows the suggested value.
  const [weightText, setWeightText] = useState<string | null>(null);
  const [repsText, setRepsText] = useState<string | null>(null);
  const [rpeText, setRpeText] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  const lastTimeSets = lastSets.data?.sets ?? NO_SETS;
  const suggestion = suggestNextSet(group.sets, lastTimeSets);
  const shownWeight =
    weightText ?? (suggestion ? String(toEntryWeight(suggestion.weightKg, unit)) : '');
  const shownReps = repsText ?? (suggestion ? String(suggestion.reps) : '');

  const requestError = logSet.error ?? deleteSet.error;
  const errorMessage =
    entryError ?? (requestError ? userMessage(requestError, "Couldn't save. Try again.") : null);

  function handleLogSet() {
    const parsed = parseSetEntry({ weightText: shownWeight, repsText: shownReps, rpeText }, unit);
    if (!parsed.ok) {
      setEntryError(parsed.message);
      return;
    }
    setEntryError(null);
    logSet.mutate(
      {
        exerciseId: group.exercise.id,
        reps: parsed.reps,
        weightKg: parsed.weightKg,
        rpe: parsed.rpe,
      },
      {
        // Back to "not typed in", so the form now suggests the set just logged.
        onSuccess: () => {
          setWeightText(null);
          setRepsText(null);
          setRpeText('');
        },
      }
    );
  }

  const inputStyle = [styles.input, { color: textColor }];

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{group.exercise.name}</Text>
      {lastTimeSets.length > 0 ? (
        <Text style={styles.lastTime}>
          Last time: {lastTimeSets.map((set) => describeSet(set, unit)).join(', ')}
        </Text>
      ) : null}

      {group.sets.map((set, index) => (
        <View key={set.id} style={styles.setRow}>
          <Text style={styles.setNumber}>{index + 1}</Text>
          <Text style={styles.setText}>{describeSet(set, unit)}</Text>
          <Pressable
            onPress={() => deleteSet.mutate(set.id)}
            disabled={deleteSet.isPending}
            hitSlop={DELETE_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={`Delete set ${index + 1} of ${group.exercise.name}`}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.form}>
        <TextInput
          style={inputStyle}
          value={shownWeight}
          onChangeText={setWeightText}
          keyboardType="decimal-pad"
          placeholder={UNIT_LABEL[unit]}
          placeholderTextColor={PLACEHOLDER_COLOR}
          accessibilityLabel={`Weight in ${UNIT_LABEL[unit]}`}
        />
        <TextInput
          style={inputStyle}
          value={shownReps}
          onChangeText={setRepsText}
          keyboardType="number-pad"
          placeholder="reps"
          placeholderTextColor={PLACEHOLDER_COLOR}
          accessibilityLabel="Reps"
        />
        <TextInput
          style={inputStyle}
          value={rpeText}
          onChangeText={setRpeText}
          keyboardType="decimal-pad"
          placeholder="RPE"
          placeholderTextColor={PLACEHOLDER_COLOR}
          accessibilityLabel="RPE, optional"
        />
        <Button label="Log set" onPress={handleLogSet} disabled={logSet.isPending} />
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  lastTime: {
    fontSize: 14,
    opacity: 0.7,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setNumber: {
    width: 20,
    fontSize: 16,
    opacity: 0.6,
  },
  setText: {
    flex: 1,
    fontSize: 16,
  },
  delete: {
    fontSize: 14,
    color: '#c0392b',
  },
  form: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  error: {
    fontSize: 14,
    color: '#c0392b',
  },
});
