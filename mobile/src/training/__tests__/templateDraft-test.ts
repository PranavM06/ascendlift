import type { Template } from '@/src/api/templates';
import {
  addDraftExercise,
  changeDraftExercise,
  moveDraftExercise,
  parseDraft,
  removeDraftExercise,
  setDraftName,
  setDraftNotes,
  startDraft,
  useTemplateDraft,
  type TemplateDraft,
} from '@/src/training/templateDraft';

const SQUAT = { id: 'squat', name: 'Barbell Squat' };
const BENCH = { id: 'bench', name: 'Bench Press' };
const ROW = { id: 'row', name: 'Bent Over Row' };

const LEG_DAY: Template = {
  id: 'template-1',
  name: 'Leg Day',
  notes: 'Belt on.',
  exercises: [
    {
      id: 'item-1',
      exercise: SQUAT,
      position: 1,
      targetSets: 5,
      repMin: 3,
      repMax: 5,
      targetWeightKg: 100,
      targetRpe: 8,
    },
  ],
};

function draftExerciseIds(): string[] {
  return useTemplateDraft.getState().exercises.map((planned) => planned.exercise.id);
}

beforeEach(() => {
  startDraft(null);
});

describe('editing the draft', () => {
  test('a new draft is empty', () => {
    expect(useTemplateDraft.getState()).toEqual({
      templateId: null,
      name: '',
      notes: '',
      exercises: [],
    });
  });

  test('a draft of an existing template starts from its contents', () => {
    // Act
    startDraft(LEG_DAY);

    // Assert
    expect(useTemplateDraft.getState()).toEqual({
      templateId: 'template-1',
      name: 'Leg Day',
      notes: 'Belt on.',
      exercises: [
        {
          exercise: SQUAT,
          targetSetsText: '5',
          repMinText: '3',
          repMaxText: '5',
          targetWeightKg: 100,
          targetRpe: 8,
        },
      ],
    });
  });

  test('added exercises get a default plan and are not repeated', () => {
    // Act
    addDraftExercise(SQUAT);
    addDraftExercise(BENCH);
    addDraftExercise(SQUAT);

    // Assert
    expect(draftExerciseIds()).toEqual(['squat', 'bench']);
    expect(useTemplateDraft.getState().exercises[0]).toMatchObject({
      targetSetsText: '3',
      repMinText: '8',
      repMaxText: '12',
    });
  });

  test('changes apply to one exercise and leave the others alone', () => {
    // Arrange
    addDraftExercise(SQUAT);
    addDraftExercise(BENCH);

    // Act
    changeDraftExercise('bench', { targetSetsText: '5' });
    setDraftName('Push');
    setDraftNotes('Warm up first.');

    // Assert
    const draft = useTemplateDraft.getState();
    expect(draft.exercises.map((planned) => planned.targetSetsText)).toEqual(['3', '5']);
    expect([draft.name, draft.notes]).toEqual(['Push', 'Warm up first.']);
  });

  test('exercises can be reordered and removed', () => {
    // Arrange
    addDraftExercise(SQUAT);
    addDraftExercise(BENCH);
    addDraftExercise(ROW);

    // Act
    moveDraftExercise('row', -1);
    moveDraftExercise('squat', 1);
    removeDraftExercise('bench');

    // Assert
    expect(draftExerciseIds()).toEqual(['row', 'squat']);
  });

  test('moving the first exercise up, or the last down, changes nothing', () => {
    // Arrange
    addDraftExercise(SQUAT);
    addDraftExercise(BENCH);

    // Act
    moveDraftExercise('squat', -1);
    moveDraftExercise('bench', 1);

    // Assert
    expect(draftExerciseIds()).toEqual(['squat', 'bench']);
  });
});

describe('parseDraft', () => {
  const planned = {
    exercise: SQUAT,
    targetSetsText: '3',
    repMinText: '5',
    repMaxText: '8',
    targetWeightKg: null,
    targetRpe: null,
  };
  const draft: TemplateDraft = {
    templateId: null,
    name: '  Leg Day ',
    notes: '  ',
    exercises: [planned],
  };

  test('turns a complete draft into template content', () => {
    expect(parseDraft(draft)).toEqual({
      ok: true,
      content: {
        name: 'Leg Day',
        notes: null,
        exercises: [
          {
            exerciseId: 'squat',
            targetSets: 3,
            repMin: 5,
            repMax: 8,
            targetWeightKg: null,
            targetRpe: null,
          },
        ],
      },
    });
  });

  test('keeps notes and targets that are set', () => {
    const parsed = parseDraft({
      ...draft,
      notes: ' Belt on. ',
      exercises: [{ ...planned, targetWeightKg: 100, targetRpe: 8 }],
    });

    expect(parsed).toMatchObject({
      ok: true,
      content: { notes: 'Belt on.', exercises: [{ targetWeightKg: 100, targetRpe: 8 }] },
    });
  });

  test.each([
    [{ name: '   ' }, 'Give the template a name.'],
    [{ exercises: [] }, 'Add at least one exercise.'],
    [
      { exercises: [{ ...planned, targetSetsText: '0' }] },
      'Barbell Squat: sets must be a whole number from 1 to 20.',
    ],
    [
      { exercises: [{ ...planned, targetSetsText: '2.5' }] },
      'Barbell Squat: sets must be a whole number from 1 to 20.',
    ],
    [
      { exercises: [{ ...planned, repMinText: '' }] },
      'Barbell Squat: reps must be whole numbers from 1 to 100.',
    ],
    [
      { exercises: [{ ...planned, repMaxText: '101' }] },
      'Barbell Squat: reps must be whole numbers from 1 to 100.',
    ],
    [
      { exercises: [{ ...planned, repMinText: '9' }] },
      'Barbell Squat: the lower rep target is above the upper one.',
    ],
  ])('rejects %p with %p', (changes, message) => {
    expect(parseDraft({ ...draft, ...changes })).toEqual({ ok: false, message });
  });
});
