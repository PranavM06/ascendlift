import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Text, useThemeColor, View } from '@/components/Themed';
import {
  createExercise,
  EQUIPMENT,
  EXERCISES_QUERY_KEY,
  MAX_EXERCISE_NAME_LENGTH,
  MUSCLE_GROUPS,
  readableLabel,
} from '@/src/api/exercises';
import { userMessage } from '@/src/api/http';
import { deliverPick, toPickTarget } from '@/src/training/pickedExercises';
import { useActiveWorkout } from '@/src/training/useWorkout';

const PLACEHOLDER_COLOR = '#888';

export default function NewExerciseScreen() {
  const textColor = useThemeColor({}, 'text');
  const params = useLocalSearchParams<{ name?: string; target?: string }>();
  const queryClient = useQueryClient();
  const activeWorkout = useActiveWorkout();
  const [name, setName] = useState(typeof params.name === 'string' ? params.name : '');
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const workoutId = activeWorkout.data?.id;
  const create = useMutation({
    mutationFn: createExercise,
    onSuccess: (exercise) => {
      void queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      const target = toPickTarget(params.target);
      deliverPick(target, { id: exercise.id, name: exercise.name }, workoutId);
      router.back();
    },
  });

  function toggleMuscleGroup(muscleGroup: string) {
    setMuscleGroups((current) =>
      current.includes(muscleGroup)
        ? current.filter((selected) => selected !== muscleGroup)
        : [...current, muscleGroup]
    );
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setFormError('Give the exercise a name.');
      return;
    }
    if (muscleGroups.length === 0) {
      setFormError('Choose at least one muscle group.');
      return;
    }
    setFormError(null);
    create.mutate({ name: trimmedName, muscleGroups, equipment });
  }

  const errorMessage =
    formError ??
    (create.error ? userMessage(create.error, "Couldn't save the exercise. Try again.") : null);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Name</Text>
      <TextInput
        style={[styles.name, { color: textColor }]}
        value={name}
        onChangeText={setName}
        maxLength={MAX_EXERCISE_NAME_LENGTH}
        placeholder="e.g. Sled Drag"
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="words"
        accessibilityLabel="Exercise name"
      />

      <Text style={styles.heading}>Muscle groups</Text>
      <Text style={styles.hint}>Choose the main one first.</Text>
      <View style={styles.chips}>
        {MUSCLE_GROUPS.map((muscleGroup) => (
          <Chip
            key={muscleGroup}
            label={readableLabel(muscleGroup)}
            isSelected={muscleGroups.includes(muscleGroup)}
            onPress={() => toggleMuscleGroup(muscleGroup)}
          />
        ))}
      </View>

      <Text style={styles.heading}>Equipment (optional)</Text>
      <View style={styles.chips}>
        {EQUIPMENT.map((item) => (
          <Chip
            key={item}
            label={readableLabel(item)}
            isSelected={equipment === item}
            onPress={() => setEquipment(equipment === item ? null : item)}
          />
        ))}
      </View>

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      <Button
        label={create.isPending ? 'Saving…' : 'Save exercise'}
        variant="primary"
        onPress={handleSave}
        disabled={create.isPending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 10,
  },
  heading: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    opacity: 0.6,
  },
  name: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  error: {
    fontSize: 15,
    color: '#c0392b',
  },
});
