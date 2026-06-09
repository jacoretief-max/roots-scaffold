/**
 * Enrollment wizard — shown once after a new user registers.
 * Flow: Welcome → Add people (name + birthday) → Sync contacts (phone + email)
 *       → Invite → Done
 */
import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, TextInput, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import * as Contacts from 'expo-contacts';
import { useAuthStore } from '@/store/authStore';
import { useSyncContacts } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import api from '@/api/client';

type Step = 'welcome' | 'add_people' | 'sync' | 'invite' | 'done';

interface AddedPerson {
  name: string;
  dob?: string; // YYYY-MM-DD
}

function InitialBadge({ name }: { name: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function EnrollScreen() {
  const { user } = useAuthStore();
  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  const [step, setStep] = useState<Step>('welcome');

  // ── Add people ────────────────────────────────────────────────────────────
  const [added, setAdded]           = useState<AddedPerson[]>([]);
  const [nameInput, setNameInput]   = useState('');
  const [dobDate, setDobDate]       = useState<Date | null>(null);
  const [showDob, setShowDob]       = useState(false);
  const [savingPeople, setSaving]   = useState(false);
  const nameRef = useRef<TextInput>(null);

  // ── Sync ──────────────────────────────────────────────────────────────────
  const [syncing, setSyncing]     = useState(false);
  const [syncDone, setSyncDone]   = useState(false);

  // ── Invite ────────────────────────────────────────────────────────────────
  const [invitedNames, setInvited] = useState<Set<string>>(new Set());

  const { mutate: syncContacts } = useSyncContacts();

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddPerson = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setAdded(prev => [
      ...prev,
      { name: trimmed, dob: dobDate ? dayjs(dobDate).format('YYYY-MM-DD') : undefined },
    ]);
    setNameInput('');
    setDobDate(null);
    setShowDob(false);
    // Keep keyboard open for rapid entry
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const handleRemovePerson = (index: number) => {
    setAdded(prev => prev.filter((_, i) => i !== index));
  };

  const handleContinueAddPeople = async () => {
    if (added.length === 0) {
      setStep('sync');
      return;
    }
    setSaving(true);
    try {
      for (const person of added) {
        await api.post('/connections', {
          offlineName: person.name,
          offlineDob: person.dob ?? null,
          layer: 'close',
          relation: 'friend',
          contactFrequency: 30,
        });
      }
    } catch {
      // Partial failures are OK — they can fill gaps from the Circle tab
    } finally {
      setSaving(false);
    }
    setStep('sync');
  };

  const handleSyncContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow contact access so Rooted In can match phone numbers and email addresses.',
        [{ text: 'OK' }]
      );
      return;
    }
    setSyncing(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
        ],
      });
      const mapped = data
        .filter(c => c.name && c.name.trim().length >= 3)
        .map(c => ({
          name: c.name!,
          phoneNumber: c.phoneNumbers?.[0]?.number,
          email: c.emails?.[0]?.email,
        }))
        .slice(0, 300);

      syncContacts(mapped, {
        onSuccess: () => { setSyncing(false); setSyncDone(true); },
        onError:  () => { setSyncing(false); setSyncDone(true); },
      });
    } catch {
      setSyncing(false);
      setSyncDone(true);
    }
  };

  const handleInvite = async (name: string) => {
    const senderFirst = user?.displayName?.split(' ')[0] ?? 'Someone';
    try {
      await Share.share({
        message: `${senderFirst} wants to share a memory with you on Rooted In.`,
      });
      setInvited(prev => new Set(prev).add(name));
    } catch {
      // User dismissed share sheet — no-op
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── Welcome ──────────────────────────────────────────────────────── */}
      {step === 'welcome' && (
        <View style={styles.centered}>
          <Text style={styles.symbol}>❧</Text>
          <Text style={styles.title}>Welcome, {firstName}</Text>
          <Text style={styles.body}>
            The best place to start is to think of the{' '}
            <Text style={styles.bold}>20 most important friends and family</Text>{' '}
            in your life. Who have you been in touch with in the last few months —
            or wish you had been?
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('add_people')}>
            <Text style={styles.primaryBtnText}>I'm ready</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.skipLink}>
            <Text style={styles.skipText}>Set up later</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Add people ───────────────────────────────────────────────────── */}
      {step === 'add_people' && (
        <View style={styles.full}>
          <ScrollView
            style={styles.fullScroll}
            contentContainerStyle={styles.fullScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.stepLabel}>Step 1 of 3</Text>
            <Text style={styles.title}>Add names and birthdays</Text>
            <Text style={styles.body}>
              Start with whoever comes to mind. Add as many as you like —
              you can always add more from your circle.
            </Text>

            {/* Entry form */}
            <View style={styles.addForm}>
              <TextInput
                ref={nameRef}
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Their name"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleAddPerson}
                autoFocus
              />
              <TouchableOpacity
                style={[styles.dobToggle, dobDate && styles.dobToggleSet]}
                onPress={() => setShowDob(v => !v)}
              >
                <Text style={[styles.dobToggleText, dobDate && styles.dobToggleTextSet]}>
                  {dobDate ? dayjs(dobDate).format('D MMM') : '+ Birthday'}
                </Text>
              </TouchableOpacity>
            </View>

            {showDob && (
              <DateTimePicker
                value={dobDate ?? new Date(1985, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(_, date) => {
                  if (Platform.OS !== 'ios') setShowDob(false);
                  if (date) setDobDate(date);
                }}
              />
            )}

            <TouchableOpacity
              style={[styles.addBtn, !nameInput.trim() && styles.addBtnDisabled]}
              onPress={handleAddPerson}
              disabled={!nameInput.trim()}
            >
              <Text style={styles.addBtnText}>Add person</Text>
            </TouchableOpacity>

            {/* Growing list */}
            {added.length > 0 && (
              <View style={styles.addedSection}>
                <Text style={styles.addedCount}>
                  {added.length} {added.length === 1 ? 'person' : 'people'} added
                </Text>
                {added.map((p, i) => (
                  <View key={i} style={styles.addedRow}>
                    <InitialBadge name={p.name} />
                    <View style={styles.addedInfo}>
                      <Text style={styles.addedName}>{p.name}</Text>
                      {p.dob && (
                        <Text style={styles.addedDob}>
                          {dayjs(p.dob).format('D MMMM YYYY')}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemovePerson(i)}
                      style={styles.removeBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.primaryBtn, savingPeople && styles.primaryBtnDisabled]}
              onPress={handleContinueAddPeople}
              disabled={savingPeople}
            >
              {savingPeople
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.primaryBtnText}>
                    {added.length > 0
                      ? `Continue with ${added.length} ${added.length === 1 ? 'person' : 'people'}`
                      : 'Continue'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Sync contacts ────────────────────────────────────────────────── */}
      {step === 'sync' && (
        <View style={styles.centered}>
          <Text style={styles.stepLabel}>Step 2 of 3</Text>
          <Text style={styles.title}>Update their contact details</Text>
          <Text style={styles.body}>
            Sync your phone contacts so Rooted In can match the people you've
            added with their current{' '}
            <Text style={styles.bold}>phone number and email address</Text>.
            {'\n\n'}
            Contact data is only used for matching — nothing is stored or shared
            without your control.
          </Text>

          {syncing ? (
            <View style={styles.syncingRow}>
              <ActivityIndicator color={Colors.terracotta} />
              <Text style={styles.syncingText}>Matching contacts…</Text>
            </View>
          ) : syncDone ? (
            <>
              <View style={styles.syncBadge}>
                <Text style={styles.syncBadgeText}>✓  Contacts synced</Text>
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('invite')}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleSyncContacts}>
                <Text style={styles.primaryBtnText}>Sync my contacts</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('invite')} style={styles.skipLink}>
                <Text style={styles.skipText}>I'll do this later</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── Invite ───────────────────────────────────────────────────────── */}
      {step === 'invite' && (
        <View style={styles.full}>
          <View style={styles.inviteHeader}>
            <Text style={styles.stepLabel}>Step 3 of 3</Text>
            <Text style={styles.title}>Invite them to join you</Text>
            <Text style={styles.body}>
              Let the people in your circle know you're thinking of them.
            </Text>
          </View>

          {added.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                No people added yet — you can invite from the Circle tab once
                you've added someone.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.fullScroll} showsVerticalScrollIndicator={false}>
              {added.map((p, i) => {
                const invited = invitedNames.has(p.name);
                return (
                  <View key={i} style={styles.inviteRow}>
                    <InitialBadge name={p.name} />
                    <Text style={styles.addedName}>{p.name}</Text>
                    <TouchableOpacity
                      style={[styles.inviteBtn, invited && styles.inviteBtnDone]}
                      onPress={() => handleInvite(p.name)}
                    >
                      <Text style={[styles.inviteBtnText, invited && styles.inviteBtnTextDone]}>
                        {invited ? 'Invited ✓' : 'Invite'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('done')}>
              <Text style={styles.primaryBtnText}>Done for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Done ─────────────────────────────────────────────────────────── */}
      {step === 'done' && (
        <View style={styles.centered}>
          <Text style={styles.symbol}>◎</Text>
          <Text style={styles.title}>You're all set</Text>
          <Text style={styles.body}>
            {added.length > 0
              ? `You've started your circle with ${added.length} ${added.length === 1 ? 'person' : 'people'}. Keep going — the more complete your circle, the better Rooted In works.`
              : 'Your circle is waiting. Head to the Circle tab to start adding the people who matter most.'}
          </Text>

          <View style={styles.memoryCard}>
            <Text style={styles.memoryCardTitle}>Add your first memory</Text>
            <Text style={styles.memoryCardBody}>
              Tap <Text style={styles.bold}>+</Text> on the home screen to capture a
              moment. Add a description, date, place, the people who were there, and your take.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/(tabs)')}
          >
            <Text style={styles.primaryBtnText}>Go to my circle</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Centred layout (welcome, sync, done)
  centered: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },

  // Full-height layout (add people, invite)
  full:            { flex: 1, paddingTop: Spacing.xl },
  fullScroll:      { flex: 1, paddingHorizontal: Spacing.xl },
  fullScrollContent: { paddingBottom: Spacing.xl },

  symbol: { fontSize: 52, color: Colors.terracotta },

  stepLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 26,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    textAlign: 'center',
    lineHeight: 32,
  },
  body: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 24,
  },
  bold: { fontWeight: '700', color: Colors.textDark },

  // Add-people form
  addForm: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  dobToggle: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    backgroundColor: Colors.card,
  },
  dobToggleSet: { borderColor: Colors.terracotta, backgroundColor: Colors.terracotta + '10' },
  dobToggleText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    fontWeight: '600',
  },
  dobToggleTextSet: { color: Colors.terracotta },

  addBtn: {
    backgroundColor: Colors.sage,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addBtnDisabled: { backgroundColor: Colors.tan },
  addBtnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },

  // Added list
  addedSection: { marginTop: Spacing.sm },
  addedCount: {
    fontSize: 11,
    fontFamily: Typography.fontFamily,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    gap: Spacing.sm,
  },
  addedInfo: { flex: 1 },
  addedName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
  },
  addedDob: {
    fontSize: 12,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    marginTop: 2,
  },
  removeBtn: { padding: Spacing.xs },
  removeBtnText: { fontSize: 14, color: Colors.textLight },

  // Badge
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 15, color: Colors.white, fontWeight: '700' },

  // Sync
  syncingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  syncingText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
  },
  syncBadge: {
    backgroundColor: Colors.sage + '22',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.sage,
  },
  syncBadgeText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.sage,
  },

  // Invite
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    gap: Spacing.md,
  },
  inviteBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  inviteBtnDone: { backgroundColor: Colors.sage },
  inviteBtnText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },
  inviteBtnTextDone: { color: Colors.white },

  emptyText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
    paddingTop: Spacing.xl,
  },

  // Memory card (done screen)
  memoryCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    padding: Spacing.lg,
    gap: Spacing.xs,
    alignSelf: 'stretch',
  },
  memoryCardTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  memoryCardBody: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 20,
  },

  // Shared
  primaryBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryBtnDisabled: { backgroundColor: Colors.tan },
  primaryBtnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },
  skipLink: { paddingVertical: Spacing.xs, alignItems: 'center' },
  skipText: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
  },
  bottomBar: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.tan,
  },

  inviteHeader: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
