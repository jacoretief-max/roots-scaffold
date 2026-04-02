import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUpdateProfile } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

export default function AccountScreen() {
  const { user } = useAuthStore();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const hasChanges =
    displayName.trim() !== (user?.displayName ?? '') ||
    city.trim() !== (user?.city ?? '');

  const handleSave = () => {
    if (!displayName.trim()) {
      Alert.alert('Name required', 'Please enter your display name.');
      return;
    }
    updateProfile(
      { displayName: displayName.trim(), city: city.trim() || undefined },
      {
        onSuccess: () => {
          Alert.alert('Saved', 'Your profile has been updated.');
          router.back();
        },
        onError: () => Alert.alert('Error', 'Failed to save. Please try again.'),
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
        <View style={[styles.input, styles.inputReadOnly]}>
          <Text style={styles.inputReadOnlyText}>{user?.email}</Text>
        </View>
        <Text style={styles.hint}>Email cannot be changed at this time.</Text>

        <Text style={styles.sectionLabel}>Date of birth</Text>
        <View style={[styles.input, styles.inputReadOnly]}>
          <Text style={styles.inputReadOnlyText}>
            {user?.dateOfBirth
              ? new Date(user.dateOfBirth).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })
              : 'Not set'}
          </Text>
        </View>
        <Text style={styles.hint}>Date of birth cannot be changed after registration.</Text>

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
