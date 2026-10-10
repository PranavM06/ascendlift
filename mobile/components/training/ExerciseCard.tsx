import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { SetFields } from '@/components/training/SetFields';
import { SetRow } from '@/components/training/SetRow';
import { userMessage } from '@/src/api/http';
import type { UnitPreference } from '@/src/api/users';
import type { WorkoutSet } from '@/src/api/workouts';
import { startRest } from '@/src/training/restTimer';
import { useLastSets, useLogSet } from '@/src/training/useWorkout';
import {
  describeSet,
  parseSetEntry,
  suggestNextSet,
  type ExerciseGroup,
} from '@/src/training/workoutModel';
import { toEntryWeight } from '@/src/units/weight';

type ExerciseCardProps = {
  workoutId: string;
  group: ExerciseGroup;
  unit: UnitPreference;
};

const NO_SETS: WorkoutSet[] = [];

/** One exercise in the workout: its logged sets and the form for the next one. */
export function ExerciseCard({ workoutId, group, unit }: ExerciseCardProps) {
  const lastSets = useLastSets(group.exercise.id);
  const logSet = useLogSet(workoutId);
  // null means "not typed in yet", so the field shows the suggested value.
  const [weightText, setWeightText] = useState<string | null>(null);
  const [repsText, setRepsText] = useState<string | null>(null);
  const [rpeText, setRpeText] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const lastTimeSets = lastSets.data?.sets ?? NO_SETS;
  const suggestion = suggestNextSet(group.sets, lastTimeSets);
  const shownWeight =
    weightText ?? (suggestion ? String(toEntryWeight(suggestion.weightKg, unit)) : '');
  const shownReps = repsText ?? (suggestion ? String(suggestion.reps) : '');

  const errorMessage =
    entryError ?? (logSet.error ? userMessage(logSet.error, "Couldn't save. Try again.") : null);

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
        onSuccess: () => {
          // Back to "not typed in", so the form now suggests the set just logged.
          setWeightText(null);
          setRepsText(null);
          setRpeText('');
          startRest(Date.now());
        },
      }
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{group.exercise.name}</Text>
      {lastTimeSets.length > 0 ? (
        <Text style={styles.lastTime}>
          Last time: {lastTimeSets.map((set) => describeSet(set, unit)).join(', ')}
        </Text>
      ) : null}

      {group.sets.map((set, index) => (
        <SetRow
          key={set.id}
          workoutId={workoutId}
          set={set}
          number={index + 1}
          unit={unit}
          isEditing={editingSetId === set.id}
          onStartEdit={() => setEditingSetId(set.id)}
          onStopEdit={() => setEditingSetId(null)}
        />
      ))}

      {/* One form at a time: the new-set form steps aside while a set is edited. */}
      {editingSetId === null ? (
        <View style={styles.form}>
          <SetFields
            unit={unit}
            weightText={shownWeight}
            repsText={shownReps}
            rpeText={rpeText}
            onChangeWeight={setWeightText}
            onChangeReps={setRepsText}
            onChangeRpe={setRpeText}
          />
          <Button label="Log set" onPress={handleLogSet} disabled={logSet.isPending} />
        </View>
      ) : null}

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
  form: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  error: {
    fontSize: 14,
    color: '#c0392b',
  },
});
