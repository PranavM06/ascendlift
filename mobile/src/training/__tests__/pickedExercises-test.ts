import {
  clearPickedExercises,
  pickExercise,
  usePickedExercises,
} from '@/src/training/pickedExercises';

const SQUAT = { id: 'squat', name: 'Barbell Squat' };
const BENCH = { id: 'bench', name: 'Bench Press' };

beforeEach(() => {
  clearPickedExercises();
});

test('keeps picks in the order they were made', () => {
  // Act
  pickExercise('workout-1', SQUAT);
  pickExercise('workout-1', BENCH);

  // Assert
  expect(usePickedExercises.getState()).toEqual({
    workoutId: 'workout-1',
    exercises: [SQUAT, BENCH],
  });
});

test('ignores an exercise that is already picked', () => {
  // Act
  pickExercise('workout-1', SQUAT);
  pickExercise('workout-1', SQUAT);

  // Assert
  expect(usePickedExercises.getState().exercises).toEqual([SQUAT]);
});

test('starts over when a different workout begins', () => {
  // Arrange
  pickExercise('workout-1', SQUAT);

  // Act
  pickExercise('workout-2', BENCH);

  // Assert
  expect(usePickedExercises.getState()).toEqual({ workoutId: 'workout-2', exercises: [BENCH] });
});

test('clearing removes every pick', () => {
  // Arrange
  pickExercise('workout-1', SQUAT);

  // Act
  clearPickedExercises();

  // Assert
  expect(usePickedExercises.getState()).toEqual({ workoutId: null, exercises: [] });
});
