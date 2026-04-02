import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useUpdateProfile } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const AVATAR_COLORS = [
  '#C45A3A', // terracotta
  '#4A7A52', // sage
  '#4A6A7A', // slate
  '#7A4A5C', // dusty rose
  '#7A5C3A', // warm brown
  '#534AB7', // purple
  '#1D9E75', // teal
  '#BA7517', // amber
];

export default function PersonaliseScreen() {
  const { user } = useAuthStore();
  const [selectedColour, setSelectedColour] = useState(user?.avatarColour ?? Colors.terracotta);
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const hasChanges = selectedColour !== user?.avatarColour;

  const handleSave = () => {
    updateProfile(
      { avatarColour: selectedColour },
      {
        onSuccess: () => { Alert.alert('Saved', 'Your profile has been updated.'); router.back(); },
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
        <Text style={styles.headerTitle}>Personalise</Text>
        <TouchableOpacity onPress={handleSave} disabled={!hasChanges || isPending}>
          {isPending
            ? <ActivityIndicator color={Colors.terracotta} />
            : <Text style={[styles.headerSave, !hasChanges && styles.headerSaveDisabled]}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>

        {/* Avatar preview — photo upload coming Phase 4 */}
        <View style={styles.previewWrap}>
          <View style={[styles.avatarPreview, { backgroundColor: selectedColour }]}>
            <Text style={styles.avatarPreviewText}>
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Photo upload · Phase 4</Text>
          </View>
        </View>

        {/* Colour swatches */}
        <Text style={styles.sectionLabel}>Avatar colour</Text>
        <Text style={styles.hint}>
          Used as your background colour when no photo is set.
        </Text>
        <View style={styles.swatchGrid}>
          {AVATAR_COLORS.map(colour => (
            <TouchableOpacity
              key={colour}
              style={[
                styles.swatch,
                { backgroundColor: colour },
                selectedColour === colour && styles.swatchSelected,
              ]}
              onPress={() => setSelectedColour(colour)}
            >
              {selectedColour === colour && (
                <Text style={styles.swatchTick}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

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
  headerBack: { fontSize: Typography.body, color: Colors.terracotta, fontFamily: Typography.fontFamily },
  headerTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  headerSave: { fontSize: Typography.body, color: Colors.terracotta, fontWeight: '700', fontFamily: Typography.fontFamily },
  headerSaveDisabled: { color: Colors.textLight },
  content: { flex: 1, padding: Spacing.lg },

  previewWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.md,
  },
  avatarPreview: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPreviewText: { fontSize: 40, color: Colors.white, fontWeight: '700' },
  comingSoonBadge: {
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginTop: Spacing.sm,
  },
  comingSoonText: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: 6,
    marginTop: Spacing.lg,
  },
  hint: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
    lineHeight: 18,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  swatch: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: Colors.textDark,
  },
  swatchTick: { fontSize: 20, color: Colors.white, fontWeight: '700' },
});
