import { authorizedRequest } from '@/src/api/authorized';
import { jsonPost } from '@/src/api/http';
import type { Targets } from '@/src/api/targets';
import { toUserProfile, type UnitPreference, type UserProfile } from '@/src/api/users';

// The values the backend accepts; see TrainingStyle and Phase in its enums.
export const TRAINING_STYLES = ['powerlifting', 'bodybuilding', 'general_strength'] as const;
export const PHASES = ['cut', 'maintain', 'bulk'] as const;

export type TrainingStyle = (typeof TRAINING_STYLES)[number];
export type Phase = (typeof PHASES)[number];

/** Everything a new user is asked before they start. */
export type OnboardingAnswers = {
  unitPreference: UnitPreference;
  /** IANA name, e.g. "America/Chicago". */
  timezone: string;
  trainingStyle: TrainingStyle;
  phase: Phase;
  targets: Targets;
  bodyweightKg: number;
};

/** Saves the answers and returns the profile, now marked onboarded. Safe to retry. */
export async function completeOnboarding(answers: OnboardingAnswers): Promise<UserProfile> {
  const body = {
    unit_preference: answers.unitPreference,
    timezone: answers.timezone,
    training_style: answers.trainingStyle,
    phase: answers.phase,
    targets: {
      calories: answers.targets.calories,
      protein_g: answers.targets.proteinG,
      carbs_g: answers.targets.carbsG,
      fat_g: answers.targets.fatG,
    },
    bodyweight_kg: answers.bodyweightKg,
  };
  return toUserProfile(await authorizedRequest('/onboarding', jsonPost(body)));
}
