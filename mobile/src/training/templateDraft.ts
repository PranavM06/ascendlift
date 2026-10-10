import { create } from 'zustand';

import type { Template, TemplateContent } from '@/src/api/templates';
import type { ExerciseRef } from '@/src/api/workouts';

/** One exercise in the editor. The plan fields hold the text exactly as typed. */
export type DraftExercise = {
  exercise: ExerciseRef;
  targetSetsText: string;
  repMinText: string;
  repMaxText: string;
  // The editor has no fields for these yet; they are carried through unchanged
  // so that saving a template does not drop targets it already had.
  targetWeightKg: number | null;
  targetRpe: number | null;
};

export type TemplateDraft = {
  /** The template being edited; null while creating a new one. */
  templateId: string | null;
  name: string;
  notes: string;
  /** In the order the exercises are performed. */
  exercises: DraftExercise[];
};

export type EditablePlan = Pick<DraftExercise, 'targetSetsText' | 'repMinText' | 'repMaxText'>;

export type ParsedDraft = { ok: true; content: TemplateContent } | { ok: false; message: string };

// The same limits the backend enforces, checked here so the form can explain.
const MAX_TARGET_SETS = 20;
const MAX_TARGET_REPS = 100;
const WHOLE_NUMBER_PATTERN = /^\d+$/;
/** A common hypertrophy plan, used until the user types their own. */
const DEFAULT_PLAN: EditablePlan = { targetSetsText: '3', repMinText: '8', repMaxText: '12' };

const EMPTY_DRAFT: TemplateDraft = { templateId: null, name: '', notes: '', exercises: [] };

/**
 * The template being created or edited. It lives outside the editor screen so
 * the exercise picker, a separate screen, can add to it.
 */
export const useTemplateDraft = create<TemplateDraft>(() => EMPTY_DRAFT);

/** Begins editing the given template, or a new one when given null. */
export function startDraft(template: Template | null): void {
  if (template === null) {
    useTemplateDraft.setState(EMPTY_DRAFT);
    return;
  }
  useTemplateDraft.setState({
    templateId: template.id,
    name: template.name,
    notes: template.notes ?? '',
    exercises: template.exercises.map((planned) => ({
      exercise: planned.exercise,
      targetSetsText: String(planned.targetSets),
      repMinText: String(planned.repMin),
      repMaxText: String(planned.repMax),
      targetWeightKg: planned.targetWeightKg,
      targetRpe: planned.targetRpe,
    })),
  });
}

export function setDraftName(name: string): void {
  useTemplateDraft.setState({ name });
}

export function setDraftNotes(notes: string): void {
  useTemplateDraft.setState({ notes });
}

/** Adds the exercise at the end; one already in the draft is left as it is. */
export function addDraftExercise(exercise: ExerciseRef): void {
  useTemplateDraft.setState((draft) => {
    if (draft.exercises.some((planned) => planned.exercise.id === exercise.id)) {
      return draft;
    }
    const added = { exercise, ...DEFAULT_PLAN, targetWeightKg: null, targetRpe: null };
    return { exercises: [...draft.exercises, added] };
  });
}

export function changeDraftExercise(exerciseId: string, changes: Partial<EditablePlan>): void {
  useTemplateDraft.setState((draft) => ({
    exercises: draft.exercises.map((planned) =>
      planned.exercise.id === exerciseId ? { ...planned, ...changes } : planned
    ),
  }));
}

export function removeDraftExercise(exerciseId: string): void {
  useTemplateDraft.setState((draft) => ({
    exercises: draft.exercises.filter((planned) => planned.exercise.id !== exerciseId),
  }));
}

/** Moves the exercise one place earlier (-1) or later (1), if there is room. */
export function moveDraftExercise(exerciseId: string, offset: -1 | 1): void {
  useTemplateDraft.setState((draft) => {
    const from = draft.exercises.findIndex((planned) => planned.exercise.id === exerciseId);
    const to = from + offset;
    if (from === -1 || to < 0 || to >= draft.exercises.length) {
      return draft;
    }
    const others = draft.exercises.filter((_planned, index) => index !== from);
    return { exercises: [...others.slice(0, to), draft.exercises[from], ...others.slice(to)] };
  });
}

function parseCount(text: string, max: number): number | null {
  const trimmed = text.trim();
  const count = Number(trimmed);
  return WHOLE_NUMBER_PATTERN.test(trimmed) && count >= 1 && count <= max ? count : null;
}

/** The first problem with one exercise's plan, or null when it is fine. */
function findPlanProblem(planned: DraftExercise): string | null {
  const targetSets = parseCount(planned.targetSetsText, MAX_TARGET_SETS);
  const repMin = parseCount(planned.repMinText, MAX_TARGET_REPS);
  const repMax = parseCount(planned.repMaxText, MAX_TARGET_REPS);
  if (targetSets === null) {
    return `sets must be a whole number from 1 to ${MAX_TARGET_SETS}.`;
  }
  if (repMin === null || repMax === null) {
    return `reps must be whole numbers from 1 to ${MAX_TARGET_REPS}.`;
  }
  return repMin > repMax ? 'the lower rep target is above the upper one.' : null;
}

/** Reads the draft into what the backend expects, or says what is wrong with it. */
export function parseDraft(draft: TemplateDraft): ParsedDraft {
  const name = draft.name.trim();
  if (name === '') {
    return { ok: false, message: 'Give the template a name.' };
  }
  if (draft.exercises.length === 0) {
    return { ok: false, message: 'Add at least one exercise.' };
  }
  const invalid = draft.exercises.find((planned) => findPlanProblem(planned) !== null);
  if (invalid) {
    return { ok: false, message: `${invalid.exercise.name}: ${findPlanProblem(invalid)}` };
  }
  return {
    ok: true,
    content: {
      name,
      notes: draft.notes.trim() || null,
      exercises: draft.exercises.map((planned) => ({
        exerciseId: planned.exercise.id,
        targetSets: Number(planned.targetSetsText),
        repMin: Number(planned.repMinText),
        repMax: Number(planned.repMaxText),
        targetWeightKg: planned.targetWeightKg,
        targetRpe: planned.targetRpe,
      })),
    },
  };
}
