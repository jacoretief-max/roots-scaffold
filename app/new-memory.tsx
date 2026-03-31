import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function NewMemoryScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>New Memory</Text>
      <Text style={styles.sub}>4-step wizard — coming in Phase 2</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  title: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    fontWeight: '700',
    marginTop: Spacing.md,
  },
  sub: { fontSize: 13, color: Colors.textLight, marginTop: Spacing.sm },
});
