import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ExerciseCard } from '@/components/training/ExerciseCard';
import {
  deleteSet,
  fetchLastSets,
  fetchRecords,
  logSet,
  updateSet,
  type WorkoutSet,
} from '@/src/api/workouts';
import { stopRest, useRestTimer } from '@/src/training/restTimer';

jest.mock('@/src/api/workouts');

const fetchLastSetsMock = jest.mocked(fetchLastSets);
const logSetMock = jest.mocked(logSet);
const deleteSetMock = jest.mocked(deleteSet);
const updateSetMock = jest.mocked(updateSet);
const fetchRecordsMock = jest.mocked(fetchRecords);

const SQUAT = { id: 'squat', name: 'Barbell Squat' };
// 225 lb, as the backend stores it.
const SET_225_LB: WorkoutSet = {
  id: 'set-1',
  exercise: SQUAT,
  position: 1,
  reps: 5,
  weightKg: 102.0583,
  rpe: null,
};

async function renderCard(loggedSets: WorkoutSet[] = []) {
  // No retries, and no cache-expiry timers left running when the test ends.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <ExerciseCard
        workoutId="workout-1"
        group={{ exercise: SQUAT, sets: loggedSets }}
        unit="lbs"
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  // Only these mocks are reset: resetting every mock would also wipe the ones
  // React Native's test setup installs, such as the colour scheme.
  stopRest();
  logSetMock.mockReset();
  deleteSetMock.mockReset();
  updateSetMock.mockReset();
  fetchLastSetsMock.mockReset();
  fetchLastSetsMock.mockResolvedValue(null);
  fetchRecordsMock.mockReset();
  fetchRecordsMock.mockResolvedValue({ heaviest: null, bestEstimated1rm: null });
});

test('pre-fills the form from last time, in the user’s unit', async () => {
  // Arrange
  fetchLastSetsMock.mockResolvedValue({
    workoutId: 'workout-0',
    startedAt: '2026-10-02T18:00:00Z',
    sets: [SET_225_LB],
  });

  // Act
  await renderCard();

  // Assert
  expect(await screen.findByText('Last time: 225 lb × 5')).toBeTruthy();
  expect(screen.getByLabelText('Weight in lb').props.value).toBe('225');
  expect(screen.getByLabelText('Reps').props.value).toBe('5');
});

test('shows the template’s plan and starts the form from it', async () => {
  // Arrange
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const plan = {
    id: 'item-1',
    exercise: SQUAT,
    position: 1,
    targetSets: 3,
    repMin: 5,
    repMax: 8,
    targetWeightKg: 102.0583,
    targetRpe: null,
  };

  // Act
  await render(
    <QueryClientProvider client={queryClient}>
      <ExerciseCard
        workoutId="workout-1"
        group={{ exercise: SQUAT, sets: [] }}
        unit="lbs"
        plan={plan}
      />
    </QueryClientProvider>
  );
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));

  // Assert
  expect(screen.getByText('Plan: 3 × 5–8 at 225 lb')).toBeTruthy();
  expect(screen.getByLabelText('Weight in lb').props.value).toBe('225');
  expect(screen.getByLabelText('Reps').props.value).toBe('5');
});

test('shows the user’s records for the exercise', async () => {
  // Arrange
  const record = {
    workoutId: 'workout-0',
    achievedAt: '2026-10-02T18:00:00Z',
    reps: 5,
    weightKg: 102.0583,
    estimated1rmKg: 119.068,
  };
  fetchRecordsMock.mockResolvedValue({ heaviest: record, bestEstimated1rm: record });

  // Act
  await renderCard();

  // Assert
  expect(await screen.findByText('Best: 225 lb × 5 · est. 1RM 262.5 lb')).toBeTruthy();
});

test('re-logs an off-plate weight unchanged when the pre-fill is not edited', async () => {
  // Arrange: 131 lb is shown rounded as "130 lb" but must not be logged as 130.
  const set131Lb = { ...SET_225_LB, weightKg: 59.4206 };
  logSetMock.mockResolvedValue({ ...set131Lb, id: 'set-2' });
  await renderCard([set131Lb]);

  // Act
  await fireEvent.press(screen.getByText('Log set'));

  // Assert
  expect(screen.getByLabelText('Weight in lb').props.value).toBe('131');
  expect(logSetMock).toHaveBeenCalledWith('workout-1', {
    exerciseId: 'squat',
    reps: 5,
    weightKg: 59.4206,
    rpe: null,
  });
});

test('logs the typed set in kilograms', async () => {
  // Arrange
  logSetMock.mockResolvedValue({ ...SET_225_LB, id: 'set-2', weightKg: 104.3262 });
  await renderCard();

  // Act
  await fireEvent.changeText(screen.getByLabelText('Weight in lb'), '230');
  await fireEvent.changeText(screen.getByLabelText('Reps'), '5');
  await fireEvent.changeText(screen.getByLabelText('RPE, optional'), '8.5');
  await fireEvent.press(screen.getByText('Log set'));

  // Assert
  expect(logSetMock).toHaveBeenCalledWith('workout-1', {
    exerciseId: 'squat',
    reps: 5,
    weightKg: 104.3262,
    rpe: 8.5,
  });
});

