import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account, all your memories, and all your connections. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request deletion',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Request submitted',
              'Your account deletion request has been received. Your account will be deleted within 30 days. You have been signed out.',
            );
            logout();
            router.replace('/auth');
          },
        },
      ]
    );
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
          Your display name, email address, date of birth, city, and avatar colour. The memories and perspectives you write. Your circle connections and the relation types you assign. Nothing else.
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
          When you connect Roots to your contacts, calendar, or WhatsApp (in Phase 3), we read only the minimum data needed — interaction frequency and timestamps. We never read message content. Raw source data is processed on your device and immediately discarded.
        </Section>

        <Section title="Your rights">
          You can request a copy of all your data at any time by contacting privacy@yourroots.app. You can delete your account at any time — all your data will be permanently removed within 30 days.
        </Section>

        <Section title="Compliance">
          Roots complies with GDPR (EU), COPPA (USA), and POPIA (South Africa). Our legal basis for processing your data is the contract between you and Roots when you create an account.
        </Section>

        {/* Account deletion */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Delete account</Text>
          <Text style={styles.dangerDesc}>
            Permanently delete your account and all associated data. This cannot be undone.
          </Text>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleDeleteAccount}>
            <Text style={styles.dangerBtnText}>Request account deletion</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Last updated: March 2026 · privacy@yourroots.app
        </Text>

        <View style={{ height: 40 }} />
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
  footer: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
