import { create } from 'zustand';

export const DEFAULT_REST_SECONDS = 120;
export const REST_EXTENSION_SECONDS = 30;

const MS_PER_SECOND = 1000;

type RestTimerState = {
  /**
   * When the rest ends, in milliseconds since the epoch; null when not
   * resting. Keeping the end time, not a countdown, means the timer is still
   * right after the app has been in the background.
   */
  endsAt: number | null;
};

export const useRestTimer = create<RestTimerState>(() => ({ endsAt: null }));

export function startRest(nowMs: number, seconds: number = DEFAULT_REST_SECONDS): void {
  useRestTimer.setState({ endsAt: nowMs + seconds * MS_PER_SECOND });
}

export function extendRest(seconds: number = REST_EXTENSION_SECONDS): void {
  useRestTimer.setState((state) =>
    state.endsAt === null ? state : { endsAt: state.endsAt + seconds * MS_PER_SECOND }
  );
}

export function stopRest(): void {
  useRestTimer.setState({ endsAt: null });
}

/** Whole seconds left, rounded up so the display reaches 0 only at the end. */
export function remainingSeconds(endsAt: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAt - nowMs) / MS_PER_SECOND));
}
