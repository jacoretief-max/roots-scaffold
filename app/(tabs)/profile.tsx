import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/authStore';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      {/* User info */}
      <View style={styles.card}>
        <View style={[styles.avatar, { backgroundColor: user?.avatarColour ?? Colors.terracotta }]}>
          <Text style={styles.avatarText}>
            {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.displayName ?? 'Unknown'}</Text>
        <Text style={styles.email}>{user?.email ?? ''}</Text>
      </View>

      <Text style={styles.sub}>
        Account · Security · Personalise · Privacy · Verification
      </Text>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
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
    marginBottom: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: { fontSize: 28, color: Colors.white, fontWeight: '700' },
  name: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  email: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
  },
  sub: {
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: Spacing.xl,
  },
  logoutBtn: {
    borderWidth: 0.5,
    borderColor: Colors.terracotta,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: Spacing.xl,
  },
  logoutText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    fontWeight: '700',
  },
});
