import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Switch, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useWhatsAppOptIn } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

export default function SecurityScreen() {
  const { user } = useAuthStore();

  const [twofa, setTwofa]   = useState(false);
  const [notifs, setNotifs] = useState(true);

  // WhatsApp opt-in state — seed from stored user data if available
  const [waOptedIn, setWaOptedIn]   = useState<boolean>((user as any)?.whatsappOptedIn ?? false);
  const [waNumber, setWaNumber]     = useState<string>(
    (user as any)?.whatsappNumber ?? user?.phoneNumber ?? ''
  );
  const [waSaved, setWaSaved]       = useState(false);

  const { mutate: saveWhatsApp, isPending: waSaving } = useWhatsAppOptIn();

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

  const handleWaToggle = (value: boolean) => {
    setWaOptedIn(value);
    setWaSaved(false);

    if (!value) {
      // Opt out immediately — no number needed
      saveWhatsApp(
        { optedIn: false },
        {
          onSuccess: () => setWaSaved(true),
          onError: () => Alert.alert('Error', 'Could not update WhatsApp settings. Try again.'),
        }
      );
    }
  };

  const handleWaSave = () => {
    const cleaned = waNumber.trim().replace(/\s+/g, '');
    if (!cleaned) {
      Alert.alert('Phone number required', 'Enter your WhatsApp number to enable nudges.');
      return;
    }
    saveWhatsApp(
      { whatsappNumber: cleaned, optedIn: true },
      {
        onSuccess: () => {
          setWaSaved(true);
          Alert.alert(
            'WhatsApp enabled',
            `Roots will send nudges and accept catch-up messages at ${cleaned}.`
          );
        },
        onError: () => Alert.alert('Error', 'Could not save WhatsApp settings. Try again.'),
      }
    );
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

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">

        {/* ── Authentication ─────────────────────────── */}
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
              <Text style={styles.toggleDesc}>Nudges and birthday reminders</Text>
            </View>
            <Switch
              value={notifs}
              onValueChange={setNotifs}
              trackColor={{ false: Colors.tan, true: Colors.terracotta }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        {/* ── WhatsApp ───────────────────────────────── */}
        <Text style={styles.sectionLabel}>WhatsApp</Text>
        <View style={styles.sectionCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>WhatsApp nudges</Text>
              <Text style={styles.toggleDesc}>
                Receive nudges via WhatsApp and log catch-ups by messaging Roots
              </Text>
            </View>
            <Switch
              value={waOptedIn}
              onValueChange={handleWaToggle}
              trackColor={{ false: Colors.tan, true: Colors.terracotta }}
              thumbColor={Colors.white}
            />
          </View>

          {waOptedIn && (
            <>
              <View style={styles.rowDivider} />
              <View style={styles.waNumberRow}>
                <Text style={styles.waNumberLabel}>Your WhatsApp number</Text>
                <Text style={styles.waNumberHint}>
                  Include your country code, e.g. +27821234567
                </Text>
                <View style={styles.waInputRow}>
                  <TextInput
                    style={styles.waInput}
                    value={waNumber}
                    onChangeText={(t) => { setWaNumber(t); setWaSaved(false); }}
                    placeholder="+27821234567"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[styles.waSaveBtn, waSaving && styles.waSaveBtnDisabled]}
                    onPress={handleWaSave}
                    disabled={waSaving || waSaved}
                  >
                    {waSaving
                      ? <ActivityIndicator color={Colors.white} size="small" />
                      : <Text style={styles.waSaveBtnText}>{waSaved ? 'Saved ✓' : 'Save'}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>

        {waOptedIn && (
          <Text style={styles.hint}>
            Message the Roots WhatsApp number anytime — "Just caught up with Sarah" — and Roots will log it automatically.
          </Text>
        )}

        {/* ── Phone number ───────────────────────────── */}
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
  headerBack: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
  },
  headerTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  content: { flex: 1, padding: Spacing.lg },
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
    lineHeight: 17,
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

  // WhatsApp number input
  waNumberRow: { padding: Spacing.md },
  waNumberLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
    marginBottom: 2,
  },
  waNumberHint: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
  },
  waInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  waInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  waSaveBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minWidth: 70,
    alignItems: 'center',
  },
  waSaveBtnDisabled: { backgroundColor: Colors.sage },
  waSaveBtnText: {
    fontSize: Typography.body,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
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
    marginTop: Spacing.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
});
