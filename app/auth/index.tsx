import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { AuthTokens, User } from '@/types';

// ── Shared input component ─────────────────────────────
const Input = ({
  label, value, onChangeText, placeholder, secureTextEntry, keyboardType,
  returnKeyType, onSubmitEditing, inputRef, autoCapitalize, showToggle,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  showToggle?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  returnKeyType?: 'next' | 'done' | 'go';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput>;
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) => {
  const [hidden, setHidden] = useState(secureTextEntry ?? false);
  return (
    <View style={styles.inputWrap}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          style={[styles.input, styles.inputFlex]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textLight}
          secureTextEntry={hidden}
          keyboardType={keyboardType ?? 'default'}
          autoCapitalize={autoCapitalize ?? 'none'}
          returnKeyType={returnKeyType ?? 'next'}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === 'done'}
        />
        {showToggle && (
          <TouchableOpacity
            onPress={() => setHidden(h => !h)}
            style={styles.eyeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.eyeBtnText}>{hidden ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ── Login form ─────────────────────────────────────────
const LoginForm = ({ onSwitch }: { onSwitch: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setTokens } = useAuthStore();
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, tokens } = response.data.data;
      await setTokens(tokens);
      setUser(user);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Login failed', 'Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Welcome back</Text>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        showToggle
        inputRef={passwordRef}
        returnKeyType="done"
        onSubmitEditing={handleLogin}
      />
      <TouchableOpacity
        style={[styles.btn, loading && styles.btnDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        <Text style={styles.btnText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSwitch} style={styles.switchLink}>
        <Text style={styles.switchText}>New to Rooted In? Create account</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Register form with 18+ DOB gate + phone verification ──
const RegisterForm = ({ onSwitch }: { onSwitch: () => void }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser, setTokens } = useAuthStore();

  // Phone verification step ('form' | 'code')
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const lastNameRef  = useRef<TextInput>(null);
  const emailRef     = useRef<TextInput>(null);
  const passwordRef  = useRef<TextInput>(null);
  const phoneRef     = useRef<TextInput>(null);

  const isOver18 = dob
    ? dayjs().diff(dayjs(dob), 'year') >= 18
    : null;

  const startResendCooldown = () => {
    setResendCooldown(30);
    const timer = setInterval(() => {
      setResendCooldown(s => {
        if (s <= 1) { clearInterval(timer); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    if (!firstName || !lastName || !email || !password || !dob || !phone) {
      Alert.alert('Missing fields', 'Please fill in all fields, including your phone number.');
      return;
    }
    if (!isOver18) {
      Alert.alert('Age requirement', 'Rooted In is designed for adults aged 18 and over.');
      return;
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      Alert.alert('Phone number', 'Please enter your phone number in international format, e.g. +14155552671.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/phone/send-code', { phoneNumber: phone });
      setStep('code');
      startResendCooldown();
    } catch (err: any) {
      Alert.alert('Could not send code', err?.response?.data?.error ?? 'Please check your phone number and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setCodeLoading(true);
    try {
      await api.post('/auth/phone/send-code', { phoneNumber: phone });
      startResendCooldown();
    } catch {
      Alert.alert('Could not resend code', 'Please try again shortly.');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    if (!code || code.length < 4) {
      Alert.alert('Enter code', 'Please enter the verification code we texted you.');
      return;
    }
    setCodeLoading(true);
    try {
      const response = await api.post('/auth/register', {
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        email,
        password,
        dateOfBirth: dayjs(dob).format('YYYY-MM-DD'),
        phoneNumber: phone,
        code,
      });
      const { user, tokens } = response.data.data;
      await setTokens(tokens);
      setUser(user);
      router.replace("/onboarding/enroll");
    } catch (err: any) {
      Alert.alert('Registration failed', err?.response?.data?.error ?? 'Please check the code and try again.');
    } finally {
      setCodeLoading(false);
    }
  };

  if (step === 'code') {
    return (
      <View style={styles.form}>
        <Text style={styles.formTitle}>Verify your phone</Text>
        <Text style={styles.policy}>
          We sent a code by text to {phone}. Enter it below to finish creating your account.
        </Text>
        <Input
          label="Verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="default"
          returnKeyType="done"
          onSubmitEditing={handleVerifyAndRegister}
        />
        <TouchableOpacity
          style={[styles.btn, codeLoading && styles.btnDisabled]}
          onPress={handleVerifyAndRegister}
          disabled={codeLoading}
        >
          <Text style={styles.btnText}>{codeLoading ? 'Verifying…' : 'Verify & create account'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleResendCode} style={styles.switchLink} disabled={resendCooldown > 0}>
          <Text style={styles.switchText}>
            {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep('form')} style={styles.switchLink}>
          <Text style={styles.switchText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Create your account</Text>

      {/* Name row */}
      <View style={styles.nameRow}>
        <View style={{ flex: 1 }}>
          <Input
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => lastNameRef.current?.focus()}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            inputRef={lastNameRef}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
        </View>
      </View>

      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        inputRef={emailRef}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        showToggle
        inputRef={passwordRef}
        returnKeyType="next"
        onSubmitEditing={() => phoneRef.current?.focus()}
      />
      <Input
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+14155552671"
        keyboardType="phone-pad"
        inputRef={phoneRef}
        returnKeyType="done"
        onSubmitEditing={() => setShowPicker(true)}
      />
      <Text style={styles.dobFeedback}>
        Used to verify you're a real person — include your country code.
      </Text>

      {/* Date of birth picker — 18+ gate */}
      <View style={styles.inputWrap}>
        <Text style={styles.inputLabel}>Date of birth</Text>
        <TouchableOpacity
          style={[styles.input, styles.dobInput]}
          onPress={() => setShowPicker(true)}
        >
          <Text style={{ color: dob ? Colors.textDark : Colors.textLight }}>
            {dob ? dayjs(dob).format('D MMMM YYYY') : 'Select date of birth'}
          </Text>
        </TouchableOpacity>

        {dob && (
          <Text style={[styles.dobFeedback, { color: isOver18 ? Colors.sage : Colors.scoreLow }]}>
            {isOver18
              ? 'Great — you meet the age requirement.'
              : 'Rooted In is for adults aged 18 and over.'}
          </Text>
        )}

        {showPicker && (
          <DateTimePicker
            value={dob ?? new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, date) => {
              setShowPicker(Platform.OS === 'ios');
              if (date) setDob(date);
            }}
          />
        )}
      </View>

      <Text style={styles.policy}>
        By creating an account you agree to our Privacy Policy.{'\n'}
        No ads. No public posts. Your data stays yours.
      </Text>

      <TouchableOpacity
        style={[styles.btn, (loading || !isOver18) && styles.btnDisabled]}
        onPress={handleSendCode}
        disabled={loading || !isOver18}
      >
        <Text style={styles.btnText}>{loading ? 'Sending code…' : 'Continue'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onSwitch} style={styles.switchLink}>
        <Text style={styles.switchText}>Already have an account? Sign in</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Auth screen ────────────────────────────────────────
export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Wordmark */}
          <View style={styles.header}>
            <Text style={styles.wordmark}>Rooted In</Text>
            <Text style={styles.tagline}>The people you love, kept close.</Text>
          </View>

          {mode === 'login'
            ? <LoginForm onSwitch={() => setMode('register')} />
            : <RegisterForm onSwitch={() => setMode('login')} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.lg },

  header: { alignItems: 'center', paddingTop: 48, paddingBottom: 40 },
  wordmark: {
    fontSize: 42,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 15,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    marginTop: 6,
    fontStyle: 'italic',
  },

  form: { gap: Spacing.md },
  formTitle: {
    fontSize: Typography.heading.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },

  inputWrap: { gap: 6 },
  inputLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  inputFlex: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  eyeBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  eyeBtnText: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },
  dobInput: { justifyContent: 'center' },
  dobFeedback: { fontSize: 12, marginTop: 2 },

  policy: {
    fontSize: 12,
    color: Colors.textLight,
    lineHeight: 18,
    textAlign: 'center',
  },

  btn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  btnDisabled: { backgroundColor: Colors.tan },
  btnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },

  nameRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  switchLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  switchText: {
    fontSize: 13,
    color: Colors.terracottaDark,
    fontFamily: Typography.fontFamily,
  },
});
