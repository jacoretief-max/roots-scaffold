import { View, Text, TouchableOpacity, StyleSheet, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import dayjs from 'dayjs';

const SettingsRow = ({
  label,
  value,
  onPress,
  destructive,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
    <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>
      {label}
    </Text>
    <View style={styles.rowRight}>
      {value && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      <Text style={styles.rowChevron}>›</Text>
    </View>
  </TouchableOpacity>
);

const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/auth');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Avatar + name header */}
      <View style={styles.profileHeader}>
        <TouchableOpacity
          style={[styles.avatarWrap, { backgroundColor: user?.avatarColour ?? Colors.terracotta }]}
          onPress={() => router.push('/profile/personalise')}
          activeOpacity={0.85}
        >
          {(user as any)?.avatarUrl ? (
            <Image
              source={{ uri: (user as any).avatarUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <Text style={styles.avatarText}>
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </Text>
          )}
          <View style={styles.editBadge}>
            <Text style={styles.editBadgeText}>Edit</Text>
          </View>
        </TouchableOpacity>
        <Text style={styles.displayName}>{user?.displayName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {user?.city && <Text style={styles.city}>{user.city}</Text>}
      </View>

      {/* Settings sections */}
      <View style={styles.sections}>

        <SectionHeader title="Account" />
        <View style={styles.sectionCard}>
          <SettingsRow
            label="Account details"
            value={user?.displayName}
            onPress={() => router.push('/profile/account')}
          />
          <SettingsRow
            label="Change password"
            onPress={() => router.push('/profile/password')}
          />
        </View>

        <SectionHeader title="Personalise" />
        <View style={styles.sectionCard}>
          <SettingsRow
            label="Avatar colour"
            value={user?.avatarColour}
            onPress={() => router.push('/profile/personalise')}
          />
          <SettingsRow
            label="Profile photo"
            value="Upload a photo"
            onPress={() => router.push('/profile/personalise')}
          />
        </View>

        <SectionHeader title="Privacy" />
        <View style={styles.sectionCard}>
          <SettingsRow
            label="Privacy & Cookies"
            onPress={() => router.push('/profile/privacy')}
          />
          <SettingsRow
            label="Verification"
            value={user?.dateOfBirth ? `Born ${dayjs(user.dateOfBirth).format('D MMM YYYY')}` : 'Not verified'}
            onPress={() => router.push('/profile/verification')}
          />
        </View>

        <SectionHeader title="Security" />
        <View style={styles.sectionCard}>
          <SettingsRow
            label="Two-factor authentication"
            value="Off"
            onPress={() => router.push('/profile/security')}
          />
          <SettingsRow
            label="Phone number"
            value={user?.phoneNumber ?? 'Not set'}
            onPress={() => router.push('/profile/security')}
          />
        </View>

        {/* Sign out */}
        <View style={[styles.sectionCard, { marginTop: Spacing.xl }]}>
          <SettingsRow
            label="Sign out"
            onPress={handleLogout}
            destructive
          />
        </View>

        <Text style={styles.version}>Roots v1.0 · Phase 2</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  profileHeader: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: { fontSize: 32, color: Colors.white, fontWeight: '700' },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.textDark,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  editBadgeText: { fontSize: 9, color: Colors.white, fontWeight: '700' },
  displayName: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  email: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  city: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },

  sections: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionHeader: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    overflow: 'hidden',
    ...Shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan + '88',
  },
  rowLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  rowLabelDestructive: { color: Colors.scoreLow },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowValue: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    maxWidth: 160,
  },
  rowChevron: { fontSize: 18, color: Colors.textLight },

  version: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
});
