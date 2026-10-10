import { useEffect, useState } from 'react';
import { StyleSheet, Vibration } from 'react-native';

import { Button } from '@/components/Button';
import { Text, View } from '@/components/Themed';
import {
  extendRest,
  remainingSeconds,
  REST_EXTENSION_SECONDS,
  stopRest,
  useRestTimer,
} from '@/src/training/restTimer';
import { useNow } from '@/src/training/useNow';
import { formatDuration } from '@/src/training/workoutModel';

function RestCountdown({ endsAt }: { endsAt: number }) {
  const now = useNow();
  const secondsLeft = remainingSeconds(endsAt, now.getTime());
  // A rest that ran out while this screen was closed is cleared quietly; the
  // moment to signal it has passed.
  const [wasOverOnOpen] = useState(() => endsAt <= Date.now());

  useEffect(() => {
    if (secondsLeft > 0) {
      return;
    }
    if (!wasOverOnOpen) {
      Vibration.vibrate();
    }
    stopRest();
  }, [secondsLeft, wasOverOnOpen]);

  return (
    <View style={styles.bar} accessibilityRole="timer">
      <Text style={styles.time}>Rest {formatDuration(secondsLeft)}</Text>
      <Button label={`+${REST_EXTENSION_SECONDS}s`} onPress={() => extendRest()} />
      <Button label="Skip" onPress={stopRest} />
    </View>
  );
}

/** Counts down the rest after a set; shows nothing when not resting. */
export function RestTimer() {
  const endsAt = useRestTimer((state) => state.endsAt);
  return endsAt === null ? null : <RestCountdown endsAt={endsAt} />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#888',
  },
  time: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
