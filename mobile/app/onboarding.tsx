import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { ChoiceList } from '@/components/onboarding/ChoiceList';
import { NumberField } from '@/components/onboarding/NumberField';
import { Text, View } from '@/components/Themed';
import { userMessage } from '@/src/api/http';
import type { Phase, TrainingStyle } from '@/src/api/onboarding';
import type { UnitPreference } from '@/src/api/users';
import {
  deviceTimezone,
  describeMacroCalories,
  EMPTY_TARGET_TEXTS,
  ONBOARDING_STEPS,
  parseBodyweight,
  parseTargets,
  PHASE_CHOICES,
  TRAINING_STYLE_CHOICES,
  UNIT_CHOICES,
  type OnboardingStep,
  type TargetTexts,
} from '@/src/onboarding/onboardingModel';
import { useCompleteOnboarding } from '@/src/onboarding/useOnboarding';
import { useUnitPreference } from '@/src/units/useUnitPreference';
import { UNIT_LABEL } from '@/src/units/weight';

const STEP_TEXT: Record<OnboardingStep, { title: string; subtitle: string }> = {
  units: { title: 'Pick your units', subtitle: 'Every weight in the app is shown in this unit.' },
  goal: { title: 'What are you training for?', subtitle: 'Your daily insights are based on this.' },
  targets: { title: 'Daily targets', subtitle: 'The calories and macros you aim for each day.' },
  bodyweight: { title: 'Starting bodyweight', subtitle: 'Your bodyweight trend starts here.' },
};
const BODYWEIGHT_PLACEHOLDER: Record<UnitPreference, string> = { lbs: '180', kg: '80' };

export default function OnboardingScreen() {
  const profileUnit = useUnitPreference();
  const [stepIndex, setStepIndex] = useState(0);
  const [unit, setUnit] = useState<UnitPreference>(profileUnit);
  const [trainingStyle, setTrainingStyle] = useState<TrainingStyle | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [targetTexts, setTargetTexts] = useState<TargetTexts>(EMPTY_TARGET_TEXTS);
  const [bodyweightText, setBodyweightText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const complete = useCompleteOnboarding();

  const step = ONBOARDING_STEPS[stepIndex];
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;
  // Saving twice is harmless, since the second save replaces the same answers.
  const isSaving = complete.isPending || complete.isSuccess;
  const canContinue = step !== 'goal' || (trainingStyle !== null && phase !== null);
  const errorMessage =
    formError ??
    (complete.error ? userMessage(complete.error, "Couldn't save your answers. Try again.") : null);

  function goToStep(index: number) {
    setFormError(null);
    complete.reset();
    setStepIndex(index);
  }

  function updateTarget(field: keyof TargetTexts, text: string) {
    setFormError(null);
    setTargetTexts((texts) => ({ ...texts, [field]: text }));
  }

  function finish() {
    const targets = parseTargets(targetTexts);
    const bodyweight = parseBodyweight(bodyweightText, unit);
    if (!bodyweight.ok) {
      setFormError(bodyweight.message);
      return;
    }
    // The earlier steps cannot be passed without these; this only narrows the types.
    if (!targets.ok || trainingStyle === null || phase === null) {
      return;
    }
    setFormError(null);
    complete.mutate({
      unitPreference: unit,
      timezone: deviceTimezone(),
      trainingStyle,
      phase,
      targets: targets.value,
      bodyweightKg: bodyweight.value,
    });
  }

  function handleContinue() {
    if (step === 'targets') {
      const targets = parseTargets(targetTexts);
      if (!targets.ok) {
        setFormError(targets.message);
        return;
      }
    }
    if (isLastStep) {
      finish();
    } else {
      goToStep(stepIndex + 1);
    }
  }

  function renderStep() {
    switch (step) {
      case 'units':
        return (
          <ChoiceList label="Units" choices={UNIT_CHOICES} selected={unit} onSelect={setUnit} />
        );
      case 'goal':
        return (
          <>
            <Text style={styles.heading}>Training style</Text>
            <ChoiceList
              label="Training style"
              choices={TRAINING_STYLE_CHOICES}
              selected={trainingStyle}
              onSelect={setTrainingStyle}
            />
            <Text style={styles.heading}>Phase</Text>
            <ChoiceList label="Phase" choices={PHASE_CHOICES} selected={phase} onSelect={setPhase} />
          </>
        );
      case 'targets': {
        const macroHint = describeMacroCalories(targetTexts);
        return (
          <>
            <NumberField
              label="Calories"
              unit="kcal"
              value={targetTexts.calories}
              onChangeText={(text) => updateTarget('calories', text)}
              placeholder="2400"
            />
            <NumberField
              label="Protein"
              unit="g"
              value={targetTexts.proteinG}
              onChangeText={(text) => updateTarget('proteinG', text)}
              placeholder="180"
            />
            <NumberField
              label="Carbs"
              unit="g"
              value={targetTexts.carbsG}
              onChangeText={(text) => updateTarget('carbsG', text)}
              placeholder="250"
            />
            <NumberField
              label="Fat"
              unit="g"
              value={targetTexts.fatG}
              onChangeText={(text) => updateTarget('fatG', text)}
              placeholder="70"
            />
            {macroHint ? <Text style={styles.hint}>{macroHint}</Text> : null}
          </>
        );
      }
      case 'bodyweight':
        return (
          <NumberField
            label="Bodyweight"
            unit={UNIT_LABEL[unit]}
            value={bodyweightText}
            onChangeText={(text) => {
              setFormError(null);
              setBodyweightText(text);
            }}
            placeholder={BODYWEIGHT_PLACEHOLDER[unit]}
            keyboardType="decimal-pad"
          />
        );
    }
  }

  const continueLabel = !isLastStep ? 'Continue' : isSaving ? 'Saving…' : 'Finish';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Text style={styles.progress}>
        Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
      </Text>
      <Text style={styles.title} accessibilityRole="header">
        {STEP_TEXT[step].title}
      </Text>
      <Text style={styles.subtitle}>{STEP_TEXT[step].subtitle}</Text>

      {renderStep()}

      {errorMessage ? (
        <Text style={styles.error} accessibilityRole="alert">
          {errorMessage}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {stepIndex > 0 ? (
          <View style={styles.action}>
            <Button label="Back" onPress={() => goToStep(stepIndex - 1)} disabled={isSaving} />
          </View>
        ) : null}
        <View style={styles.action}>
          <Button
            label={continueLabel}
            variant="primary"
            onPress={handleContinue}
            disabled={!canContinue || isSaving}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  progress: {
    fontSize: 14,
    opacity: 0.6,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 4,
  },
  heading: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 14,
    opacity: 0.7,
  },
  error: {
    fontSize: 15,
    color: '#c0392b',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  action: {
    flex: 1,
  },
});
