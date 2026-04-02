import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

export default function SecurityScreen() {
  const [twofa, setTwofa] = useState(false);
  const [notifs, setNotifs] = useState(true);

  const handleTwofaToggle = (value: boolean) => {
    if (value) {
      Alert.alert(
        'Two-factor authentication',
        'Setting up 2FA with an authenticator app is coming in Phase 4.',
        [{ text: 'OK' }]
      );
    } else {
      setTwofa(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.content}>

        <Text style={styles.sectionLabel}>Authentication</Text>
        <View style={styles.sectionCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Two-factor authentication</Text>
              <Text style={styles.toggleDesc}>Add an extra layer of security to your account</Text>
            </View>
            <Switch
              value={twofa}
              onValueChange={handleTwofaToggle}
              trackColor={{ false: Colors.tan, true: Colors.terracotta }}
              thumbColor={Colors.white}
            />
          </View>
          <View style={styles.rowDivider} />
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Push notifications</Text>
              <Text style={styles.toggleDesc}>New memories and AI nudges</Text>
            </View>
            <Switch
              value={notifs}
              onValueChange={setNotifs}
              trackColor={{ false: Colors.tan, true: Colors.terracotta }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Phone number</Text>
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => Alert.alert('Phone verification', 'SMS OTP verification is coming in Phase 4.')}
          >
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Verify phone number</Text>
              <Text style={styles.rowDesc}>Used for account recovery and 2FA</Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Phase 4</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Your password can be changed from the Account details screen.
        </Text>

      </View>
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
  content: { padding: Spacing.lg },
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
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
  },
  rowDivider: { height: 0.5, backgroundColor: Colors.tan },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  rowInfo: { flex: 1 },
  rowLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
  },
  rowDesc: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  comingSoonBadge: {
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  hint: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: Spacing.lg,
    lineHeight: 18,
    textAlign: 'center',
  },
});
