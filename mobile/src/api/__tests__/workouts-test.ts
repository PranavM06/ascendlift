import { authorizedRequest } from '@/src/api/authorized';
import { createExercise, searchExercises } from '@/src/api/exercises';
import {
  deleteSet,
  deleteWorkout,
  fetchActiveWorkout,
  fetchLastSets,
  finishWorkout,
  logSet,
  startWorkout,
  updateSet,
} from '@/src/api/workouts';

jest.mock('@/src/api/authorized', () => ({ authorizedRequest: jest.fn() }));

const authorizedRequestMock = jest.mocked(authorizedRequest);

const SET_JSON = {
  id: 'set-1',
  exercise: { id: 'squat', name: 'Barbell Squat' },
  position: 1,
  reps: 5,
  weight_kg: '102.0583',
  rpe: '8.5',
};
const SET = {
  id: 'set-1',
  exercise: { id: 'squat', name: 'Barbell Squat' },
  position: 1,
  reps: 5,
  weightKg: 102.0583,
  rpe: 8.5,
};
const WORKOUT_JSON = {
  id: 'workout-1',
  started_at: '2026-10-09T18:00:00Z',
  ended_at: null,
  template_id: null,
  sets: [SET_JSON],
};
const WORKOUT = {
  id: 'workout-1',
  startedAt: '2026-10-09T18:00:00Z',
  endedAt: null,
  sets: [SET],
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe('workouts', () => {
  test('reads the workout in progress, turning decimal strings into numbers', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValueOnce(WORKOUT_JSON);

    // Act
    const workout = await fetchActiveWorkout();

    // Assert
    expect(workout).toEqual(WORKOUT);
    expect(authorizedRequestMock).toHaveBeenCalledWith('/workouts/active');
  });

  test('reads no workout in progress as null', async () => {
    authorizedRequestMock.mockResolvedValueOnce(null);

    await expect(fetchActiveWorkout()).resolves.toBeNull();
  });

  test('starts and finishes a workout with POST requests', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue({ ...WORKOUT_JSON, sets: [] });

    // Act
    const started = await startWorkout();
    await finishWorkout('workout-1');

    // Assert
    expect(started).toEqual({ ...WORKOUT, sets: [] });
    expect(authorizedRequestMock).toHaveBeenNthCalledWith(1, '/workouts', { method: 'POST' });
    expect(authorizedRequestMock).toHaveBeenNthCalledWith(2, '/workouts/workout-1/finish', {
      method: 'POST',
    });
  });

  test('logs a set in kilograms', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValueOnce({ ...SET_JSON, rpe: null });

    // Act
    const logged = await logSet('workout-1', {
      exerciseId: 'squat',
      reps: 5,
      weightKg: 102.0583,
      rpe: null,
    });

    // Assert
    expect(logged).toEqual({ ...SET, rpe: null });
    expect(authorizedRequestMock).toHaveBeenCalledWith('/workouts/workout-1/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: 'squat', reps: 5, weight_kg: 102.0583, rpe: null }),
    });
  });

  test('edits a set with a PATCH request in kilograms', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValueOnce({ ...SET_JSON, reps: 6, rpe: null });

    // Act
    const updated = await updateSet('workout-1', 'set-1', {
      reps: 6,
      weightKg: 102.0583,
      rpe: null,
    });

    // Assert
    expect(updated).toEqual({ ...SET, reps: 6, rpe: null });
    expect(authorizedRequestMock).toHaveBeenCalledWith('/workouts/workout-1/sets/set-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reps: 6, weight_kg: 102.0583, rpe: null }),
    });
  });

  test('deletes sets and workouts with DELETE requests', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValue(null);

    // Act
    await deleteSet('workout-1', 'set-1');
    await deleteWorkout('workout-1');

    // Assert
    expect(authorizedRequestMock).toHaveBeenNthCalledWith(1, '/workouts/workout-1/sets/set-1', {
      method: 'DELETE',
    });
    expect(authorizedRequestMock).toHaveBeenNthCalledWith(2, '/workouts/workout-1', {
      method: 'DELETE',
    });
  });

  test('reads the sets from last time, or null when there are none', async () => {
    // Arrange
    authorizedRequestMock
      .mockResolvedValueOnce({
        workout_id: 'workout-0',
        started_at: '2026-10-02T18:00:00Z',
        sets: [SET_JSON],
      })
      .mockResolvedValueOnce(null);

    // Act
    const found = await fetchLastSets('squat');
    const missing = await fetchLastSets('bench');

    // Assert
    expect(found).toEqual({
      workoutId: 'workout-0',
      startedAt: '2026-10-02T18:00:00Z',
      sets: [SET],
    });
    expect(missing).toBeNull();
    expect(authorizedRequestMock).toHaveBeenNthCalledWith(1, '/workouts/last-sets?exercise_id=squat');
  });

  test.each([
    ['a weight that is not a number', { ...WORKOUT_JSON, sets: [{ ...SET_JSON, weight_kg: 'heavy' }] }],
    ['a set without an exercise', { ...WORKOUT_JSON, sets: [{ ...SET_JSON, exercise: null }] }],
    ['a missing start time', { ...WORKOUT_JSON, started_at: undefined }],
    ['sets that are not a list', { ...WORKOUT_JSON, sets: 'none' }],
  ])('rejects a workout with %s', async (_label, body) => {
    authorizedRequestMock.mockResolvedValueOnce(body);

    await expect(fetchActiveWorkout()).rejects.toThrow('The server sent an unexpected response.');
  });
});

