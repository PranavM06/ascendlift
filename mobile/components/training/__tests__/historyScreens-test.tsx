import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';

import HistoryScreen from '@/app/history';
import WorkoutDetailScreen from '@/app/workout-detail';
import { PROFILE_QUERY_KEY } from '@/src/api/users';
import { deleteWorkout, fetchWorkout, fetchWorkoutHistory } from '@/src/api/workouts';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@/src/api/workouts');

const fetchWorkoutHistoryMock = jest.mocked(fetchWorkoutHistory);
const fetchWorkoutMock = jest.mocked(fetchWorkout);
const deleteWorkoutMock = jest.mocked(deleteWorkout);
const useLocalSearchParamsMock = jest.mocked(useLocalSearchParams);
const routerPushMock = jest.mocked(router.push);
const routerBackMock = jest.mocked(router.back);

const SQUAT = { id: 'squat', name: 'Barbell Squat' };
const SUMMARY = {
  id: 'workout-1',
  startedAt: '2026-10-02T18:00:00',
  endedAt: '2026-10-02T19:05:00',
  setCount: 3,
  exerciseNames: ['Barbell Squat', 'Barbell Deadlift'],
  volumeKg: 1500,
};

async function renderWithKgProfile(screenElement: ReactElement) {
  // The profile is cached and never goes stale, so weights show in kg at once.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  queryClient.setQueryDefaults(PROFILE_QUERY_KEY, { staleTime: Infinity });
  queryClient.setQueryData(PROFILE_QUERY_KEY, { unitPreference: 'kg' });
  await render(<QueryClientProvider client={queryClient}>{screenElement}</QueryClientProvider>);
}

beforeEach(() => {
  fetchWorkoutHistoryMock.mockReset();
  fetchWorkoutMock.mockReset();
  deleteWorkoutMock.mockReset();
  routerPushMock.mockReset();
  routerBackMock.mockReset();
  useLocalSearchParamsMock.mockReturnValue({ id: 'workout-1' });
});

describe('HistoryScreen', () => {
  test('lists finished workouts with their totals and opens one when tapped', async () => {
    // Arrange
    fetchWorkoutHistoryMock.mockResolvedValue({ items: [SUMMARY], total: 1 });
    await renderWithKgProfile(<HistoryScreen />);

    // Act
    await fireEvent.press(await screen.findByText('Barbell Squat, Barbell Deadlift'));

    // Assert
    expect(screen.getByText(/^3 sets · 1,500 kg · 1:05:00$/)).toBeTruthy();
    expect(fetchWorkoutHistoryMock).toHaveBeenCalledWith(0);
    expect(routerPushMock).toHaveBeenCalledWith({
      pathname: '/workout-detail',
      params: { id: 'workout-1' },
    });
  });

  test('says so when there is no history yet', async () => {
    // Arrange
    fetchWorkoutHistoryMock.mockResolvedValue({ items: [], total: 0 });

    // Act
    await renderWithKgProfile(<HistoryScreen />);

    // Assert
    expect(await screen.findByText('No finished workouts yet.')).toBeTruthy();
  });

  test('offers a retry when the history cannot be loaded', async () => {
    // Arrange
    fetchWorkoutHistoryMock.mockRejectedValue(new Error('offline'));

    // Act
    await renderWithKgProfile(<HistoryScreen />);

    // Assert
    expect(await screen.findByText("Couldn't load your history.")).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });
});

describe('WorkoutDetailScreen', () => {
  const WORKOUT = {
    id: 'workout-1',
    startedAt: '2026-10-02T18:00:00',
    endedAt: '2026-10-02T19:05:00',
    templateId: null,
    sets: [
      { id: 'set-1', exercise: SQUAT, position: 1, reps: 5, weightKg: 100, rpe: null },
      { id: 'set-2', exercise: SQUAT, position: 2, reps: 3, weightKg: 105, rpe: 9 },
    ],
  };

  test('shows the workout’s sets under their exercise', async () => {
    // Arrange
    fetchWorkoutMock.mockResolvedValue(WORKOUT);

    // Act
    await renderWithKgProfile(<WorkoutDetailScreen />);

    // Assert
    expect(await screen.findByText('Barbell Squat')).toBeTruthy();
    expect(screen.getByText('100 kg × 5')).toBeTruthy();
    expect(screen.getByText('105 kg × 3 @ 9')).toBeTruthy();
    expect(screen.getByText('Lasted 1:05:00')).toBeTruthy();
    expect(fetchWorkoutMock).toHaveBeenCalledWith('workout-1');
  });

  test('deletes the workout after confirming, then goes back', async () => {
    // Arrange: confirm the alert by pressing its "Delete" button.
    fetchWorkoutMock.mockResolvedValue(WORKOUT);
    deleteWorkoutMock.mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Delete')?.onPress?.();
    });
    await renderWithKgProfile(<WorkoutDetailScreen />);

    // Act
    await fireEvent.press(await screen.findByText('Delete workout'));

    // Assert
    await waitFor(() => expect(routerBackMock).toHaveBeenCalledTimes(1));
    expect(deleteWorkoutMock.mock.calls[0][0]).toBe('workout-1');
    // The deleted workout is not asked for again, which would fail and show an error.
    expect(fetchWorkoutMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Couldn't load this workout.")).toBeNull();
    // The button returns from "Deleting…" once the request has fully settled.
    expect(await screen.findByText('Delete workout')).toBeTruthy();
    alert.mockRestore();
  });

  test('explains when the link has no workout id', async () => {
    // Arrange
    useLocalSearchParamsMock.mockReturnValue({});

    // Act
    await renderWithKgProfile(<WorkoutDetailScreen />);

    // Assert
    expect(screen.getByText('This workout could not be found.')).toBeTruthy();
    expect(fetchWorkoutMock).not.toHaveBeenCalled();
  });
});
