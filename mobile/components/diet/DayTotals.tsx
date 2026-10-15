import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import type { Macros } from '@/src/api/foodLog';
import type { Targets } from '@/src/api/targets';
import {
  describeCaloriesLeft,
  formatCalories,
  formatGrams,
  formatGramsOfTarget,
} from '@/src/diet/dietModel';

type MacroProps = { label: string; grams: number; targetGrams: number | null };

function Macro({ label, grams, targetGrams }: MacroProps) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>
        {targetGrams === null ? formatGrams(grams) : formatGramsOfTarget(grams, targetGrams)}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

type DayTotalsProps = {
  totals: Macros;
  /** The day's targets; null when none had been set by then. */
  targets?: Targets | null;
};

/** A day's calories and macros, added up over everything logged, against its targets. */
export function DayTotals({ totals, targets = null }: DayTotalsProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.calories}>{formatCalories(totals.calories)}</Text>
      {targets ? (
        <Text style={styles.target}>
          of {formatCalories(targets.calories)} ·{' '}
          {describeCaloriesLeft(totals.calories, targets.calories)}
        </Text>
      ) : null}
      <View style={styles.macros}>
        <Macro label="Protein" grams={totals.proteinG} targetGrams={targets?.proteinG ?? null} />
        <Macro label="Carbs" grams={totals.carbsG} targetGrams={targets?.carbsG ?? null} />
        <Macro label="Fat" grams={totals.fatG} targetGrams={targets?.fatG ?? null} />
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
  target: {
    marginTop: -8,
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.7,
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
