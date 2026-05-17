import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import dayjs from 'dayjs';

export default function VerificationScreen() {
  const { user } = useAuthStore();

  const dob = user?.dateOfBirth
    ? dayjs(user.dateOfBirth)
    : null;

  const age = dob ? dayjs().diff(dob, 'year') : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verification</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* Age verification status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: Colors.statusAvailable }]} />
            <Text style={styles.statusText}>Age verified</Text>
          </View>
          {dob && (
            <>
              <Text style={styles.dobText}>
                {dob.format('D MMMM YYYY')}
              </Text>
              <Text style={styles.ageText}>Age {age}</Text>
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>Why we verify age</Text>
        <Text style={styles.body}>
          Rooted In is for adults aged 18 and over. We ask for your date of birth during registration and enforce this server-side. It's a firm policy — not a guideline — and it applies to every account on the platform.
        </Text>

        {/* Compliance */}
        <Text style={styles.sectionLabel}>Compliance</Text>
        <View style={styles.complianceRow}>
          {['COPPA (USA)', 'GDPR (EU)', 'POPIA (South Africa)'].map(c => (
            <View key={c} style={styles.complianceBadge}>
              <Text style={styles.complianceBadgeText}>{c}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  headerBack: { fontSize: Typography.body, color: Colors.terracotta, fontFamily: Typography.fontFamily },
  headerTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  content: { flex: 1, padding: Spacing.lg },

  statusCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.statusAvailable,
  },
  dobText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    marginTop: Spacing.xs,
  },
  ageText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: 6,
    marginTop: Spacing.lg,
  },
  body: {
    fontSize: 14,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },

  complianceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  complianceBadge: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  complianceBadgeText: {
    fontSize: 12,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },
});
