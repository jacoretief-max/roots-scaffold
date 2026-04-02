import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/store/authStore';
import { useUpdateProfile, useUploadPhoto } from '@/api/hooks';
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
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const { mutate: updateProfile, isPending: isSaving } = useUpdateProfile();
  const { mutate: uploadPhoto, isPending: isUploading } = useUploadPhoto();

  const hasChanges = selectedColour !== user?.avatarColour || avatarUri !== null;

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (avatarUri) {
      uploadPhoto(avatarUri, {
        onSuccess: (publicUrl) => {
          updateProfile(
            { avatarColour: selectedColour, avatarUrl: publicUrl },
            {
              onSuccess: () => { Alert.alert('Saved', 'Your profile has been updated.'); router.back(); },
              onError: () => Alert.alert('Error', 'Failed to save. Please try again.'),
            }
          );
        },
        onError: () => Alert.alert('Upload failed', 'Could not upload photo. Please try again.'),
      });
    } else {
      updateProfile(
        { avatarColour: selectedColour },
        {
          onSuccess: () => { Alert.alert('Saved', 'Your profile has been updated.'); router.back(); },
          onError: () => Alert.alert('Error', 'Failed to save. Please try again.'),
        }
      );
    }
  };

  const isPending = isSaving || isUploading;

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

        {/* Avatar preview */}
        <View style={styles.previewWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarPreview, { backgroundColor: selectedColour }]}>
              <Text style={styles.avatarPreviewText}>
                {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.uploadBtn} onPress={handlePickPhoto}>
            <Text style={styles.uploadBtnText}>Upload photo</Text>
          </TouchableOpacity>
          {avatarUri && (
            <TouchableOpacity onPress={() => setAvatarUri(null)} style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          )}
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
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  uploadBtn: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  uploadBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  removePhoto: { paddingVertical: Spacing.xs },
  removePhotoText: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily },

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
