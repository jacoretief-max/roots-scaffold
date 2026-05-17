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
  returnKeyType, onSubmitEditing, inputRef, autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  returnKeyType?: 'next' | 'done' | 'go';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput>;
  autoCapitalize?: 'none' | 'words' | 'sentences';
}) => (
  <View style={styles.inputWrap}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      ref={inputRef}
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textLight}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize={autoCapitalize ?? 'none'}
      returnKeyType={returnKeyType ?? 'next'}
      onSubmitEditing={onSubmitEditing}
      blurOnSubmit={returnKeyType === 'done'}
    />
  </View>
);

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

// ── Register form with 18+ DOB gate ───────────────────
const RegisterForm = ({ onSwitch }: { onSwitch: () => void }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setUser, setTokens } = useAuthStore();

  const lastNameRef  = useRef<TextInput>(null);
  const emailRef     = useRef<TextInput>(null);
  const passwordRef  = useRef<TextInput>(null);

  const isOver18 = dob
    ? dayjs().diff(dayjs(dob), 'year') >= 18
    : null;

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password || !dob) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!isOver18) {
      Alert.alert('Age requirement', 'Rooted In is designed for adults aged 18 and over.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.post('/auth/register', {
        displayName: `${firstName.trim()} ${lastName.trim()}`,
        email,
        password,
        dateOfBirth: dayjs(dob).format('YYYY-MM-DD'),
      });
      const { user, tokens } = response.data.data;
      await setTokens(tokens);
      setUser(user);
      router.replace("/onboarding/enroll");
    } catch {
      Alert.alert('Registration failed', 'Please try again or use a different email.');
    } finally {
      setLoading(false);
    }
  };

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
        inputRef={passwordRef}
        returnKeyType="done"
        onSubmitEditing={() => setShowPicker(true)}
      />

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
        onPress={handleRegister}
        disabled={loading || !isOver18}
      >
        <Text style={styles.btnText}>{loading ? 'Creating account…' : 'Create account'}</Text>
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
