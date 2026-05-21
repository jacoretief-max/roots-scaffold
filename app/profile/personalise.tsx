import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/store/authStore';
import { useUpdateProfile } from '@/api/hooks';
import { uploadMedia } from '@/api/upload';
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
  const [localPhotoUri, setLocalPhotoUri]   = useState<string | null>(null);
  const [uploading, setUploading]           = useState(false);
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

  const pickPhoto = (source: 'library' | 'camera') => async () => {
    const permFn = source === 'library'
      ? ImagePicker.requestMediaLibraryPermissionsAsync
      : ImagePicker.requestCameraPermissionsAsync;
    const { status } = await permFn();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        source === 'library'
          ? 'Please allow photo library access to set a profile photo.'
          : 'Please allow camera access to take a photo.'
      );
      return;
    }
    const result = source === 'library'
      ? await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        })
      : await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.85,
        });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setUploading(true);
    try {
      const s3Url = await uploadMedia(uri, 'image/jpeg', 'avatars', 'avatar');
      updateProfile(
        { avatarUrl: s3Url },
        {
          onSuccess: () => Alert.alert('Saved', 'Your profile photo has been updated.'),
          onError: () => Alert.alert('Error', 'Photo uploaded but profile update failed. Try again.'),
        }
      );
    } catch {
      setLocalPhotoUri(null);
      Alert.alert('Upload failed', 'Could not upload photo. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert('Change photo', undefined, [
      { text: 'Take photo',           onPress: pickPhoto('camera') },
      { text: 'Choose from library',  onPress: pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const displayPhotoUri = localPhotoUri ?? user?.avatarUrl ?? null;

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

        {/* Avatar preview with photo upload */}
        <View style={styles.previewWrap}>
          <TouchableOpacity
            style={[styles.avatarPreview, { backgroundColor: selectedColour }]}
            onPress={handleChangePhoto}
            activeOpacity={0.85}
            disabled={uploading}
          >
            {displayPhotoUri ? (
              <Image source={{ uri: displayPhotoUri }} style={styles.avatarPhoto} />
            ) : (
              <Text style={styles.avatarPreviewText}>
                {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            )}
            {uploading && (
              <View style={styles.uploadingOverlay}>
                <ActivityIndicator color={Colors.white} />
              </View>
            )}
            <View style={styles.cameraOverlay}>
              <Text style={styles.cameraOverlayText}>📷</Text>
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhotoHint}>Tap to change photo</Text>
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
    overflow: 'hidden',
  },
  avatarPhoto: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPreviewText: { fontSize: 40, color: Colors.white, fontWeight: '700' },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  cameraOverlayText: { fontSize: 13 },
  changePhotoHint: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 4,
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
