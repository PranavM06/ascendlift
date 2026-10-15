import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import type { FoodLogEntry } from '@/src/api/foodLog';
import {
  describeAmount,
  formatCalories,
  MEAL_LABEL,
  type MealGroup,
} from '@/src/diet/dietModel';

type MealSectionProps = {
  group: MealGroup;
  onAddFood: () => void;
  onOpenEntry: (entry: FoodLogEntry) => void;
};

function describeEntry(entry: FoodLogEntry): string {
  const details = [entry.food.brand, describeAmount(entry.food, entry.servings)];
  return details.filter(Boolean).join(' · ');
}

/** One meal of a day: what was eaten, its calories, and a way to add more. */
export function MealSection({ group, onAddFood, onOpenEntry }: MealSectionProps) {
  const mealLabel = MEAL_LABEL[group.meal];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.meal}>{mealLabel}</Text>
        {group.entries.length > 0 ? (
          <Text style={styles.detail}>{formatCalories(group.calories)}</Text>
        ) : null}
      </View>

      {group.entries.map((entry) => (
        <Pressable
          key={entry.id}
          style={styles.entry}
          onPress={() => onOpenEntry(entry)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${entry.food.name}`}>
          <View style={styles.entryText}>
            <Text style={styles.food}>{entry.food.name}</Text>
            <Text style={styles.detail}>{describeEntry(entry)}</Text>
          </View>
          <Text style={styles.entryCalories}>{formatCalories(entry.calories)}</Text>
        </Pressable>
      ))}

      <Pressable
        onPress={onAddFood}
        accessibilityRole="button"
        accessibilityLabel={`Add food to ${mealLabel}`}>
        <Text style={styles.add}>Add food</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  meal: {
    fontSize: 18,
    fontWeight: '600',
  },
  detail: {
    fontSize: 14,
    opacity: 0.6,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  entryText: {
    flex: 1,
    gap: 2,
  },
  food: {
    fontSize: 16,
  },
  entryCalories: {
    fontSize: 15,
  },
  add: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f95dc',
  },
});
