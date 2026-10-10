import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

type ComingSoonProps = {
  title: string;
  description: string;
};

/** Placeholder for a tab whose features are built in a later step. */
export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});
