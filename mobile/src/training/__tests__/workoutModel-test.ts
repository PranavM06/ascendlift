import type { WorkoutSet } from '@/src/api/workouts';
import {
  describePlan,
  describeRecords,
  describeSet,
  formatDuration,
  formatElapsed,
  formatVolume,
  formatWorkoutDate,
  groupSetsByExercise,
  parseSetEntry,
  suggestNextSet,
} from '@/src/training/workoutModel';

const SQUAT = { id: 'squat', name: 'Barbell Squat' };
const BENCH = { id: 'bench', name: 'Bench Press' };
const ROW = { id: 'row', name: 'Bent Over Row' };

function makeSet(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id: 'set-1', exercise: SQUAT, position: 1, reps: 5, weightKg: 100, rpe: null, ...overrides };
}

describe('groupSetsByExercise', () => {
  test('groups sets under their exercise in the order each was first logged', () => {
    // Arrange
    const sets = [
      makeSet({ id: 'a', exercise: SQUAT, position: 1 }),
      makeSet({ id: 'b', exercise: BENCH, position: 2 }),
      makeSet({ id: 'c', exercise: SQUAT, position: 3 }),
    ];

    // Act
    const groups = groupSetsByExercise(sets, []);

    // Assert
    expect(groups.map((group) => group.exercise.name)).toEqual(['Barbell Squat', 'Bench Press']);
    expect(groups[0].sets.map((set) => set.id)).toEqual(['a', 'c']);
    expect(groups[1].sets.map((set) => set.id)).toEqual(['b']);
  });

  test('lists picked exercises that have no sets yet after the logged ones', () => {
    // Arrange
    const sets = [makeSet({ exercise: BENCH })];

    // Act
    const groups = groupSetsByExercise(sets, [ROW, SQUAT]);

    // Assert
    expect(groups.map((group) => group.exercise.id)).toEqual(['bench', 'row', 'squat']);
    expect(groups[1].sets).toEqual([]);
  });

  test('does not repeat a picked exercise once it has a set', () => {
    // Act
    const groups = groupSetsByExercise([makeSet({ exercise: SQUAT })], [SQUAT]);

    // Assert
    expect(groups).toHaveLength(1);
  });

  test('returns no groups for an empty workout', () => {
    expect(groupSetsByExercise([], [])).toEqual([]);
  });
});

describe('suggestNextSet', () => {
  test('repeats the set just logged', () => {
    // Arrange
    const logged = [makeSet({ weightKg: 100, reps: 5 }), makeSet({ weightKg: 105, reps: 3 })];
    const lastTime = [makeSet({ weightKg: 90, reps: 8 })];

    // Act
    const suggestion = suggestNextSet(logged, lastTime);

    // Assert
    expect(suggestion).toEqual({ weightKg: 105, reps: 3 });
  });

  test('starts from the first set of last time when nothing is logged yet', () => {
    // Arrange
    const lastTime = [makeSet({ weightKg: 90, reps: 8 }), makeSet({ weightKg: 95, reps: 6 })];

    // Act
    const suggestion = suggestNextSet([], lastTime);

    // Assert
    expect(suggestion).toEqual({ weightKg: 90, reps: 8 });
  });

  test('suggests nothing for an exercise with no history', () => {
    expect(suggestNextSet([], [])).toBeNull();
  });
});

describe('describeSet', () => {
  test('shows weight in the chosen unit and reps', () => {
    expect(describeSet(makeSet({ weightKg: 102.0583, reps: 5 }), 'lbs')).toBe('225 lb × 5');
    expect(describeSet(makeSet({ weightKg: 100, reps: 3 }), 'kg')).toBe('100 kg × 3');
  });

  test('adds the RPE when there is one', () => {
    expect(describeSet(makeSet({ weightKg: 100, reps: 3, rpe: 8.5 }), 'kg')).toBe(
      '100 kg × 3 @ 8.5'
    );
  });
});

describe('formatElapsed', () => {
  const startedAt = '2026-10-09T18:00:00Z';

  test.each([
    ['2026-10-09T18:00:42Z', '0:42'],
    ['2026-10-09T18:12:05Z', '12:05'],
    ['2026-10-09T19:02:03Z', '1:02:03'],
  ])('at %s shows %s', (now, expected) => {
    expect(formatElapsed(startedAt, new Date(now))).toBe(expected);
  });

  test('never shows a negative time when the clocks disagree', () => {
    expect(formatElapsed(startedAt, new Date('2026-10-09T17:59:00Z'))).toBe('0:00');
  });
});

