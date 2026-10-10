import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { SetFields } from '@/components/training/SetFields';
import { SetRow } from '@/components/training/SetRow';
import { userMessage } from '@/src/api/http';
import type { TemplateExercise } from '@/src/api/templates';
import type { UnitPreference } from '@/src/api/users';
import type { WorkoutSet } from '@/src/api/workouts';
import { startRest } from '@/src/training/restTimer';
import { useLastSets, useLogSet, useRecords } from '@/src/training/useWorkout';
import {
  describePlan,
  describeRecords,
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
  /** What the workout's template asks for on this exercise, if anything. */
  plan?: TemplateExercise;
};

const NO_SETS: WorkoutSet[] = [];

/** One exercise in the workout: its logged sets and the form for the next one. */
export function ExerciseCard({ workoutId, group, unit, plan }: ExerciseCardProps) {
  const lastSets = useLastSets(group.exercise.id);
  const records = useRecords(group.exercise.id);
  const logSet = useLogSet(workoutId);
  // null means "not typed in yet", so the field shows the suggested value.
  const [weightText, setWeightText] = useState<string | null>(null);
  const [repsText, setRepsText] = useState<string | null>(null);
  const [rpeText, setRpeText] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [requestedEditId, setRequestedEditId] = useState<string | null>(null);
  // A set can vanish while it is being edited, such as when it is deleted from
  // another device. Then nothing is being edited any more.
  const editingSetId = group.sets.some((set) => set.id === requestedEditId)
    ? requestedEditId
    : null;

  const recordsLine = records.data ? describeRecords(records.data, unit) : null;
  const lastTimeSets = lastSets.data?.sets ?? NO_SETS;
  // With no history to go on, a template's plan is the starting point: its
  // target weight if it has one, and the low end of its rep range.
  const plannedSet =
    plan && plan.targetWeightKg !== null
      ? { weightKg: plan.targetWeightKg, reps: plan.repMin }
      : null;
  const suggestion = suggestNextSet(group.sets, lastTimeSets) ?? plannedSet;
  const shownWeight =
    weightText ?? (suggestion ? String(toEntryWeight(suggestion.weightKg, unit)) : '');
  const suggestedReps = suggestion?.reps ?? plan?.repMin;
  const shownReps = repsText ?? (suggestedReps === undefined ? '' : String(suggestedReps));

  const errorMessage =
    entryError ?? (logSet.error ? userMessage(logSet.error, "Couldn't save. Try again.") : null);

  function handleLogSet() {
    const parsed = parseSetEntry({ weightText: shownWeight, repsText: shownReps, rpeText }, unit);
    if (!parsed.ok) {
      setEntryError(parsed.message);
      return;
    }
    setEntryError(null);
    // The field shows two decimals, so a suggested weight that was not retyped
    // is sent as stored rather than converted back from that rounded text.
    const weightKg = weightText === null && suggestion ? suggestion.weightKg : parsed.weightKg;
    logSet.mutate(
      { exerciseId: group.exercise.id, reps: parsed.reps, weightKg, rpe: parsed.rpe },
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
      {plan ? <Text style={styles.lastTime}>{describePlan(plan, unit)}</Text> : null}
      {recordsLine ? <Text style={styles.lastTime}>{recordsLine}</Text> : null}
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
          onStartEdit={() => setRequestedEditId(set.id)}
          onStopEdit={() => setRequestedEditId(null)}
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
