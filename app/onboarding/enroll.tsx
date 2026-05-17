/**
 * Enrollment wizard — shown once after a new user registers.
 * Steps: Welcome → Contacts sync → Add first person → Notifications → Done
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/authStore';
import { useAddConnection, useSyncContacts } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type Step = 'welcome' | 'contacts' | 'add_person' | 'notifications' | 'done';

// Minimal contact shape from sync results
interface SyncedContact {
  name: string;
  phoneNumber?: string;
  score?: number;
}

const LAYERS = [
  { key: 'intimate',    label: 'Inner circle',   desc: '5 people · closest bonds' },
  { key: 'close',       label: 'Close friends',  desc: '15 people · regular contact' },
  { key: 'active',      label: 'Good friends',   desc: '50 people · a few times a year' },
  { key: 'meaningful',  label: 'Acquaintances',  desc: '150 people · your wider network' },
];

function AvatarInitial({ name, colour }: { name: string; colour?: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: colour ?? Colors.terracotta }]}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function EnrollScreen() {
  const { user } = useAuthStore();
  const [step, setStep]                   = useState<Step>('welcome');
  const [contacts, setContacts]           = useState<SyncedContact[]>([]);
  const [syncing, setSyncing]             = useState(false);
  const [selectedContact, setSelected]   = useState<SyncedContact | null>(null);
  const [selectedLayer, setLayer]         = useState('close');
  const [adding, setAdding]               = useState(false);

  const { mutate: syncContacts }   = useSyncContacts();
  const { mutate: addConnection }  = useAddConnection();

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  // ── Step: contacts sync ───────────────────────────────────────────────────
  const handleSyncContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow contact access so Rooted In can suggest people for your circle.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSyncing(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      const mapped = data
        .filter(c => c.name && c.name.trim().length >= 3)
        .map(c => ({
          name: c.name!,
          phoneNumber: c.phoneNumbers?.[0]?.number,
        }))
        .slice(0, 200);

      syncContacts(mapped, {
        onSuccess: (result) => {
          const all: SyncedContact[] = [
            ...(result.matched ?? []).map((m: any) => ({
              name: m.offlineName ?? m.connectedUser?.displayName ?? m.name,
              phoneNumber: m.offlinePhone,
            })),
            ...(result.suggestions ?? []).map((s: any) => ({
              name: s.name,
              phoneNumber: s.phoneNumber,
              score: s.score,
            })),
          ].slice(0, 10);
          setContacts(all);
          setSyncing(false);
          setStep('add_person');
        },
        onError: () => {
          setSyncing(false);
          Alert.alert('Sync failed', 'Could not sync contacts. You can add people manually.');
          setStep('add_person');
        },
      });
    } catch {
      setSyncing(false);
      setStep('add_person');
    }
  };

  // ── Step: add first person ────────────────────────────────────────────────
  const handleAddPerson = () => {
    if (!selectedContact) { setStep('notifications'); return; }
    setAdding(true);
    addConnection(
      {
        offlineName: selectedContact.name,
        offlinePhone: selectedContact.phoneNumber,
        layer: selectedLayer,
        relation: 'friend',
        contactFrequency: 30,
      },
      {
        onSuccess: () => { setAdding(false); setStep('notifications'); },
        onError: () => {
          setAdding(false);
          Alert.alert('Could not add', 'You can add them from the Circle screen later.');
          setStep('notifications');
        },
      }
    );
  };

  // ── Step: notifications ───────────────────────────────────────────────────
  const handleRequestNotifications = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {}
    setStep('done');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── Welcome ── */}
      {step === 'welcome' && (
        <View style={styles.centeredContent}>
          <Text style={styles.heroSymbol}>❧</Text>
          <Text style={styles.heroTitle}>Welcome, {firstName}</Text>
          <Text style={styles.heroBody}>
            Let's get your circle started. It only takes a minute, and you'll
            end your first session with real people in your circle.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('contacts')}>
            <Text style={styles.primaryBtnText}>Get started</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.skipLink}>
            <Text style={styles.skipLinkText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Contacts sync ── */}
      {step === 'contacts' && (
        <View style={styles.centeredContent}>
          <Text style={styles.stepLabel}>Step 1 of 3</Text>
          <Text style={styles.heroTitle}>Find your people</Text>
          <Text style={styles.heroBody}>
            Rooted In can read your contacts to suggest people for your circle. 
            Nothing is uploaded without your consent, and contact data is only used
            to make suggestions — never shared.
          </Text>
          {syncing ? (
            <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.xl }} />
          ) : (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSyncContacts}>
                <Text style={styles.primaryBtnText}>Sync my contacts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('add_person')} style={styles.skipLink}>
                <Text style={styles.skipLinkText}>Skip this step</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── Add first person ── */}
      {step === 'add_person' && (
        <View style={styles.fullContent}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.stepTitle}>Add your first person</Text>
          <Text style={styles.stepBody}>
            {contacts.length > 0
              ? 'Pick someone from your contacts to add to your circle.'
              : 'Who is one person who matters to you? You can add more from the Circle tab later.'}
          </Text>

          {contacts.length > 0 && (
            <ScrollView style={styles.contactList} showsVerticalScrollIndicator={false}>
              {contacts.map((c) => (
                <TouchableOpacity
                  key={c.name + (c.phoneNumber ?? '')}
                  style={[styles.contactRow, selectedContact?.name === c.name && styles.contactRowSelected]}
                  onPress={() => setSelected(c)}
                  activeOpacity={0.7}
                >
                  <AvatarInitial name={c.name} />
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{c.name}</Text>
                    {c.phoneNumber && (
                      <Text style={styles.contactPhone}>{c.phoneNumber}</Text>
                    )}
                  </View>
                  {selectedContact?.name === c.name && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {selectedContact && (
            <>
              <Text style={styles.layerLabel}>Which circle?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.layerScroll}>
                {LAYERS.map(l => (
                  <TouchableOpacity
                    key={l.key}
                    style={[styles.layerChip, selectedLayer === l.key && styles.layerChipSelected]}
                    onPress={() => setLayer(l.key)}
                  >
                    <Text style={[styles.layerChipLabel, selectedLayer === l.key && styles.layerChipLabelSelected]}>
                      {l.label}
                    </Text>
                    <Text style={[styles.layerChipDesc, selectedLayer === l.key && styles.layerChipDescSelected]}>
                      {l.desc}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.bottomBtns}>
            <TouchableOpacity
              style={[styles.primaryBtn, adding && styles.primaryBtnDisabled]}
              onPress={handleAddPerson}
              disabled={adding}
            >
              {adding
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.primaryBtnText}>
                    {selectedContact ? `Add ${selectedContact.name.split(' ')[0]}` : 'Continue without adding'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Notifications ── */}
      {step === 'notifications' && (
        <View style={styles.centeredContent}>
          <Text style={styles.stepLabel}>Step 3 of 3</Text>
          <Text style={styles.heroTitle}>Stay in the loop</Text>
          <Text style={styles.heroBody}>
            Rooted In sends gentle nudges when it's been a while since you've
            been in touch with someone. Allow notifications so you never lose
            track of the people who matter.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestNotifications}>
            <Text style={styles.primaryBtnText}>Allow notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStep('done')} style={styles.skipLink}>
            <Text style={styles.skipLinkText}>Not now</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <View style={styles.centeredContent}>
          <Text style={styles.heroSymbol}>◎</Text>
          <Text style={styles.heroTitle}>You're all set</Text>
          <Text style={styles.heroBody}>
            {selectedContact
              ? `${selectedContact.name.split(' ')[0]} is in your circle. Keep adding people — the more complete your circle, the better Rooted In works for you.`
              : 'Your circle is waiting. Head to the Circle tab to start adding the people who matter most.'}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.primaryBtnText}>Go to my circle</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  centeredContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  fullContent: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },

  heroSymbol: {
    fontSize: 52,
    color: Colors.terracotta,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
    lineHeight: 32,
  },
  heroBody: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
  },

  stepLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  stepBody: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },

  contactList: { flex: 1, marginBottom: Spacing.md },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: Colors.card,
  },
  contactRowSelected: {
    borderColor: Colors.terracotta,
    backgroundColor: Colors.terracotta + '12',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  avatarText: { fontSize: 15, color: Colors.white, fontWeight: '700' },
  contactInfo: { flex: 1 },
  contactName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
  },
  contactPhone: {
    fontSize: 12,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    marginTop: 1,
  },
  checkmark: { fontSize: 16, color: Colors.terracotta, fontWeight: '700' },

  layerLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  layerScroll: { flexGrow: 0, marginBottom: Spacing.lg },
  layerChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.tan,
    backgroundColor: Colors.card,
    marginRight: Spacing.sm,
    minWidth: 110,
  },
  layerChipSelected: {
    borderColor: Colors.terracotta,
    backgroundColor: Colors.terracotta + '15',
  },
  layerChipLabel: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  layerChipLabelSelected: { color: Colors.terracotta },
  layerChipDesc: {
    fontSize: 11,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 15,
  },
  layerChipDescSelected: { color: Colors.terracotta + 'AA' },

  bottomBtns: { paddingBottom: Spacing.xl, gap: Spacing.sm },

  primaryBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryBtnDisabled: { backgroundColor: Colors.sage },
  primaryBtnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },
  skipLink: { paddingVertical: Spacing.xs, alignItems: 'center' },
  skipLinkText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
  },
});
