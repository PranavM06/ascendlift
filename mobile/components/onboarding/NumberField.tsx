import { StyleSheet, TextInput } from 'react-native';

import { Text, useThemeColor, View } from '@/components/Themed';

type NumberFieldProps = {
  label: string;
  /** Shown after the field, such as "kcal" or "g". */
  unit: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** decimal-pad for weights; number-pad for whole numbers. */
  keyboardType?: 'number-pad' | 'decimal-pad';
};

const PLACEHOLDER_COLOR = '#888';

/** A labelled number input with its unit beside it. */
export function NumberField({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'number-pad',
}: NumberFieldProps) {
  const textColor = useThemeColor({}, 'text');

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { color: textColor }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={PLACEHOLDER_COLOR}
          selectTextOnFocus
          accessibilityLabel={`${label} in ${unit}`}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
  },
  unit: {
    width: 36,
    fontSize: 16,
    opacity: 0.7,
  },
});
