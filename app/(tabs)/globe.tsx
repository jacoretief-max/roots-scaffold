import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '@/constants/theme';

// Globe screen — Three.js implementation goes here in Phase 2
export default function GlobeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.globe}>
        <Text style={styles.globeLabel}>Globe</Text>
        <Text style={styles.globeSub}>
          Three.js / react-three-fiber{'\n'}renders here in Phase 2
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.globeBackground },
  globe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  globeLabel: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    color: '#fff',
    fontWeight: '700',
  },
  globeSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
});
