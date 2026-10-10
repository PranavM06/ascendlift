import { Pressable, StyleSheet, Text } from 'react-native';

import { useThemeColor } from '@/components/Themed';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** primary is filled, secondary is outlined, danger is for deleting. */
  variant?: ButtonVariant;
};

const BRAND_BLUE = '#2f95dc';
const DANGER_RED = '#c0392b';
const DISABLED_OPACITY = 0.5;

export function Button({ label, onPress, disabled = false, variant = 'secondary' }: ButtonProps) {
  const textColor = useThemeColor({}, 'text');
  const labelColor = { primary: '#fff', secondary: textColor, danger: DANGER_RED }[variant];

  return (
    <Pressable
      style={[
        styles.button,
        variant === 'primary' ? styles.primary : styles.outlined,
        disabled ? styles.disabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: BRAND_BLUE,
  },
  outlined: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
  },
  disabled: {
    opacity: DISABLED_OPACITY,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
