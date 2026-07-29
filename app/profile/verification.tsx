import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUpdateProfile } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import dayjs from 'dayjs';

const SUPPORT_EMAIL = 'info@rooikatlabs.com';

export default function VerificationScreen() {
  const { user } = useAuthStore();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const [showDob, setShowDob] = useState<boolean>(user?.showDobToConnections ?? false);

  const dob = user?.dateOfBirth ? dayjs(user.dateOfBirth) : null;

  const handleToggle = (value: boolean) => {
    setShowDob(value);
    updateProfile(
      { showDobToConnections: value },
      { onError: () => {
        setShowDob(!value);
        Alert.alert('Error', 'Could not update this setting. Please try again.');
      }}
    );
  };

  const handleContactSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Date of birth correction`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Date of birth</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.statusCard}>
          {dob ? (
            <>
              <Text style={styles.dobText}>{dob.format('D MMMM YYYY')}</Text>
              <Text style={styles.ageText}>Age {dayjs().diff(dob, 'year')}</Text>
            </>
          ) : (
            <Text style={styles.dobText}>Not set</Text>
          )}
        </View>

        <Text style={styles.body}>
          Rooted In is for people 18 years and older. We ask for your date of birth during
          registration and enforce this server-side.
        </Text>

        <TouchableOpacity onPress={handleContactSupport}>
          <Text style={styles.contactLink}>
            This date is incorrect — contact us to fix it
          </Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Sharing</Text>
        <View style={styles.sectionCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Show my date of birth</Text>
              <Text style={styles.toggleDesc}>
                When on, people you're connected with can see your full date of birth.
                Turn this off any time — your connections will still get a prompt to reach out on your birthday either way.
              </Text>
            </View>
            <Switch
              value={showDob}
              onValueChange={handleToggle}
              disabled={isPending}
              trackColor={{ false: Colors.tan, true: Colors.terracotta }}
              thumbColor={Colors.white}
            />
          </View>
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
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  dobText: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  ageText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  body: {
    fontSize: 14,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  contactLink: {
    fontSize: 13,
    color: Colors.terracottaDark,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
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
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  toggleInfo: { flex: 1 },
  toggleLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
  },
  toggleDesc: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
    lineHeight: 17,
  },
});
