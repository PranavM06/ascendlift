import { StyleSheet, TextInput } from 'react-native';

import { useThemeColor } from '@/components/Themed';
import type { UnitPreference } from '@/src/api/users';
import { UNIT_LABEL } from '@/src/units/weight';

type SetFieldsProps = {
  unit: UnitPreference;
  weightText: string;
  repsText: string;
  rpeText: string;
  onChangeWeight: (text: string) => void;
  onChangeReps: (text: string) => void;
  onChangeRpe: (text: string) => void;
};

const PLACEHOLDER_COLOR = '#888';

/** The weight, reps and RPE inputs of a set, laid out by the row that holds them. */
export function SetFields({
  unit,
  weightText,
  repsText,
  rpeText,
  onChangeWeight,
  onChangeReps,
  onChangeRpe,
}: SetFieldsProps) {
  const textColor = useThemeColor({}, 'text');
  const inputStyle = [styles.input, { color: textColor }];

  return (
    <>
      <TextInput
        style={inputStyle}
        value={weightText}
        onChangeText={onChangeWeight}
        keyboardType="decimal-pad"
        placeholder={UNIT_LABEL[unit]}
        placeholderTextColor={PLACEHOLDER_COLOR}
        accessibilityLabel={`Weight in ${UNIT_LABEL[unit]}`}
      />
      <TextInput
        style={inputStyle}
        value={repsText}
        onChangeText={onChangeReps}
        keyboardType="number-pad"
        placeholder="reps"
        placeholderTextColor={PLACEHOLDER_COLOR}
        accessibilityLabel="Reps"
      />
      <TextInput
        style={inputStyle}
        value={rpeText}
        onChangeText={onChangeRpe}
        keyboardType="decimal-pad"
        placeholder="RPE"
        placeholderTextColor={PLACEHOLDER_COLOR}
        accessibilityLabel="RPE, optional"
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
});
