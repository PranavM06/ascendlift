import { authorizedRequest } from '@/src/api/authorized';
import { isRecord, jsonPost, jsonPut, unexpectedResponse } from '@/src/api/http';
import { toExerciseRef, toNumber, type ExerciseRef } from '@/src/api/workouts';

/** One exercise of a template: how many sets, and the rep range to aim for. */
export type TemplateExercise = {
  id: string;
  exercise: ExerciseRef;
  /** Order within the template, starting at 1. */
  position: number;
  targetSets: number;
  repMin: number;
  repMax: number;
  targetWeightKg: number | null;
  targetRpe: number | null;
};

export type Template = {
  id: string;
  name: string;
  notes: string | null;
  exercises: TemplateExercise[];
};

export type PlannedExercise = Omit<TemplateExercise, 'id' | 'exercise' | 'position'> & {
  exerciseId: string;
};

/** Everything a template holds, as sent when creating or replacing one. */
export type TemplateContent = {
  name: string;
  notes: string | null;
  /** In the order the exercises are performed. */
  exercises: PlannedExercise[];
};

function toNullableNumber(value: unknown): number | null {
  return value === null ? null : toNumber(value);
}

function toTemplateExercise(data: unknown): TemplateExercise {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.position !== 'number' ||
    typeof data.target_sets !== 'number' ||
    typeof data.rep_min !== 'number' ||
    typeof data.rep_max !== 'number'
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    exercise: toExerciseRef(data.exercise),
    position: data.position,
    targetSets: data.target_sets,
    repMin: data.rep_min,
    repMax: data.rep_max,
    targetWeightKg: toNullableNumber(data.target_weight_kg),
    targetRpe: toNullableNumber(data.target_rpe),
  };
}

function toTemplate(data: unknown): Template {
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.name !== 'string' ||
    (data.notes !== null && typeof data.notes !== 'string') ||
    !Array.isArray(data.exercises)
  ) {
    throw unexpectedResponse();
  }
  return {
    id: data.id,
    name: data.name,
    notes: data.notes,
    exercises: data.exercises.map(toTemplateExercise),
  };
}

function toRequestBody(content: TemplateContent) {
  return {
    name: content.name,
    notes: content.notes,
    exercises: content.exercises.map((planned) => ({
      exercise_id: planned.exerciseId,
      target_sets: planned.targetSets,
      rep_min: planned.repMin,
      rep_max: planned.repMax,
      target_weight_kg: planned.targetWeightKg,
      target_rpe: planned.targetRpe,
    })),
  };
}

/** The user's templates, by name. */
export async function fetchTemplates(): Promise<Template[]> {
  const data = await authorizedRequest('/templates');
  if (!Array.isArray(data)) {
    throw unexpectedResponse();
  }
  return data.map(toTemplate);
}

export async function fetchTemplate(templateId: string): Promise<Template> {
  return toTemplate(await authorizedRequest(`/templates/${templateId}`));
}

export async function createTemplate(content: TemplateContent): Promise<Template> {
  return toTemplate(await authorizedRequest('/templates', jsonPost(toRequestBody(content))));
}

/** Swaps the template's name, notes and exercises for the ones given. */
export async function replaceTemplate(
  templateId: string,
  content: TemplateContent
): Promise<Template> {
  return toTemplate(
    await authorizedRequest(`/templates/${templateId}`, jsonPut(toRequestBody(content)))
  );
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await authorizedRequest(`/templates/${templateId}`, { method: 'DELETE' });
}
