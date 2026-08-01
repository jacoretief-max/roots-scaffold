import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUpdateProfile } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { BIO_TEMPLATE, BIO_MAX_LENGTH } from '@/constants/bio';
import dayjs from 'dayjs';

export default function AccountScreen() {
  const { user } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const hasChanges =
    displayName.trim() !== (user?.displayName ?? '') ||
    city.trim() !== (user?.city ?? '') ||
    email.trim().toLowerCase() !== (user?.email ?? '').toLowerCase() ||
    bio.trim() !== (user?.bio ?? '');

  const handleSave = () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Please enter your display name.');
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    const emailChanged = trimmedEmail !== (user?.email ?? '').toLowerCase();
    const bioChanged = bio.trim() !== (user?.bio ?? '');
    updateProfile(
      {
        displayName: displayName.trim(),
        city: city.trim() || undefined,
        email: emailChanged ? trimmedEmail : undefined,
        bio: bioChanged ? bio.trim() : undefined,
      },
      {
        onSuccess: () => {
          Alert.alert('Saved', 'Your profile has been updated.');
          router.back();
        },
        onError: (err: any) => {
          Alert.alert('Error', err?.response?.data?.error ?? 'Failed to save. Please try again.');
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account details</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!hasChanges || isPending}
        >
          {isPending
            ? <ActivityIndicator color={Colors.terracotta} />
            : <Text style={[styles.headerSave, !hasChanges && styles.headerSaveDisabled]}>
                Save
              </Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">

        <Text style={styles.sectionLabel}>Display name</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={Colors.textLight}
          maxLength={50}
        />
        <Text style={styles.hint}>This is how you appear to others on Roots.</Text>

        <Text style={styles.sectionLabel}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="e.g. Cape Town"
          placeholderTextColor={Colors.textLight}
          maxLength={50}
        />
        <Text style={styles.hint}>
          Used for your timezone on the Globe screen and to help connections find you.
        </Text>

        <Text style={styles.sectionLabel}>Email address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={Colors.textLight}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Used to sign in and for account notices.</Text>

        <Text style={styles.sectionLabel}>Short bio</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={(t) => setBio(t.slice(0, BIO_MAX_LENGTH))}
          placeholder={BIO_TEMPLATE}
          placeholderTextColor={Colors.textLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.hint}>
          Shown to people when you send or receive a connection request.
        </Text>

        <Text style={styles.sectionLabel}>Date of birth</Text>
        <View style={[styles.input, styles.inputReadOnly]}>
          <Text style={styles.inputReadOnlyText}>
            {user?.dateOfBirth
              ? dayjs(user.dateOfBirth, 'YYYY-MM-DD').format('D MMMM YYYY')
              : 'Not set'}
          </Text>
        </View>
        <Text style={styles.hint}>Date of birth cannot be changed after registration.</Text>

      </ScrollView>
      </KeyboardAvoidingView>
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
  headerSave: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  headerSaveDisabled: { color: Colors.textLight },
  content: { flex: 1, padding: Spacing.lg },
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
  bioInput: { minHeight: 90, lineHeight: 20 },
  inputReadOnly: { backgroundColor: Colors.tan + '44' },
  inputReadOnlyText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
  },
  hint: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 4,
    lineHeight: 18,
  },
});
