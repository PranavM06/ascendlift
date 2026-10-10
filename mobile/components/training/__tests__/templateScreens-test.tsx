import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';

import TrainingScreen from '@/app/(tabs)/training';
import TemplateEditorScreen from '@/app/template-editor';
import {
  createTemplate,
  fetchTemplates,
  replaceTemplate,
  type Template,
} from '@/src/api/templates';
import { fetchActiveWorkout, startWorkout } from '@/src/api/workouts';
import { addDraftExercise, startDraft, useTemplateDraft } from '@/src/training/templateDraft';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock('@/src/api/templates');
jest.mock('@/src/api/workouts');

const fetchTemplatesMock = jest.mocked(fetchTemplates);
const createTemplateMock = jest.mocked(createTemplate);
const replaceTemplateMock = jest.mocked(replaceTemplate);
const fetchActiveWorkoutMock = jest.mocked(fetchActiveWorkout);
const startWorkoutMock = jest.mocked(startWorkout);
const routerPushMock = jest.mocked(router.push);
const routerBackMock = jest.mocked(router.back);

const SQUAT = { id: 'squat', name: 'Barbell Squat' };
const LEG_DAY: Template = {
  id: 'template-1',
  name: 'Leg Day',
  notes: null,
  exercises: [
    {
      id: 'item-1',
      exercise: SQUAT,
      position: 1,
      targetSets: 3,
      repMin: 5,
      repMax: 8,
      targetWeightKg: null,
      targetRpe: null,
    },
  ],
};
const WORKOUT = {
  id: 'workout-1',
  startedAt: '2026-10-09T18:00:00Z',
  endedAt: null,
  templateId: 'template-1',
  sets: [],
};

async function renderScreen(screenElement: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(<QueryClientProvider client={queryClient}>{screenElement}</QueryClientProvider>);
  // Let the screen's first requests finish, so each test acts on a settled screen.
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
}

beforeEach(() => {
  startDraft(null);
  fetchTemplatesMock.mockReset();
  createTemplateMock.mockReset();
  replaceTemplateMock.mockReset();
  fetchActiveWorkoutMock.mockReset();
  startWorkoutMock.mockReset();
  routerPushMock.mockReset();
  routerBackMock.mockReset();
  fetchActiveWorkoutMock.mockResolvedValue(null);
  fetchTemplatesMock.mockResolvedValue([LEG_DAY]);
});

describe('Training tab', () => {
  test('starts a workout from a template', async () => {
    // Arrange
    startWorkoutMock.mockResolvedValue(WORKOUT);
    await renderScreen(<TrainingScreen />);

    // Act
    await fireEvent.press(await screen.findByLabelText('Start Leg Day'));

    // Assert
    await waitFor(() => expect(routerPushMock).toHaveBeenCalledWith('/workout'));
    expect(startWorkoutMock).toHaveBeenCalledWith('template-1');
  });

  test('opens a template for editing with its contents loaded', async () => {
    // Arrange
    await renderScreen(<TrainingScreen />);

    // Act
    await fireEvent.press(await screen.findByLabelText('Edit Leg Day'));

    // Assert
    expect(routerPushMock).toHaveBeenCalledWith('/template-editor');
    expect(useTemplateDraft.getState()).toMatchObject({ templateId: 'template-1', name: 'Leg Day' });
  });

  test('opens an empty editor for a new template', async () => {
    // Arrange
    startDraft(LEG_DAY);
    await renderScreen(<TrainingScreen />);

    // Act
    await fireEvent.press(await screen.findByText('New template'));

    // Assert
    expect(routerPushMock).toHaveBeenCalledWith('/template-editor');
    expect(useTemplateDraft.getState()).toMatchObject({ templateId: null, name: '' });
  });

  test('offers to resume, not start, while a workout is in progress', async () => {
    // Arrange
    fetchActiveWorkoutMock.mockResolvedValue(WORKOUT);

    // Act
    await renderScreen(<TrainingScreen />);

    // Assert
    expect(await screen.findByText('Resume workout')).toBeTruthy();
    expect(screen.queryByText('Start blank workout')).toBeNull();
    expect(screen.queryByLabelText('Start Leg Day')).toBeNull();
  });

  test('says how to begin when there are no templates', async () => {
    // Arrange
    fetchTemplatesMock.mockResolvedValue([]);

    // Act
    await renderScreen(<TrainingScreen />);

    // Assert
    expect(await screen.findByText(/No templates yet/)).toBeTruthy();
  });
});

describe('TemplateEditorScreen', () => {
  test('saves changes to an existing template and goes back', async () => {
    // Arrange
    replaceTemplateMock.mockResolvedValue(LEG_DAY);
    startDraft(LEG_DAY);
    await renderScreen(<TemplateEditorScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Sets for Barbell Squat'), '5');
    await fireEvent.press(screen.getByText('Save template'));

    // Assert
    await waitFor(() => expect(routerBackMock).toHaveBeenCalledTimes(1));
    expect(replaceTemplateMock).toHaveBeenCalledWith('template-1', {
      name: 'Leg Day',
      notes: null,
      exercises: [
        {
          exerciseId: 'squat',
          targetSets: 5,
          repMin: 5,
          repMax: 8,
          targetWeightKg: null,
          targetRpe: null,
        },
      ],
    });
  });

  test('creates a new template from the draft', async () => {
    // Arrange
    createTemplateMock.mockResolvedValue(LEG_DAY);
    addDraftExercise(SQUAT);
    await renderScreen(<TemplateEditorScreen />);

    // Act
    await fireEvent.changeText(screen.getByLabelText('Template name'), 'Leg Day');
    await fireEvent.press(screen.getByText('Save template'));

    // Assert
    await waitFor(() => expect(routerBackMock).toHaveBeenCalledTimes(1));
    expect(createTemplateMock.mock.calls[0][0]).toMatchObject({
      name: 'Leg Day',
      exercises: [{ exerciseId: 'squat', targetSets: 3, repMin: 8, repMax: 12 }],
    });
    expect(screen.queryByText('Delete template')).toBeNull();
  });

  test('explains what is missing instead of saving', async () => {
    // Arrange
    await renderScreen(<TemplateEditorScreen />);

    // Act
    await fireEvent.press(screen.getByText('Save template'));

    // Assert
    expect(await screen.findByText('Give the template a name.')).toBeTruthy();
    expect(createTemplateMock).not.toHaveBeenCalled();
  });

  test('opens the exercise picker in template mode', async () => {
    // Arrange
    await renderScreen(<TemplateEditorScreen />);

    // Act
    await fireEvent.press(screen.getByText('Add exercise'));

    // Assert
    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: '/exercise-picker',
      params: { target: 'template' },
    });
  });

  test('removes an exercise from the draft', async () => {
    // Arrange
    startDraft(LEG_DAY);
    await renderScreen(<TemplateEditorScreen />);

    // Act
    await fireEvent.press(screen.getByText('Remove Barbell Squat'));

    // Assert
    expect(screen.queryByLabelText('Sets for Barbell Squat')).toBeNull();
  });
});
