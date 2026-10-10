import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import type { Template } from '@/src/api/templates';
import { startDraft } from '@/src/training/templateDraft';
import { useTemplates } from '@/src/training/useTemplates';
import { useActiveWorkout, useStartWorkout } from '@/src/training/useWorkout';

function describeProgress(setCount: number): string {
  return setCount === 1 ? '1 set logged so far.' : `${setCount} sets logged so far.`;
}

function describeTemplate(template: Template): string {
  return template.exercises.map((planned) => planned.exercise.name).join(', ');
}

/** Loads the template into the editor's draft (or an empty draft) and opens it. */
function openEditor(template: Template | null) {
  startDraft(template);
  router.push('/template-editor');
}

type TemplateRowProps = {
  template: Template;
  /** Null while a workout is in progress, when another cannot be started. */
  onStart: (() => void) | null;
  isStartDisabled: boolean;
};

function TemplateRow({ template, onStart, isStartDisabled }: TemplateRowProps) {
  return (
    <View style={styles.templateRow}>
      <Pressable
        style={styles.templateText}
        onPress={() => openEditor(template)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${template.name}`}>
        <Text style={styles.templateName}>{template.name}</Text>
        <Text style={styles.detail}>{describeTemplate(template)}</Text>
      </Pressable>
      {onStart ? (
        <Pressable
          onPress={onStart}
          disabled={isStartDisabled}
          accessibilityRole="button"
          accessibilityLabel={`Start ${template.name}`}>
          <Text style={styles.start}>Start</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function TrainingScreen() {
  const activeWorkout = useActiveWorkout();
  const templates = useTemplates();
  const start = useStartWorkout();

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
          {userMessage(activeWorkout.error, "Couldn't load your training.")}
        </Text>
        <Button label="Try again" onPress={() => activeWorkout.refetch()} />
      </View>
    );
  }

  const workout = activeWorkout.data;

  /** Starts a blank workout, or one from the template whose id is given. */
  function startWorkout(templateId?: string) {
    start.mutate(templateId, { onSuccess: () => router.push('/workout') });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {workout !== null ? (
        <>
          <Text style={styles.title}>Workout in progress</Text>
          <Text style={styles.detail}>{describeProgress(workout.sets.length)}</Text>
          <Button
            label="Resume workout"
            variant="primary"
            onPress={() => router.push('/workout')}
          />
        </>
      ) : (
        <>
          <Text style={styles.title}>Ready to lift?</Text>
          <Button
            label={start.isPending ? 'Starting…' : 'Start blank workout'}
            variant="primary"
            onPress={() => startWorkout()}
            disabled={start.isPending}
          />
        </>
      )}
      {start.isError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(start.error, "Couldn't start a workout. Try again.")}
        </Text>
      ) : null}

      <Text style={styles.heading}>Templates</Text>
      {templates.isPending ? <ActivityIndicator /> : null}
      {templates.isError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {userMessage(templates.error, "Couldn't load your templates.")}
        </Text>
      ) : null}
      {templates.isSuccess && templates.data.length === 0 ? (
        <Text style={styles.detail}>
          No templates yet. Save a routine such as “Push Day” to start it with one tap.
        </Text>
      ) : null}
      {templates.data?.map((template) => (
        <TemplateRow
          key={template.id}
          template={template}
          onStart={workout === null ? () => startWorkout(template.id) : null}
          isStartDisabled={start.isPending}
        />
      ))}
      <Button label="New template" onPress={() => openEditor(null)} />

      <Text style={styles.heading}>Past workouts</Text>
      <Button label="History" onPress={() => router.push('/history')} />
    </ScrollView>
  );
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
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  heading: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
  },
  detail: {
    fontSize: 15,
    opacity: 0.7,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
  },
  templateText: {
    flex: 1,
    gap: 4,
  },
  templateName: {
    fontSize: 17,
    fontWeight: '600',
  },
  start: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f95dc',
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
    color: '#c0392b',
  },
});
