import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';

type ChipProps = { label: string; isSelected: boolean; onPress: () => void };

const BRAND_BLUE = '#2f95dc';

/** A small pill for choosing among a few options; filled when selected. */
export function Chip({ label, isSelected, onPress }: ChipProps) {
  return (
    <Pressable
      style={[styles.chip, isSelected ? styles.chipSelected : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}>
      <Text style={isSelected ? styles.labelSelected : styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
  },
  chipSelected: {
    backgroundColor: BRAND_BLUE,
    borderColor: BRAND_BLUE,
  },
  label: {
    fontSize: 14,
  },
  labelSelected: {
    fontSize: 14,
    color: '#fff',
  },
});
