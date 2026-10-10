import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { SetFields } from '@/components/training/SetFields';
import { userMessage } from '@/src/api/http';
import type { UnitPreference } from '@/src/api/users';
import type { WorkoutSet } from '@/src/api/workouts';
import { useDeleteSet, useUpdateSet } from '@/src/training/useWorkout';
import { describeSet, parseSetEntry } from '@/src/training/workoutModel';
import { toEntryWeight } from '@/src/units/weight';

type SetRowProps = {
  workoutId: string;
  set: WorkoutSet;
  /** The set's number within its exercise, starting at 1. */
  number: number;
  unit: UnitPreference;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
};

type SetEditorProps = Pick<SetRowProps, 'workoutId' | 'set' | 'unit' | 'onStopEdit'>;

const DELETE_HIT_SLOP = 8;

/** The form shown in place of a set while it is being edited. */
function SetEditor({ workoutId, set, unit, onStopEdit }: SetEditorProps) {
  const updateSet = useUpdateSet(workoutId);
  const initialWeightText = String(toEntryWeight(set.weightKg, unit));
  const [weightText, setWeightText] = useState(initialWeightText);
  const [repsText, setRepsText] = useState(String(set.reps));
  const [rpeText, setRpeText] = useState(set.rpe === null ? '' : String(set.rpe));
  const [entryError, setEntryError] = useState<string | null>(null);

  const errorMessage =
    entryError ??
    (updateSet.error ? userMessage(updateSet.error, "Couldn't save. Try again.") : null);

  function handleSave() {
    const parsed = parseSetEntry({ weightText, repsText, rpeText }, unit);
    if (!parsed.ok) {
      setEntryError(parsed.message);
      return;
    }
    setEntryError(null);
    // The field shows two decimals, so a weight that was not retyped is sent
    // as stored rather than converted back from that rounded text.
    const weightKg = weightText === initialWeightText ? set.weightKg : parsed.weightKg;
    updateSet.mutate(
      { setId: set.id, changes: { reps: parsed.reps, weightKg, rpe: parsed.rpe } },
      { onSuccess: onStopEdit }
    );
  }

  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <SetFields
          unit={unit}
          weightText={weightText}
          repsText={repsText}
          rpeText={rpeText}
          onChangeWeight={setWeightText}
          onChangeReps={setRepsText}
          onChangeRpe={setRpeText}
        />
      </View>
      <View style={styles.row}>
        <Button label="Save" variant="primary" onPress={handleSave} disabled={updateSet.isPending} />
        <Button label="Cancel" onPress={onStopEdit} disabled={updateSet.isPending} />
      </View>
      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

/** One logged set. Tapping it opens it for editing. */
export function SetRow({
  workoutId,
  set,
  number,
  unit,
  isEditing,
  onStartEdit,
  onStopEdit,
}: SetRowProps) {
  const deleteSet = useDeleteSet(workoutId);

  if (isEditing) {
    return <SetEditor workoutId={workoutId} set={set} unit={unit} onStopEdit={onStopEdit} />;
  }

  return (
    <View style={styles.editor}>
      <View style={styles.row}>
        <Pressable
          style={styles.summary}
          onPress={onStartEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit set ${number} of ${set.exercise.name}`}>
          <Text style={styles.number}>{number}</Text>
          <Text style={styles.text}>{describeSet(set, unit)}</Text>
        </Pressable>
        <Pressable
          onPress={() => deleteSet.mutate(set.id)}
          disabled={deleteSet.isPending}
          hitSlop={DELETE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Delete set ${number} of ${set.exercise.name}`}>
          <Text style={styles.delete}>Delete</Text>
        </Pressable>
      </View>
      {deleteSet.error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(deleteSet.error, "Couldn't delete. Try again.")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  number: {
    width: 20,
    fontSize: 16,
    opacity: 0.6,
  },
  text: {
    flex: 1,
    fontSize: 16,
  },
  delete: {
    fontSize: 14,
    color: '#c0392b',
  },
  error: {
    fontSize: 14,
    color: '#c0392b',
  },
});
