import { useEffect, useState } from 'react';

const CLOCK_TICK_MS = 1000;

/** The current time, updated once a second while the component is mounted. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}
