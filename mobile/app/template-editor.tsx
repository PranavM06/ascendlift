import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/Button';
import { Text, useThemeColor, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import {
  changeDraftExercise,
  moveDraftExercise,
  parseDraft,
  removeDraftExercise,
  setDraftName,
  setDraftNotes,
  useTemplateDraft,
  type DraftExercise,
} from '@/src/training/templateDraft';
import { useDeleteTemplate, useSaveTemplate } from '@/src/training/useTemplates';

const MAX_NAME_LENGTH = 100;
const MAX_NOTES_LENGTH = 2000;
const PLACEHOLDER_COLOR = '#888';
const ACTION_HIT_SLOP = 6;

type PlanFieldProps = {
  label: string;
  accessibilityLabel: string;
  value: string;
  onChangeText: (text: string) => void;
};

function PlanField({ label, accessibilityLabel, value, onChangeText }: PlanFieldProps) {
  const textColor = useThemeColor({}, 'text');
  return (
    <View style={styles.planField}>
      <Text style={styles.planLabel}>{label}</Text>
      <TextInput
        style={[styles.planInput, { color: textColor }]}
        value={value}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

function RowAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={ACTION_HIT_SLOP} accessibilityRole="button">
      <Text style={styles.action}>{label}</Text>
    </Pressable>
  );
}

function PlannedExerciseRow({ planned }: { planned: DraftExercise }) {
  const { id, name } = planned.exercise;
  return (
    <View style={styles.card}>
      <Text style={styles.exercise}>{name}</Text>
      <View style={styles.row}>
        <PlanField
          label="Sets"
          accessibilityLabel={`Sets for ${name}`}
          value={planned.targetSetsText}
          onChangeText={(text) => changeDraftExercise(id, { targetSetsText: text })}
        />
        <PlanField
          label="Reps from"
          accessibilityLabel={`Lowest reps for ${name}`}
          value={planned.repMinText}
          onChangeText={(text) => changeDraftExercise(id, { repMinText: text })}
        />
        <PlanField
          label="Reps to"
          accessibilityLabel={`Highest reps for ${name}`}
          value={planned.repMaxText}
          onChangeText={(text) => changeDraftExercise(id, { repMaxText: text })}
        />
      </View>
      <View style={styles.row}>
        <RowAction label={`Move ${name} up`} onPress={() => moveDraftExercise(id, -1)} />
        <RowAction label={`Move ${name} down`} onPress={() => moveDraftExercise(id, 1)} />
        <RowAction label={`Remove ${name}`} onPress={() => removeDraftExercise(id)} />
      </View>
    </View>
  );
}

/**
 * Edits the template draft. Whoever opens this screen loads the draft first:
 * an existing template to edit it, or an empty draft to create one.
 */
export default function TemplateEditorScreen() {
  const textColor = useThemeColor({}, 'text');
  const draft = useTemplateDraft();
  const save = useSaveTemplate();
  const remove = useDeleteTemplate();
  const [formError, setFormError] = useState<string | null>(null);

  const isBusy = save.isPending || remove.isPending;
  const requestError = save.error ?? remove.error;
  const errorMessage =
    formError ?? (requestError ? userMessage(requestError, "Couldn't save. Try again.") : null);

  // The failure is shown through the mutation's error state.
  function leaveAfter(request: Promise<unknown>) {
    request.then(
      () => router.back(),
      () => undefined
    );
  }

  function handleSave() {
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      setFormError(parsed.message);
      return;
    }
    setFormError(null);
    leaveAfter(save.mutateAsync({ templateId: draft.templateId, content: parsed.content }));
  }

  function confirmDelete(templateId: string) {
    Alert.alert('Delete template?', 'Workouts already started from it are kept.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => leaveAfter(remove.mutateAsync(templateId)),
      },
    ]);
  }

  const inputStyle = [styles.input, { color: textColor }];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextInput
        style={inputStyle}
        value={draft.name}
        onChangeText={setDraftName}
        maxLength={MAX_NAME_LENGTH}
        placeholder="Template name, e.g. Push Day"
        placeholderTextColor={PLACEHOLDER_COLOR}
        autoCapitalize="words"
        accessibilityLabel="Template name"
      />
      <TextInput
        style={[inputStyle, styles.notes]}
        value={draft.notes}
        onChangeText={setDraftNotes}
        maxLength={MAX_NOTES_LENGTH}
        placeholder="Notes (optional)"
        placeholderTextColor={PLACEHOLDER_COLOR}
        multiline
        accessibilityLabel="Notes"
      />

      {draft.exercises.map((planned) => (
        <PlannedExerciseRow key={planned.exercise.id} planned={planned} />
      ))}
      <Button
        label="Add exercise"
        onPress={() => router.push({ pathname: '/exercise-picker', params: { target: 'template' } })}
      />

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      <Button
        label={save.isPending ? 'Saving…' : 'Save template'}
        variant="primary"
        onPress={handleSave}
        disabled={isBusy}
      />
      {draft.templateId !== null ? (
        <Button
          label="Delete template"
          variant="danger"
          onPress={() => confirmDelete(draft.templateId ?? '')}
          disabled={isBusy}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
  },
  notes: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 10,
  },
  exercise: {
    fontSize: 17,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  planField: {
    flex: 1,
    gap: 4,
  },
  planLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  planInput: {
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  action: {
    fontSize: 14,
    opacity: 0.8,
    textDecorationLine: 'underline',
  },
  error: {
    fontSize: 15,
    color: '#c0392b',
  },
});
