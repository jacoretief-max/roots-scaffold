import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useChangePassword } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

export default function PasswordScreen() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const { mutate: changePassword, isPending } = useChangePassword();

  const canSave = current.length > 0 && next.length >= 8 && next === confirm;

  const handleSave = () => {
    if (next !== confirm) {
      Alert.alert('Passwords do not match', 'Please make sure both new passwords are identical.');
      return;
    }
    if (next.length < 8) {
      Alert.alert('Password too short', 'Your new password must be at least 8 characters.');
      return;
    }
    changePassword(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          Alert.alert('Password changed', 'Your password has been updated.');
          router.back();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? 'Failed to change password.';
          Alert.alert('Error', msg);
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change password</Text>
        <TouchableOpacity onPress={handleSave} disabled={!canSave || isPending}>
          {isPending
            ? <ActivityIndicator color={Colors.terracotta} />
            : <Text style={[styles.headerSave, !canSave && styles.headerSaveDisabled]}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionLabel}>Current password</Text>
        <TextInput
          style={styles.input}
          value={current}
          onChangeText={setCurrent}
          secureTextEntry
          placeholder="Enter current password"
          placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.sectionLabel}>New password</Text>
        <TextInput
          style={styles.input}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          placeholder="At least 8 characters"
          placeholderTextColor={Colors.textLight}
        />

        <Text style={styles.sectionLabel}>Confirm new password</Text>
        <TextInput
          style={[styles.input, confirm.length > 0 && next !== confirm && styles.inputError]}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="Repeat new password"
          placeholderTextColor={Colors.textLight}
        />
        {confirm.length > 0 && next !== confirm && (
          <Text style={styles.errorText}>Passwords do not match</Text>
        )}
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
  headerSave: { fontSize: Typography.body, color: Colors.terracotta, fontWeight: '700', fontFamily: Typography.fontFamily },
  headerSaveDisabled: { color: Colors.textLight },
  content: { padding: Spacing.lg, gap: Spacing.xs },
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: 6,
    marginTop: Spacing.lg,
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
  inputError: { borderColor: Colors.scoreLow },
  errorText: { fontSize: 12, color: Colors.scoreLow, fontFamily: Typography.fontFamily, marginTop: 4 },
});
