import {
  DEFAULT_REST_SECONDS,
  extendRest,
  remainingSeconds,
  startRest,
  stopRest,
  useRestTimer,
} from '@/src/training/restTimer';

const NOW_MS = 1_000_000;

beforeEach(() => {
  stopRest();
});

test('starting a rest sets when it ends', () => {
  // Act
  startRest(NOW_MS);

  // Assert
  expect(useRestTimer.getState().endsAt).toBe(NOW_MS + DEFAULT_REST_SECONDS * 1000);
});

test('starting again replaces the rest in progress', () => {
  // Arrange
  startRest(NOW_MS);

  // Act
  startRest(NOW_MS + 60_000, 90);

  // Assert
  expect(useRestTimer.getState().endsAt).toBe(NOW_MS + 60_000 + 90_000);
});

test('extending adds time to the rest in progress', () => {
  // Arrange
  startRest(NOW_MS, 60);

  // Act
  extendRest(30);

  // Assert
  expect(useRestTimer.getState().endsAt).toBe(NOW_MS + 90_000);
});

test('extending does nothing when no rest is in progress', () => {
  // Act
  extendRest(30);

  // Assert
  expect(useRestTimer.getState().endsAt).toBeNull();
});

test('stopping ends the rest', () => {
  // Arrange
  startRest(NOW_MS);

  // Act
  stopRest();

  // Assert
  expect(useRestTimer.getState().endsAt).toBeNull();
});

test.each([
  [NOW_MS, 120],
  [NOW_MS + 500, 120],
  [NOW_MS + 1000, 119],
  [NOW_MS + 119_001, 1],
  [NOW_MS + 120_000, 0],
  [NOW_MS + 500_000, 0],
])('at %p there are %p seconds left', (nowMs, expected) => {
  expect(remainingSeconds(NOW_MS + 120_000, nowMs)).toBe(expected);
});