test('explains what is wrong instead of logging an incomplete set', async () => {
  // Arrange
  await renderCard();

  // Act
  await fireEvent.press(screen.getByText('Log set'));

  // Assert
  expect(await screen.findByText('Enter a weight, such as 135.')).toBeTruthy();
  expect(logSetMock).not.toHaveBeenCalled();
});

test('lists logged sets and deletes the one tapped', async () => {
  // Arrange
  deleteSetMock.mockResolvedValue(undefined);
  await renderCard([SET_225_LB]);

  // Act
  await fireEvent.press(screen.getByLabelText('Delete set 1 of Barbell Squat'));

  // Assert
  expect(screen.getByText('225 lb × 5')).toBeTruthy();
  expect(deleteSetMock).toHaveBeenCalledWith('workout-1', 'set-1');
});

test('edits a logged set in place', async () => {
  // Arrange
  updateSetMock.mockResolvedValue({ ...SET_225_LB, reps: 6 });
  await renderCard([SET_225_LB]);

  // Act
  await fireEvent.press(screen.getByLabelText('Edit set 1 of Barbell Squat'));
  const weightWhileEditing = screen.getByLabelText('Weight in lb').props.value;
  await fireEvent.changeText(screen.getByLabelText('Reps'), '6');
  await fireEvent.press(screen.getByText('Save'));

  // Assert
  expect(weightWhileEditing).toBe('225');
  expect(updateSetMock).toHaveBeenCalledWith('workout-1', 'set-1', {
    reps: 6,
    weightKg: 102.0583,
    rpe: null,
  });
  expect(await screen.findByText('Log set')).toBeTruthy();
});

test('keeps the stored weight exact when an edit leaves the weight alone', async () => {
  // Arrange: 100 kg shows as 220.46 lb, which would convert back to 99.999 kg.
  const set100Kg = { ...SET_225_LB, weightKg: 100 };
  updateSetMock.mockResolvedValue({ ...set100Kg, reps: 6 });
  await renderCard([set100Kg]);

  // Act
  await fireEvent.press(screen.getByLabelText('Edit set 1 of Barbell Squat'));
  await fireEvent.changeText(screen.getByLabelText('Reps'), '6');
  await fireEvent.press(screen.getByText('Save'));

  // Assert
  expect(updateSetMock).toHaveBeenCalledWith('workout-1', 'set-1', {
    reps: 6,
    weightKg: 100,
    rpe: null,
  });
});

test('keeps the suggested weight exact when it is logged without being edited', async () => {
  // Arrange
  const set100Kg = { ...SET_225_LB, weightKg: 100 };
  logSetMock.mockResolvedValue({ ...set100Kg, id: 'set-2' });
  await renderCard([set100Kg]);

  // Act
  await fireEvent.press(screen.getByText('Log set'));

  // Assert
  expect(logSetMock.mock.calls[0][1]).toMatchObject({ weightKg: 100 });
});

test('brings the new-set form back when the set being edited disappears', async () => {
  // Arrange
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const cardWith = (sets: WorkoutSet[]) => (
    <QueryClientProvider client={queryClient}>
      <ExerciseCard workoutId="workout-1" group={{ exercise: SQUAT, sets }} unit="lbs" />
    </QueryClientProvider>
  );
  const otherSet = { ...SET_225_LB, id: 'set-2', position: 2 };
  const view = await render(cardWith([SET_225_LB, otherSet]));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await fireEvent.press(screen.getByLabelText('Edit set 1 of Barbell Squat'));

  // Act: the set is removed elsewhere, such as from another device.
  await view.rerender(cardWith([otherSet]));

  // Assert
  expect(screen.getByText('Log set')).toBeTruthy();
});

test('cancelling an edit changes nothing', async () => {
  // Arrange
  await renderCard([SET_225_LB]);

  // Act
  await fireEvent.press(screen.getByLabelText('Edit set 1 of Barbell Squat'));
  await fireEvent.changeText(screen.getByLabelText('Reps'), '6');
  await fireEvent.press(screen.getByText('Cancel'));

  // Assert
  expect(updateSetMock).not.toHaveBeenCalled();
  expect(screen.getByText('225 lb × 5')).toBeTruthy();
});

test('starts the rest timer once a set is logged', async () => {
  // Arrange
  logSetMock.mockResolvedValue({ ...SET_225_LB, id: 'set-2' });
  await renderCard([SET_225_LB]);

  // Act
  await fireEvent.press(screen.getByText('Log set'));

  // Assert
  await waitFor(() => expect(useRestTimer.getState().endsAt).not.toBeNull());
});

test('shows the server’s message when a set cannot be saved', async () => {
  // Arrange
  logSetMock.mockRejectedValue(new Error('offline'));
  await renderCard([SET_225_LB]);

  // Act
  await fireEvent.press(screen.getByText('Log set'));

  // Assert
  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
});
