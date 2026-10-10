import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Vibration } from 'react-native';

import NewExerciseScreen from '@/app/new-exercise';
import { RestTimer } from '@/components/training/RestTimer';
import { createExercise } from '@/src/api/exercises';
import type { Workout } from '@/src/api/workouts';
import { clearPickedExercises, usePickedExercises } from '@/src/training/pickedExercises';
import { startRest, stopRest, useRestTimer } from '@/src/training/restTimer';
import { ACTIVE_WORKOUT_QUERY_KEY } from '@/src/training/useWorkout';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ name: 'Sled Drag' })),
}));
jest.mock('@/src/api/workouts');
jest.mock('@/src/api/exercises', () => ({
  ...jest.requireActual('@/src/api/exercises'),
  createExercise: jest.fn(),
}));

const createExerciseMock = jest.mocked(createExercise);
const routerBackMock = jest.mocked(router.back);

const WORKOUT: Workout = {
  id: 'workout-1',
  startedAt: '2026-10-09T18:00:00Z',
  endedAt: null,
  templateId: null,
  sets: [],
};

const SLED_DRAG = {
  id: 'sled',
  name: 'Sled Drag',
  muscleGroups: ['quadriceps', 'glutes'],
  equipment: 'other',
  isCustom: true,
};

beforeEach(() => {
  stopRest();
  clearPickedExercises();
  createExerciseMock.mockReset();
  routerBackMock.mockReset();
});

describe('RestTimer', () => {
  test('shows nothing when not resting', async () => {
    // Act
    await render(<RestTimer />);

    // Assert
    expect(screen.queryByText(/Rest/)).toBeNull();
  });

  test('counts down the rest, and can be extended or skipped', async () => {
    // Arrange
    startRest(Date.now(), 90);
    await render(<RestTimer />);
    const shownAtStart = screen.getByText(/Rest/).props.children.join('');

    // Act
    await fireEvent.press(screen.getByText('+30s'));
    const shownAfterExtending = screen.getByText(/Rest/).props.children.join('');
    await fireEvent.press(screen.getByText('Skip'));

    // Assert
    expect(shownAtStart).toBe('Rest 1:30');
    expect(shownAfterExtending).toBe('Rest 2:00');
    expect(useRestTimer.getState().endsAt).toBeNull();
    expect(screen.queryByText(/Rest/)).toBeNull();
  });

  test('clears a rest that ended while the screen was closed, without vibrating', async () => {
    // Arrange: a rest that finished a moment ago.
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    startRest(Date.now() - 5000, 1);

    // Act
    await render(<RestTimer />);

    // Assert
    await waitFor(() => expect(useRestTimer.getState().endsAt).toBeNull());
    expect(vibrate).not.toHaveBeenCalled();
    vibrate.mockRestore();
  });

  test('vibrates when the rest runs out on screen', async () => {
    // Arrange
    jest.useFakeTimers();
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => undefined);
    startRest(Date.now(), 2);
    await render(<RestTimer />);

    // Act
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    // Assert
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(useRestTimer.getState().endsAt).toBeNull();
    vibrate.mockRestore();
    jest.useRealTimers();
  });
});

describe('NewExerciseScreen', () => {
  async function renderScreen() {
    // The workout in progress is already cached, and never refetched, so the
    // screen knows which workout to add the exercise to from the first render.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    });
    queryClient.setQueryData(ACTIVE_WORKOUT_QUERY_KEY, WORKOUT);
    await render(
      <QueryClientProvider client={queryClient}>
        <NewExerciseScreen />
      </QueryClientProvider>
    );
  }

  test('starts with the name searched for', async () => {
    // Act
    await renderScreen();

    // Assert
    expect(screen.getByLabelText('Exercise name').props.value).toBe('Sled Drag');
  });

  test('asks for a muscle group before saving', async () => {
    // Arrange
    await renderScreen();

    // Act
    await fireEvent.press(screen.getByText('Save exercise'));

    // Assert
    expect(await screen.findByText('Choose at least one muscle group.')).toBeTruthy();
    expect(createExerciseMock).not.toHaveBeenCalled();
  });

  test('asks for a name before saving', async () => {
    // Arrange
    await renderScreen();

    // Act
    await fireEvent.changeText(screen.getByLabelText('Exercise name'), '   ');
    await fireEvent.press(screen.getByText('Save exercise'));

    // Assert
    expect(await screen.findByText('Give the exercise a name.')).toBeTruthy();
    expect(createExerciseMock).not.toHaveBeenCalled();
  });

  test('saves the exercise, adds it to the workout and goes back', async () => {
    // Arrange
    createExerciseMock.mockResolvedValue(SLED_DRAG);
    await renderScreen();

    // Act: glutes is chosen and then dropped again; equipment is switched.
    await fireEvent.press(screen.getByText('quadriceps'));
    await fireEvent.press(screen.getByText('glutes'));
    await fireEvent.press(screen.getByText('glutes'));
    await fireEvent.press(screen.getByText('lower back'));
    await fireEvent.press(screen.getByText('barbell'));
    await fireEvent.press(screen.getByText('other'));
    await fireEvent.press(screen.getByText('Save exercise'));

    // Assert
    await waitFor(() => expect(routerBackMock).toHaveBeenCalledTimes(1));
    expect(createExerciseMock.mock.calls[0][0]).toEqual({
      name: 'Sled Drag',
      muscleGroups: ['quadriceps', 'lower_back'],
      equipment: 'other',
    });
    expect(usePickedExercises.getState()).toEqual({
      workoutId: 'workout-1',
      exercises: [{ id: 'sled', name: 'Sled Drag' }],
    });
  });

  test('shows the server’s reason when the exercise cannot be saved', async () => {
    // Arrange
    createExerciseMock.mockRejectedValue(new Error('offline'));
    await renderScreen();

    // Act
    await fireEvent.press(screen.getByText('chest'));
    await fireEvent.press(screen.getByText('Save exercise'));

    // Assert
    expect(await screen.findByText("Couldn't save the exercise. Try again.")).toBeTruthy();
    expect(routerBackMock).not.toHaveBeenCalled();
  });
});
