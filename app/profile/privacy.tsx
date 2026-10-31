import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Share, Linking,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import api from '@/api/client';
import { LEGAL_URL, LEGAL_LINK_LABEL } from '@/constants/smsConsent';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const Section = ({ title, children }: { title: string; children: string }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionBody}>{children}</Text>
  </View>
);

export default function PrivacyScreen() {
  const { logout } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [photosOnOthers, setPhotosOnOthers] = useState(0);

  // Builds the export on the server, downloads it, and opens the share sheet.
  // Resolves true if the user got the file (or the download link on Android).
  const runExport = async (): Promise<boolean> => {
    setExporting(true);
    try {
      const { data } = await api.post('/users/me/export', {}, { timeout: 10 * 60 * 1000 });
      const { url, fileName, photosSkipped } = data.data;
      if (Platform.OS === 'ios') {
        const target = `${FileSystem.cacheDirectory}${fileName}`;
        const { uri } = await FileSystem.downloadAsync(url, target);
        await Share.share({ url: uri });
      } else {
        await Linking.openURL(url);
      }
      if (photosSkipped > 0) {
        Alert.alert('Export ready', `${photosSkipped} photo(s) could not be included. Everything else is in the file.`);
      }
      return true;
    } catch (err: any) {
      Alert.alert('Export failed', err?.response?.data?.error ?? 'We could not prepare your export. Please try again.');
      return false;
    } finally {
      setExporting(false);
    }
  };

  const openDeleteConfirm = () => {
    setPassword('');
    setPhotosOnOthers(0);
    setDeleteVisible(true);
    // How many photos they added to other people's memories (for the keep question)
    api.get('/users/me/photos-on-others')
      .then(({ data }) => setPhotosOnOthers(data.data.count ?? 0))
      .catch(() => setPhotosOnOthers(0));
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Before you go',
      'Would you like to export your memories, photos and circle first? Once your account is deleted, they cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete without exporting', style: 'destructive', onPress: openDeleteConfirm },
        {
          text: 'Export first',
          onPress: async () => {
            const ok = await runExport();
            if (ok) openDeleteConfirm();
          },
        },
      ]
    );
  };

  const confirmDelete = () => {
    if (!password) {
      Alert.alert('Password required', 'Please enter your password to confirm.');
      return;
    }
    if (photosOnOthers > 0) {
      const n = photosOnOthers;
      Alert.alert(
        'Photos on other people\'s memories',
        `You added ${n} photo${n === 1 ? '' : 's'} to memories created by others. Keep ${n === 1 ? 'it' : 'them'} there for them, or delete ${n === 1 ? 'it' : 'them'}? Kept photos will show as added by a former member.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete them', style: 'destructive', onPress: () => doDelete(false) },
          { text: 'Keep for them', onPress: () => doDelete(true) },
        ]
      );
      return;
    }
    doDelete(false);
  };

  const doDelete = async (keepPhotosOnOthers: boolean) => {
    setDeleting(true);
    try {
      await api.delete('/users/me', { data: { password, keepPhotosOnOthers }, timeout: 60 * 1000 });
      setDeleteVisible(false);
      await logout();
      router.replace('/auth');
      Alert.alert('Account deleted', 'Your account and all your data have been permanently deleted.');
    } catch (err: any) {
      Alert.alert('Could not delete account', err?.response?.data?.error ?? 'Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Cookies</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.intro}>
          <Text style={styles.introText}>
            Roots is built on a simple promise: your personal data belongs to you.
            Here's exactly what we store, why, and who can see it.
          </Text>
        </View>

        <Section title="What we store">
          Your display name, email address, mobile phone number, date of birth, city, and avatar colour. The memories and perspectives you write. Your circle connections and the relation types you assign. A record of your consent to receive verification codes by text.
        </Section>

        <Section title="Who can see your memories">
          Only the people you explicitly tag in a memory, plus anyone within the Dunbar layer you set for that memory. No one outside your circle can see anything you post. There are no public posts on Roots.
        </Section>

        <Section title="Cookies">
          Roots uses essential cookies only — the minimum required to keep you signed in. We do not use advertising cookies, tracking cookies, or any third-party analytics cookies. Your usage data is never sold or shared with advertisers.
        </Section>

        <Section title="Photos and media">
          Photos you upload are stored securely in encrypted cloud storage. They are only accessible to people within the visibility layer you set for that memory. Photos are never used for advertising or shared with third parties.
        </Section>

        <Section title="Third-party integrations">
          When you connect Roots to your contacts or calendar, we read only the minimum data needed. Verification codes are sent by our SMS provider, Twilio. We never read your messages.
        </Section>

        <Section title="Your rights">
          You can export a copy of your memories, photos and circle at any time below. You can delete your account at any time — your data is permanently removed straight away.
        </Section>

        <TouchableOpacity onPress={() => Linking.openURL(LEGAL_URL)}>
          <Text style={styles.legalLink}>Read the full {LEGAL_LINK_LABEL} →</Text>
        </TouchableOpacity>

        {/* Export */}
        <View style={styles.exportZone}>
          <Text style={styles.exportTitle}>Export your data</Text>
          <Text style={styles.dangerDesc}>
            Download a file with your memories, photos and circle. It includes a page you can open in any browser.
          </Text>
          <TouchableOpacity style={styles.exportBtn} onPress={runExport} disabled={exporting}>
            {exporting
              ? <ActivityIndicator color={Colors.terracotta} />
              : <Text style={styles.exportBtnText}>Export my data</Text>}
          </TouchableOpacity>
          {exporting && <Text style={styles.exportHint}>Preparing your file — this can take a minute if you have many photos.</Text>}
        </View>

        {/* Account deletion */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerDesc}>
            Permanently delete your account, memories, photos and connections. This cannot be undone.
          </Text>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleDeleteAccount} disabled={exporting || deleting}>
            <Text style={styles.dangerBtnText}>Delete account</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Last updated: October 2026 · info@rooikatlabs.com
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Password confirmation */}
      <Modal visible={deleteVisible} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.dangerTitle}>Delete your account?</Text>
            <Text style={styles.dangerDesc}>
              Enter your password to permanently delete your account and everything in it. This cannot be undone.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
              autoFocus
              autoCapitalize="none"
              editable={!deleting}
            />
            <TouchableOpacity style={[styles.dangerBtn, styles.modalDeleteBtn]} onPress={confirmDelete} disabled={deleting}>
              {deleting
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.modalDeleteText}>Delete permanently</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDeleteVisible(false)} disabled={deleting} style={styles.modalCancel}>
              <Text style={styles.headerBack}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  content: { flex: 1, padding: Spacing.lg },
  intro: {
    backgroundColor: Colors.terracotta + '10',
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.terracotta,
  },
  introText: {
    fontSize: Typography.body,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  sectionBody: {
    fontSize: 14,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 22,
  },
  dangerZone: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.scoreLow + '44',
  },
  dangerTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.scoreLow,
    marginBottom: Spacing.xs,
  },
  dangerDesc: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  dangerBtn: {
    borderWidth: 0.5,
    borderColor: Colors.scoreLow,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  dangerBtnText: {
    fontSize: Typography.body,
    color: Colors.scoreLow,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
  legalLink: {
    fontSize: 14, color: Colors.terracotta, fontFamily: Typography.fontFamily,
    fontWeight: '600', marginBottom: Spacing.lg,
  },
  exportZone: {
    borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.md,
    padding: Spacing.lg, marginBottom: Spacing.lg, gap: Spacing.sm,
  },
  exportTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  exportBtn: {
    borderWidth: 1, borderColor: Colors.terracotta, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2, alignItems: 'center', marginTop: Spacing.xs,
  },
  exportBtnText: { fontSize: Typography.body, color: Colors.terracotta, fontFamily: Typography.fontFamily, fontWeight: '700' },
  exportHint: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg },
  modalCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.lg, gap: Spacing.sm },
  modalInput: {
    borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.md, backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, fontSize: Typography.body,
    color: Colors.textDark, fontFamily: Typography.fontFamily, marginTop: Spacing.xs,
  },
  modalDeleteBtn: { backgroundColor: Colors.scoreLow, borderColor: Colors.scoreLow, alignItems: 'center', marginTop: Spacing.xs },
  modalDeleteText: { fontSize: Typography.body, color: Colors.white, fontFamily: Typography.fontFamily, fontWeight: '700' },
  modalCancel: { alignItems: 'center', paddingVertical: Spacing.sm },
  footer: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
