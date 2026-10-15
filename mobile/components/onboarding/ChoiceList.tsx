import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import type { Choice } from '@/src/onboarding/onboardingModel';

type ChoiceListProps<Value extends string> = {
  /** Names the group for screen readers, such as "Phase". */
  label: string;
  choices: readonly Choice<Value>[];
  selected: Value | null;
  onSelect: (value: Value) => void;
};

const BRAND_BLUE = '#2f95dc';
const SELECTED_BORDER_WIDTH = 2;

/** A list of cards where exactly one can be chosen. */
export function ChoiceList<Value extends string>({
  label,
  choices,
  selected,
  onSelect,
}: ChoiceListProps<Value>) {
  return (
    <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {choices.map((choice) => {
        const isSelected = choice.value === selected;
        return (
          <Pressable
            key={choice.value}
            style={[styles.card, isSelected ? styles.cardSelected : null]}
            onPress={() => onSelect(choice.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={choice.label}
            accessibilityHint={choice.description}>
            <Text style={styles.label}>{choice.label}</Text>
            <Text style={styles.description}>{choice.description}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 2,
  },
  cardSelected: {
    borderWidth: SELECTED_BORDER_WIDTH,
    borderColor: BRAND_BLUE,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
  },
});