describe('exercises', () => {
  const EXERCISE_JSON = {
    id: 'squat',
    name: 'Barbell Squat',
    muscle_groups: ['quadriceps', 'glutes'],
    equipment: 'barbell',
    is_custom: false,
  };

  test('searches the library by name', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValueOnce({
      items: [EXERCISE_JSON],
      total: 1,
      limit: 50,
      offset: 0,
    });

    // Act
    const page = await searchExercises('  bench & press ');

    // Assert
    expect(page).toEqual({
      items: [
        {
          id: 'squat',
          name: 'Barbell Squat',
          muscleGroups: ['quadriceps', 'glutes'],
          equipment: 'barbell',
          isCustom: false,
        },
      ],
      total: 1,
    });
    expect(authorizedRequestMock).toHaveBeenCalledWith(
      '/exercises?limit=50&search=bench%20%26%20press'
    );
  });

  test('creates a custom exercise', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValueOnce({
      ...EXERCISE_JSON,
      id: 'sled',
      name: 'Sled Drag',
      equipment: null,
      is_custom: true,
    });

    // Act
    const created = await createExercise({
      name: 'Sled Drag',
      muscleGroups: ['quadriceps', 'glutes'],
      equipment: null,
    });

    // Assert
    expect(created).toEqual({
      id: 'sled',
      name: 'Sled Drag',
      muscleGroups: ['quadriceps', 'glutes'],
      equipment: null,
      isCustom: true,
    });
    expect(authorizedRequestMock).toHaveBeenCalledWith('/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sled Drag',
        muscle_groups: ['quadriceps', 'glutes'],
        equipment: null,
      }),
    });
  });

  test('lists the library when the search is blank', async () => {
    // Arrange
    authorizedRequestMock.mockResolvedValueOnce({ items: [], total: 0, limit: 50, offset: 0 });

    // Act
    await searchExercises('   ');

    // Assert
    expect(authorizedRequestMock).toHaveBeenCalledWith('/exercises?limit=50');
  });

  test('rejects an exercise without a name', async () => {
    authorizedRequestMock.mockResolvedValueOnce({
      items: [{ ...EXERCISE_JSON, name: 7 }],
      total: 1,
    });

    await expect(searchExercises('squat')).rejects.toThrow(
      'The server sent an unexpected response.'
    );
  });
});
