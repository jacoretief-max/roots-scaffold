import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Switch, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '@/store/authStore';
import { useWhatsAppOptIn, useSendPhoneChangeCode, useConfirmPhoneChange } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const BIOMETRICS_KEY = 'rootedin_biometrics_enabled';

export default function SecurityScreen() {
  const { user } = useAuthStore();

  const [notifs, setNotifs]         = useState(true);
  const [biometrics, setBiometrics] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);

  // WhatsApp opt-in state — seed from stored user data if available
  const [waOptedIn, setWaOptedIn]   = useState<boolean>((user as any)?.whatsappOptedIn ?? false);
  const [waNumber, setWaNumber]     = useState<string>(
    (user as any)?.whatsappNumber ?? user?.phoneNumber ?? ''
  );
  const [waSaved, setWaSaved]       = useState(false);

  const { mutate: saveWhatsApp, isPending: waSaving } = useWhatsAppOptIn();

  // Phone number re-verification state
  const [phoneStep, setPhoneStep]   = useState<'idle' | 'code'>('idle');
  const [newPhone, setNewPhone]     = useState(user?.phoneNumber ?? '');
  const [phoneCode, setPhoneCode]   = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const { mutate: sendPhoneCode, isPending: sendingCode } = useSendPhoneChangeCode();
  const { mutate: confirmPhone, isPending: confirmingPhone } = useConfirmPhoneChange();

  const startResendCooldown = () => {
    setResendCooldown(30);
    const timer = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(timer); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const handleSendPhoneCode = () => {
    const cleaned = newPhone.trim().replace(/\s+/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(cleaned)) {
      Alert.alert('Phone number', 'Enter your phone number in international format, e.g. +14155552671.');
      return;
    }
    sendPhoneCode(cleaned, {
      onSuccess: () => {
        setNewPhone(cleaned);
        setPhoneStep('code');
        startResendCooldown();
      },
      onError: (err: any) => {
        Alert.alert('Could not send code', err?.response?.data?.error ?? 'Please check the number and try again.');
      },
    });
  };

  const handleResendPhoneCode = () => {
    if (resendCooldown > 0) return;
    sendPhoneCode(newPhone, {
      onSuccess: () => startResendCooldown(),
      onError: () => Alert.alert('Could not resend code', 'Please try again shortly.'),
    });
  };

  const handleConfirmPhone = () => {
    if (!phoneCode || phoneCode.length < 4) {
      Alert.alert('Enter code', 'Please enter the verification code we texted you.');
      return;
    }
    confirmPhone({ phoneNumber: newPhone, code: phoneCode }, {
      onSuccess: () => {
        setPhoneStep('idle');
        setPhoneCode('');
        Alert.alert('Phone number verified', 'Your phone number has been updated.');
      },
      onError: (err: any) => {
        Alert.alert('Verification failed', err?.response?.data?.error ?? 'Please check the code and try again.');
      },
    });
  };

  useEffect(() => {
    (async () => {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBioSupported(hardware && enrolled);
      const stored = await SecureStore.getItemAsync(BIOMETRICS_KEY).catch(() => null);
      setBiometrics(stored === 'true');
    })();
  }, []);

  const handleBiometricsToggle = async (value: boolean) => {
    if (value) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm your identity to enable Face ID sign-in',
        fallbackLabel: 'Use password',
      });
      if (result.success) {
        await SecureStore.setItemAsync(BIOMETRICS_KEY, 'true').catch(() => {});
        setBiometrics(true);
      }
    } else {
      await SecureStore.setItemAsync(BIOMETRICS_KEY, 'false').catch(() => {});
      setBiometrics(false);
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
            `Rooted In will send nudges and accept catch-up messages at ${cleaned}.`
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
          {bioSupported ? (
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Face ID / Touch ID</Text>
                <Text style={styles.toggleDesc}>Sign in without typing your password</Text>
              </View>
              <Switch
                value={biometrics}
                onValueChange={handleBiometricsToggle}
                trackColor={{ false: Colors.tan, true: Colors.terracotta }}
                thumbColor={Colors.white}
              />
            </View>
          ) : (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowLabel}>Face ID / Touch ID</Text>
                <Text style={styles.rowDesc}>Not available on this device</Text>
              </View>
            </View>
          )}
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
                Receive nudges via WhatsApp and log catch-ups by messaging Rooted In
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
            Message the Rooted In WhatsApp number anytime — "Just caught up with Sarah" — and Rooted In will log it automatically.
          </Text>
        )}

        {/* ── Phone number ───────────────────────────── */}
        <Text style={styles.sectionLabel}>Phone number</Text>
        <View style={styles.sectionCard}>
          {phoneStep === 'idle' ? (
            <View style={styles.waNumberRow}>
              <Text style={styles.waNumberLabel}>Verified phone number</Text>
              <Text style={styles.waNumberHint}>
                Used for account recovery and future 2FA. Changing it sends a new code — include your country code.
              </Text>
              <View style={styles.waInputRow}>
                <TextInput
                  style={styles.waInput}
                  value={newPhone}
                  onChangeText={setNewPhone}
                  placeholder="+14155552671"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.waSaveBtn, sendingCode && styles.waSaveBtnDisabled]}
                  onPress={handleSendPhoneCode}
                  disabled={sendingCode || newPhone.trim() === (user?.phoneNumber ?? '')}
                >
                  {sendingCode
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={styles.waSaveBtnText}>Send code</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.waNumberRow}>
              <Text style={styles.waNumberLabel}>Enter verification code</Text>
              <Text style={styles.waNumberHint}>
                We texted a code to {newPhone}.
              </Text>
              <View style={styles.waInputRow}>
                <TextInput
                  style={styles.waInput}
                  value={phoneCode}
                  onChangeText={setPhoneCode}
                  placeholder="123456"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={[styles.waSaveBtn, confirmingPhone && styles.waSaveBtnDisabled]}
                  onPress={handleConfirmPhone}
                  disabled={confirmingPhone}
                >
                  {confirmingPhone
                    ? <ActivityIndicator color={Colors.white} size="small" />
                    : <Text style={styles.waSaveBtnText}>Confirm</Text>
                  }
                </TouchableOpacity>
              </View>
              <View style={styles.phoneCodeActions}>
                <TouchableOpacity onPress={handleResendPhoneCode} disabled={resendCooldown > 0}>
                  <Text style={styles.phoneCodeLink}>
                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setPhoneStep('idle'); setPhoneCode(''); }}>
                  <Text style={styles.phoneCodeLink}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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

  phoneCodeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  phoneCodeLink: {
    fontSize: 13,
    color: Colors.terracottaDark,
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
