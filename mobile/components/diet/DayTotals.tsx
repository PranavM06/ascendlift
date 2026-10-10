import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import type { Macros } from '@/src/api/foodLog';
import { formatCalories, formatGrams } from '@/src/diet/dietModel';

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{formatGrams(grams)}</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

/** A day's calories and macros, added up over everything logged. */
export function DayTotals({ totals }: { totals: Macros }) {
  return (
    <View style={styles.card}>
      <Text style={styles.calories}>{formatCalories(totals.calories)}</Text>
      <View style={styles.macros}>
        <Macro label="Protein" grams={totals.proteinG} />
        <Macro label="Carbs" grams={totals.carbsG} />
        <Macro label="Fat" grams={totals.fatG} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 12,
  },
  calories: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  macroValue: {
    fontSize: 17,
    fontWeight: '600',
  },
  macroLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
});
