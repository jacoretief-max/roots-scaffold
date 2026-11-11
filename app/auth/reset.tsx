import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import SmsConsentNotice from '@/components/SmsConsentNotice';
import { smsConsentPayload } from '@/constants/smsConsent';

const MIN_PASSWORD_LENGTH = 8;

// Forgot password → code by SMS to the account's phone → new password.
// The server never says whether an email has an account.
export default function ResetPasswordScreen() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const { setTokens, setUser } = useAuthStore();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const startCooldown = () => {
    setCooldown(30);
    const t = setInterval(() => setCooldown(s => { if (s <= 1) { clearInterval(t); return 0; } return s - 1; }), 1000);
  };

  const sendCode = async () => {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) { Alert.alert('Email', 'Please enter the email address on your account.'); return; }
    if (!consent) { Alert.alert('Verification code', 'Please tick the box to agree to receive a one-time security code by text.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/password/send-code', { email: e, ...smsConsentPayload() });
      setStep('code');
      startCooldown();
    } catch (err: any) {
      Alert.alert('Could not send code', err?.response?.data?.error ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    try {
      await api.post('/auth/password/send-code', { email: email.trim().toLowerCase(), ...smsConsentPayload() });
      startCooldown();
    } catch (err: any) {
      Alert.alert('Could not resend', err?.response?.data?.error ?? 'Please try again shortly.');
    }
  };

  const reset = async () => {
    if (code.trim().length < 4) { Alert.alert('Code', 'Please enter the code we texted you.'); return; }
    if (password.length < MIN_PASSWORD_LENGTH) { Alert.alert('Password too short', `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirm) { Alert.alert('Passwords do not match', 'Please make sure both passwords are identical.'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/password/reset', {
        email: email.trim().toLowerCase(), code: code.trim(), newPassword: password,
      });
      await setTokens(data.data.tokens);
      const me = await api.get('/users/me');
      setUser(me.data.data);
      router.replace('/(tabs)');
      Alert.alert('Password reset', 'Your password has been changed. You have been signed out on your other devices.');
    } catch (err: any) {
      Alert.alert('Could not reset password', err?.response?.data?.error ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>← Back to sign in</Text>
          </TouchableOpacity>

          {step === 'email' ? (
            <View style={styles.form}>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.sub}>
                Enter the email address on your account. We'll text a code to the phone number you signed up with.
              </Text>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  placeholderTextColor={Colors.textLight}
                />
              </View>
              <SmsConsentNotice checked={consent} onToggle={() => setConsent(v => !v)} />
              <TouchableOpacity
                style={[styles.btn, (loading || !consent) && styles.btnDisabled]}
                onPress={sendCode}
                disabled={loading || !consent}
              >
                <Text style={styles.btnText}>{loading ? 'Sending…' : 'Send code'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.title}>Enter your code</Text>
              <Text style={styles.sub}>
                If {email.trim()} has an account, we've texted a code to its phone number. It expires in 10 minutes.
              </Text>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Code</Text>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={10}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.row}>
                  <TextInput
                    ref={passwordRef}
                    style={[styles.input, { flex: 1 }]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                  />
                  <TouchableOpacity onPress={() => setShowPw(v => !v)} style={styles.eye}>
                    <Text style={styles.eyeText}>{showPw ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>At least {MIN_PASSWORD_LENGTH} characters.</Text>
              </View>
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Confirm new password</Text>
                <TextInput
                  ref={confirmRef}
                  style={styles.input}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={reset}
                />
              </View>
              <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={reset} disabled={loading}>
                <Text style={styles.btnText}>{loading ? 'Saving…' : 'Reset password'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={resend} style={styles.link} disabled={cooldown > 0}>
                <Text style={[styles.linkText, cooldown > 0 && { color: Colors.textLight }]}>
                  {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStep('email'); setCode(''); }} style={styles.link}>
                <Text style={styles.linkText}>Use a different email</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            onPress={() => Linking.openURL('mailto:info@rooikatlabs.com?subject=Rooted%20In%20password%20reset')}
            style={[styles.link, { marginTop: Spacing.xl }]}
          >
            <Text style={styles.helpText}>No longer have this phone number? Email info@rooikatlabs.com</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.lg },
  back: { paddingVertical: Spacing.sm, marginBottom: Spacing.lg },
  backText: { fontSize: Typography.body, color: Colors.terracotta, fontFamily: Typography.fontFamily },
  form: { gap: Spacing.md },
  title: { fontSize: Typography.heading.md, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  sub: { fontSize: 14, lineHeight: 21, color: Colors.textLight, fontFamily: Typography.fontFamily },
  inputWrap: { gap: 6 },
  label: { fontSize: Typography.label, color: Colors.terracotta, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: Typography.fontFamily },
  input: {
    backgroundColor: Colors.card, borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.sm,
    padding: Spacing.md, fontSize: Typography.body, fontFamily: Typography.fontFamily, color: Colors.textDark,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eye: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  eyeText: { fontSize: 13, color: Colors.terracottaDark, fontFamily: Typography.fontFamily },
  hint: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },
  btn: { backgroundColor: Colors.terracotta, borderRadius: BorderRadius.sm, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  btnDisabled: { backgroundColor: Colors.tan },
  btnText: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.white },
  link: { alignItems: 'center', paddingVertical: Spacing.sm },
  linkText: { fontSize: 13, color: Colors.terracottaDark, fontFamily: Typography.fontFamily },
  helpText: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily, textAlign: 'center' },
});
