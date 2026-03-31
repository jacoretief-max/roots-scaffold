import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Person</Text>
      <Text style={styles.sub}>Person screen — coming in Phase 2</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  back: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    fontWeight: '700',
  },
  sub: { fontSize: 13, color: Colors.textLight, marginTop: Spacing.sm },
});