describe('formatVolume', () => {
  test('shows the total in the user’s unit as a whole number', () => {
    expect(formatVolume(1500, 'kg', 'en-US')).toBe('1,500 kg');
    expect(formatVolume(1500, 'lbs', 'en-US')).toBe('3,307 lb');
    expect(formatVolume(0, 'kg', 'en-US')).toBe('0 kg');
  });
});

describe('formatWorkoutDate', () => {
  test('shows the weekday, month and day', () => {
    expect(formatWorkoutDate('2026-10-09T18:00:00', 'en-US')).toBe('Fri, Oct 9');
  });
});

describe('describeRecords', () => {
  const record = {
    workoutId: 'workout-0',
    achievedAt: '2026-10-02T18:00:00Z',
    reps: 5,
    weightKg: 100,
    estimated1rmKg: 116.6667,
  };

  test('shows the heaviest set and the best estimate', () => {
    const records = {
      heaviest: { ...record, reps: 1, weightKg: 110, estimated1rmKg: 110 },
      bestEstimated1rm: record,
    };

    expect(describeRecords(records, 'kg')).toBe('Best: 110 kg × 1 · est. 1RM 116.25 kg');
  });

  test('leaves out the estimate when there is none', () => {
    const records = { heaviest: { ...record, reps: 20, estimated1rmKg: null }, bestEstimated1rm: null };

    expect(describeRecords(records, 'kg')).toBe('Best: 100 kg × 20');
  });

  test('is null before the exercise has any record', () => {
    expect(describeRecords({ heaviest: null, bestEstimated1rm: null }, 'kg')).toBeNull();
  });
});

describe('describePlan', () => {
  const plan = {
    id: 'item-1',
    exercise: SQUAT,
    position: 1,
    targetSets: 3,
    repMin: 5,
    repMax: 8,
    targetWeightKg: null,
    targetRpe: null,
  };

  test('shows the sets and the rep range', () => {
    expect(describePlan(plan, 'kg')).toBe('Plan: 3 × 5–8');
  });

  test('shows a single number when the range is one value', () => {
    expect(describePlan({ ...plan, repMin: 5, repMax: 5 }, 'kg')).toBe('Plan: 3 × 5');
  });

  test('adds the target weight and RPE when they are set', () => {
    expect(describePlan({ ...plan, targetWeightKg: 100, targetRpe: 8 }, 'kg')).toBe(
      'Plan: 3 × 5–8 at 100 kg @ 8'
    );
  });
});

describe('formatDuration', () => {
  test.each([
    [0, '0:00'],
    [90, '1:30'],
    [3723, '1:02:03'],
  ])('shows %p seconds as %p', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('parseSetEntry', () => {
  test('converts the typed weight to kilograms in the user’s unit', () => {
    expect(parseSetEntry({ weightText: '225', repsText: '5', rpeText: '' }, 'lbs')).toEqual({
      ok: true,
      weightKg: 102.0583,
      reps: 5,
      rpe: null,
    });
    expect(parseSetEntry({ weightText: '102,5', repsText: ' 3 ', rpeText: '8.5' }, 'kg')).toEqual({
      ok: true,
      weightKg: 102.5,
      reps: 3,
      rpe: 8.5,
    });
  });

  test.each([
    [{ weightText: '', repsText: '5', rpeText: '' }, 'Enter a weight, such as 135.'],
    [{ weightText: 'heavy', repsText: '5', rpeText: '' }, 'Enter a weight, such as 135.'],
    [{ weightText: '5000', repsText: '5', rpeText: '' }, 'That weight is too heavy to log.'],
    [{ weightText: '225', repsText: '', rpeText: '' }, 'Enter the reps as a whole number.'],
    [{ weightText: '225', repsText: '4.5', rpeText: '' }, 'Enter the reps as a whole number.'],
    [{ weightText: '225', repsText: '1001', rpeText: '' }, 'Enter the reps as a whole number.'],
    [{ weightText: '225', repsText: '5', rpeText: '11' }, 'RPE goes from 1 to 10 in half steps.'],
    [{ weightText: '225', repsText: '5', rpeText: '8.3' }, 'RPE goes from 1 to 10 in half steps.'],
    [{ weightText: '225', repsText: '5', rpeText: 'hard' }, 'RPE goes from 1 to 10 in half steps.'],
  ])('rejects %p with %p', (entry, message) => {
    expect(parseSetEntry(entry, 'lbs')).toEqual({ ok: false, message });
  });
});
