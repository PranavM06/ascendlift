import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { DayTotals } from '@/components/diet/DayTotals';
import { MealSection } from '@/components/diet/MealSection';
import { Text, View } from '@/components/Themed';
import type { FoodLogEntry, Meal } from '@/src/api/foodLog';
import { userMessage } from '@/src/api/http';
import {
  describeDay,
  groupEntriesByMeal,
  shiftDateKey,
  toDateKey,
} from '@/src/diet/dietModel';
import { startEditingEntry } from '@/src/diet/entryDraft';
import { useDay } from '@/src/diet/useDiet';

function openEntry(entry: FoodLogEntry) {
  startEditingEntry(entry);
  router.push('/food-entry');
}

type DayStepProps = { label: string; symbol: string; onPress: () => void; disabled?: boolean };

function DayStep({ label, symbol, onPress, disabled = false }: DayStepProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}>
      <Text style={[styles.step, disabled ? styles.stepDisabled : null]}>{symbol}</Text>
    </Pressable>
  );
}

export default function DietScreen() {
  const today = toDateKey(new Date());
  const [entryDate, setEntryDate] = useState(today);
  const day = useDay(entryDate);
  const isToday = entryDate === today;

  function addFood(meal: Meal) {
    router.push({ pathname: '/food-search', params: { meal, date: entryDate } });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.dayRow}>
        <DayStep
          label="Previous day"
          symbol="‹"
          onPress={() => setEntryDate(shiftDateKey(entryDate, -1))}
        />
        <Text style={styles.day}>{describeDay(entryDate, today)}</Text>
        <DayStep
          label="Next day"
          symbol="›"
          onPress={() => setEntryDate(shiftDateKey(entryDate, 1))}
          disabled={isToday}
        />
      </View>
      {isToday ? null : <Button label="Back to today" onPress={() => setEntryDate(today)} />}

      {day.isPending ? <ActivityIndicator style={styles.status} /> : null}
      {day.isError ? (
        <>
          <Text style={styles.error} accessibilityRole="alert">
            {userMessage(day.error, "Couldn't load this day.")}
          </Text>
          <Button label="Try again" onPress={() => day.refetch()} />
        </>
      ) : null}
      {day.isSuccess ? (
        <>
          <DayTotals totals={day.data.totals} />
          {groupEntriesByMeal(day.data.entries).map((group) => (
            <MealSection
              key={group.meal}
              group={group}
              onAddFood={() => addFood(group.meal)}
              onOpenEntry={openEntry}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  day: {
    fontSize: 22,
    fontWeight: '600',
  },
  step: {
    paddingHorizontal: 12,
    fontSize: 32,
    color: '#2f95dc',
  },
  stepDisabled: {
    opacity: 0.3,
  },
  status: {
    padding: 24,
  },
  error: {
    fontSize: 15,
    textAlign: 'center',
    color: '#c0392b',
  },
});
