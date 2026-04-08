import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Modal, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import { useUserSearch, useAddConnection, useSyncContacts, useConfirmContactMatch, useConfirmCalendarMatch, useSyncCalendar } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius, DunbarLayers } from '@/constants/theme';
import { DunbarLayer } from '@/types';

// ── Add to circle modal ────────────────────────────────
const AddToCircleModal = ({
  visible,
  person,
  onClose,
  onAdd,
}: {
  visible: boolean;
  person: { id: string; displayName: string; avatarColour: string; city?: string } | null;
  onClose: () => void;
  onAdd: (payload: {
    connectedUserId: string;
    relation: string;
    layer: DunbarLayer;
    since?: string;
    contactFrequency: number;
  }) => void;
}) => {
  const [relation, setRelation] = useState('');
  const [layer, setLayer] = useState<DunbarLayer>('active');
  const [since, setSince] = useState('');
  const [contactFrequency, setContactFrequency] = useState(14);

  const RELATIONS = [
    'Best friend', 'Friend', 'Close friend',
    'Family', 'Partner', 'Colleague',
    'Mentor', 'Neighbour', 'Acquaintance',
  ];

  const FREQUENCY_OPTIONS = [
    { label: 'Every few days', days: 3 },
    { label: 'Weekly', days: 7 },
    { label: 'Fortnightly', days: 14 },
    { label: 'Monthly', days: 30 },
    { label: 'Every few months', days: 90 },
  ];

  const handleAdd = () => {
    if (!relation) {
      Alert.alert('Missing info', 'Please select a relation type.');
      return;
    }
    onAdd({
      connectedUserId: person!.id,
      relation,
      layer,
      since: since || undefined,
      contactFrequency,
    });
  };

  const reset = () => {
    setRelation('');
    setLayer('active');
    setSince('');
    setContactFrequency(14);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { reset(); onClose(); }}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add to circle</Text>
          <TouchableOpacity onPress={handleAdd}>
            <Text style={styles.modalSave}>Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Person summary */}
          {person && (
            <View style={styles.personSummary}>
              <View style={[styles.personAvatar, { backgroundColor: person.avatarColour }]}>
                <Text style={styles.personAvatarText}>
                  {person.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.personName}>{person.displayName}</Text>
                {person.city && (
                  <Text style={styles.personCity}>{person.city}</Text>
                )}
              </View>
            </View>
          )}

          {/* Relation */}
          <Text style={styles.sectionLabel}>Relation</Text>
          <View style={styles.chipGrid}>
            {RELATIONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, relation === r && styles.chipActive]}
                onPress={() => setRelation(r)}
              >
                <Text style={[styles.chipText, relation === r && styles.chipTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom relation */}
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            value={RELATIONS.includes(relation) ? '' : relation}
            onChangeText={setRelation}
            placeholder="Or type your own…"
            placeholderTextColor={Colors.textLight}
          />

          {/* Dunbar layer */}
          <Text style={styles.sectionLabel}>Circle layer</Text>
          {DunbarLayers.map(l => (
            <TouchableOpacity
              key={l.key}
              style={[styles.layerOption, layer === l.key && styles.layerOptionActive]}
              onPress={() => setLayer(l.key as DunbarLayer)}
            >
              <View style={styles.layerRadio}>
                {layer === l.key && <View style={styles.layerRadioInner} />}
              </View>
              <View style={styles.layerText}>
                <Text style={[styles.layerLabel, layer === l.key && styles.layerLabelActive]}>
                  {l.label}
                  <Text style={styles.layerLimit}> · up to {l.limit}</Text>
                </Text>
                <Text style={styles.layerDesc}>{l.description}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Since when */}
          <Text style={styles.sectionLabel}>Friends since (optional)</Text>
          <TextInput
            style={styles.input}
            value={since}
            onChangeText={setSince}
            placeholder="e.g. 2015 or uni days"
            placeholderTextColor={Colors.textLight}
          />

          {/* Contact frequency */}
          <Text style={styles.sectionLabel}>How often do you want to stay in touch?</Text>
          <View style={styles.chipGrid}>
            {FREQUENCY_OPTIONS.map(f => (
              <TouchableOpacity
                key={f.days}
                style={[styles.chip, contactFrequency === f.days && styles.chipActive]}
                onPress={() => setContactFrequency(f.days)}
              >
                <Text style={[styles.chipText, contactFrequency === f.days && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ── Search result item ─────────────────────────────────
const SearchResult = ({
  person,
  onAdd,
}: {
  person: {
    id: string;
    displayName: string;
    avatarColour: string;
    city?: string;
    inCircle: boolean;
  };
  onAdd: (person: any) => void;
}) => (
  <View style={styles.resultRow}>
    <View style={[styles.resultAvatar, { backgroundColor: person.avatarColour }]}>
      <Text style={styles.resultAvatarText}>
        {person.displayName.charAt(0).toUpperCase()}
      </Text>
    </View>
    <View style={styles.resultInfo}>
      <Text style={styles.resultName}>{person.displayName}</Text>
      {person.city && <Text style={styles.resultCity}>{person.city}</Text>}
    </View>
    {person.inCircle ? (
      <View style={styles.inCircleBadge}>
        <Text style={styles.inCircleBadgeText}>In circle</Text>
      </View>
    ) : (
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => onAdd(person)}
      >
        <Text style={styles.addBtnText}>Add</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ── Calendar match card ────────────────────────────────
const CalendarMatchCard = ({
  match,
  onConfirm,
  onDismiss,
}: {
  match: any;
  onConfirm: (match: any, note?: string) => void;
  onDismiss: (connectionId: string) => void;
}) => {
  const [noteVisible, setNoteVisible] = useState(false);
  const [eventNote, setEventNote] = useState('');

  return (
    <View style={calStyles.card}>
      <Text style={calStyles.name}>{match.connectionName}</Text>
      <Text style={calStyles.meta}>
        {match.eventTitle} · {new Date(match.eventDate).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric'
        })}
      </Text>

      {noteVisible ? (
        <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
          <TextInput
            style={calStyles.noteInput}
            value={eventNote}
            onChangeText={setEventNote}
            placeholder="Add a note about this meeting…"
            placeholderTextColor={Colors.textLight}
            multiline
            autoFocus
            maxLength={500}
          />
          <View style={calStyles.actions}>
            <TouchableOpacity
              style={calStyles.confirmBtn}
              onPress={() => onConfirm(match, eventNote || undefined)}
            >
              <Text style={calStyles.confirmBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={calStyles.dismissBtn}
              onPress={() => onConfirm(match)}
            >
              <Text style={calStyles.dismissBtnText}>Skip note</Text>
            </TouchableOpacity>
          </View>
          <Text style={calStyles.hint}>Voice notes coming in Phase 4</Text>
        </View>
      ) : (
        <View style={calStyles.actions}>
          <TouchableOpacity
            style={calStyles.confirmBtn}
            onPress={() => setNoteVisible(true)}
          >
            <Text style={calStyles.confirmBtnText}>Yes, we met</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={calStyles.dismissBtn}
            onPress={() => onDismiss(match.connectionId)}
          >
            <Text style={calStyles.dismissBtnText}>Not relevant</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const calStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.terracotta + '44',
    marginBottom: Spacing.sm,
  },
  name: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  meta: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
    marginBottom: Spacing.sm,
  },
  noteInput: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  dismissBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  hint: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

// ── Connect screen ─────────────────────────────────────
export default function ConnectScreen() {
  const [query, setQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    matched: any[];
    suggestions: any[];
    total: number;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [calendarResult, setCalendarResult] = useState<{
    matches: any[];
    dismissedIds: string[];
  } | null>(null);
  const { data: results = [], isLoading } = useUserSearch(query);
  const { mutate: addConnection } = useAddConnection();
  const { mutate: syncContacts } = useSyncContacts();
  const { mutate: confirmMatch } = useConfirmContactMatch();
  const { mutate: confirmCalendarMatch } = useConfirmCalendarMatch();
  const { mutate: syncCalendar } = useSyncCalendar();

  const handleSyncContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow access to your contacts to use this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });

    const contacts = data
      .filter(c => c.name)
      .map(c => ({
        name: c.name!,
        phoneNumber: c.phoneNumbers?.[0]?.number,
      }));

    syncContacts(contacts, {
      onSuccess: (result) => {
        setSyncResult(result);
        setIsSyncing(false);
      },
      onError: () => {
        Alert.alert('Sync failed', 'Could not sync contacts. Please try again.');
        setIsSyncing(false);
      },
    });
  };

  const handleConfirmMatch = (suggestion: any) => {
    console.log('CONFIRMING:', suggestion.connectedUserId, suggestion.phoneNumber);
    confirmMatch(
      { connectedUserId: suggestion.connectedUserId, phoneNumber: suggestion.phoneNumber },
      {
        onSuccess: (result) => {
          console.log('CONFIRM SUCCESS:', JSON.stringify(result));
          setSyncResult(prev => prev ? {
            ...prev,
            matched: [...prev.matched, {
              connectionId: suggestion.connectionId,
              name: suggestion.rootsName,
              phoneNumber: suggestion.phoneNumber,
            }],
            suggestions: prev.suggestions?.filter(
              (s: any) => s.connectionId !== suggestion.connectionId
            ),
          } : prev);
        },
        onError: (err: any) => {
          console.log('CONFIRM ERROR:', err?.message, err?.response?.status, err?.response?.data);
        },
      }
    );
  };

  const handleDismissMatch = (connectionId: string) => {
    setSyncResult(prev => prev ? {
      ...prev,
      suggestions: prev.suggestions?.filter(
        (s: any) => s.connectionId !== connectionId
      ),
    } : prev);
  };

  const handleSyncCalendar = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Please allow access to your calendar to use this feature.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    setIsCalendarSyncing(true);
    setCalendarResult(null);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map(c => c.id);

    const calEvents = await Calendar.getEventsAsync(calendarIds, thirtyDaysAgo, now);

    const events = calEvents
      .filter(e => e.title)
      .map(e => ({
        title: e.title,
        date: e.startDate,
        attendees: (e.attendees ?? []).map((a: any) => a.name ?? a.email ?? ''),
      }));

    syncCalendar(events, {
      onSuccess: (result) => {
        setCalendarResult({ matches: result.matches, dismissedIds: [] });
        setIsCalendarSyncing(false);
        if (result.matches.length === 0) {
          Alert.alert('No matches', `Checked ${result.total} events — no circle members found.`);
        }
      },
      onError: () => {
        Alert.alert('Sync failed', 'Could not sync calendar. Please try again.');
        setIsCalendarSyncing(false);
      },
    });
  };

  const handleConfirmCalendar = (match: any, note?: string) => {
    confirmCalendarMatch(
      {
        connectionId: match.connectionId,
        eventDate: match.eventDate,
        eventTitle: match.eventTitle,
        note,
      },
      {
        onSuccess: () => {
          setCalendarResult(prev => prev ? {
            ...prev,
            matches: prev.matches.filter(m => m.connectionId !== match.connectionId),
            dismissedIds: [...prev.dismissedIds],
          } : prev);
        },
      }
    );
  };

  const handleDismissCalendar = (connectionId: string) => {
    setCalendarResult(prev => prev ? {
      ...prev,
      matches: prev.matches.filter(m => m.connectionId !== connectionId),
      dismissedIds: [...prev.dismissedIds, connectionId],
    } : prev);
  };

  const handleAdd = (person: any) => {
    setSelectedPerson(person);
    setModalVisible(true);
  };

  const handleConfirmAdd = (payload: any) => {
    addConnection(payload, {
      onSuccess: () => {
        setModalVisible(false);
        setSelectedPerson(null);
        setQuery('');
        Alert.alert(
          'Added to circle',
          `${selectedPerson?.displayName} has been added to your circle.`
        );
      },
      onError: () => {
        Alert.alert('Error', 'Failed to add connection. Please try again.');
      },
    });
  };

  const handleInvite = (name: string) => {
    const message = `Hi! I've been using Roots — a private app for keeping in touch with the people who matter most. No social feed, no ads, just real connections. Join me here: https://yourroots.app`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(whatsappUrl).then(supported => {
      if (supported) {
        Linking.openURL(whatsappUrl);
      } else {
        Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
      }
    });
  };

  const showInvite = query.length > 1 && results.length === 0 && !isLoading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Connect</Text>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search people on Roots…"
            placeholderTextColor={Colors.textLight}
            autoCapitalize="words"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Loading */}
        {isLoading && (
          <ActivityIndicator
            color={Colors.terracotta}
            style={{ marginTop: Spacing.lg }}
          />
        )}

        {/* Search results */}
        {results.length > 0 && (
          <View style={styles.results}>
            <Text style={styles.resultsLabel}>
              {results.length} {results.length === 1 ? 'person' : 'people'} found
            </Text>
            {results.map((person: any) => (
              <SearchResult
                key={person.id}
                person={person}
                onAdd={handleAdd}
              />
            ))}
          </View>
        )}

        {/* Invite if not found */}
        {showInvite && (
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>
              "{query}" isn't on Roots yet
            </Text>
            <Text style={styles.inviteDesc}>
              Invite them to join. Once they sign up, you can add them to your circle.
            </Text>
            <TouchableOpacity
              style={styles.inviteBtn}
              onPress={() => handleInvite(query)}
            >
              <Text style={styles.inviteBtnText}>
                Invite {query} via WhatsApp
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.inviteBtnSms}
              onPress={() => {
                const message = `Hi ${query}! I've been using Roots — a private app for keeping in touch with the people who matter most. No social feed, no ads, just real connections. Join me: https://yourroots.app`;
                Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
              }}
            >
              <Text style={styles.inviteBtnSmsText}>Send SMS instead</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty state — no search yet */}
        {query.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Find your people</Text>
            <Text style={styles.emptyDesc}>
              Search for friends and family who are already on Roots and add them to your circle.
            </Text>

            {/* Sync contacts card */}
            <View style={styles.syncCard}>
              <Text style={styles.syncTitle}>Sync your contacts</Text>
              <Text style={styles.syncDesc}>
                Match your phone contacts to the people in your circle and fill in missing phone numbers automatically.
              </Text>

              {syncResult ? (
                <View style={styles.syncResultWrap}>
                  {/* Auto-matched */}
                  {syncResult.matched.length > 0 && (
                    <View style={styles.syncResultSection}>
                      <Text style={styles.syncResultTitle}>
                        ✓  {syncResult.matched.length} matched automatically
                      </Text>
                      {syncResult.matched.map((m: any) => (
                        <View key={m.connectionId} style={styles.syncMatchRow}>
                          <Text style={styles.syncMatchName}>{m.name}</Text>
                          <Text style={styles.syncMatchPhone}>{m.phoneNumber}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Suggestions needing confirmation */}
                  {syncResult.suggestions?.length > 0 && (
                    <View style={styles.syncResultSection}>
                      <Text style={styles.syncSuggestTitle}>
                        Possible matches — please confirm
                      </Text>
                      {syncResult.suggestions.map((s: any) => (
                        <View key={s.connectionId} style={styles.suggestionCard}>
                          <View style={styles.suggestionNames}>
                            <Text style={styles.suggestionRootsName}>{s.rootsName}</Text>
                            <Text style={styles.suggestionArrow}>→</Text>
                            <Text style={styles.suggestionContactName}>{s.contactName}</Text>
                            <View style={styles.suggestionScore}>
                              <Text style={styles.suggestionScoreText}>{s.score}%</Text>
                            </View>
                          </View>
                          {s.phoneNumber && (
                            <Text style={styles.suggestionPhone}>{s.phoneNumber}</Text>
                          )}
                          <View style={styles.suggestionActions}>
                            <TouchableOpacity
                              style={styles.confirmBtn}
                              onPress={() => handleConfirmMatch(s)}
                            >
                              <Text style={styles.confirmBtnText}>Yes, that's them</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.dismissBtn}
                              onPress={() => handleDismissMatch(s.connectionId)}
                            >
                              <Text style={styles.dismissBtnText}>Not the same</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {syncResult.matched.length === 0 && !syncResult.suggestions?.length && (
                    <Text style={styles.syncNoMatch}>
                      No matches found from {syncResult.total} contacts
                    </Text>
                  )}

                  <TouchableOpacity onPress={() => setSyncResult(null)} style={styles.syncAgainBtn}>
                    <Text style={styles.syncAgainText}>Sync again</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={handleSyncContacts}
                  disabled={isSyncing}
                  activeOpacity={0.85}
                >
                  {isSyncing
                    ? <ActivityIndicator color={Colors.white} />
                    : <Text style={styles.syncBtnText}>Sync contacts</Text>
                  }
                </TouchableOpacity>
              )}
            </View>

            {/* Sync calendar card */}
            <View style={styles.syncCard}>
              <Text style={styles.syncTitle}>Sync your calendar</Text>
              <Text style={styles.syncDesc}>
                Match recent calendar events to people in your circle and log interactions automatically.
              </Text>
              <TouchableOpacity
                style={styles.syncBtn}
                onPress={handleSyncCalendar}
                disabled={isCalendarSyncing}
                activeOpacity={0.85}
              >
                {isCalendarSyncing
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.syncBtnText}>Sync calendar</Text>
                }
              </TouchableOpacity>
            </View>

            {/* Calendar matches */}
            {calendarResult && calendarResult.matches.length > 0 && (
              <View style={styles.syncCard}>
                <Text style={styles.syncTitle}>Calendar matches</Text>
                <Text style={styles.syncDesc}>
                  We found calendar events that match people in your circle. Did you meet with them?
                </Text>
                {calendarResult.matches.map((m: any) => (
                  <CalendarMatchCard
                    key={m.connectionId}
                    match={m}
                    onConfirm={handleConfirmCalendar}
                    onDismiss={handleDismissCalendar}
                  />
                ))}
              </View>
            )}

            {/* Find My 150 stub */}
            <TouchableOpacity style={styles.find150Btn}>
              <Text style={styles.find150BtnTitle}>Find My 150</Text>
              <Text style={styles.find150BtnDesc}>
                AI-assisted · analyses your contacts, calls and messages to find the people who matter most
              </Text>
              <View style={styles.find150Badge}>
                <Text style={styles.find150BadgeText}>Coming in Phase 3</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add to circle modal */}
      <AddToCircleModal
        visible={modalVisible}
        person={selectedPerson}
        onClose={() => {
          setModalVisible(false);
          setSelectedPerson(null);
        }}
        onAdd={handleConfirmAdd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  title: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    marginBottom: Spacing.lg,
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    paddingVertical: Spacing.md,
  },
  clearBtn: { padding: Spacing.xs },
  clearBtnText: { fontSize: 20, color: Colors.textLight, lineHeight: 24 },

  // Results
  results: { paddingHorizontal: Spacing.lg },
  resultsLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
    gap: Spacing.md,
  },
  resultAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultAvatarText: { fontSize: 16, color: Colors.white, fontWeight: '600' },
  resultInfo: { flex: 1 },
  resultName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  resultCity: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  inCircleBadge: {
    backgroundColor: Colors.sage + '22',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: Colors.sage + '44',
  },
  inCircleBadgeText: { fontSize: 12, color: Colors.sage, fontWeight: '600' },
  addBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  addBtnText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },

  // Invite card
  inviteCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  inviteTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  inviteDesc: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },
  inviteBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  inviteBtnText: {
    fontSize: Typography.body,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  inviteBtnSms: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  inviteBtnSmsText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  // Empty state
  emptyState: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.heading.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontSize: Typography.body,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  // Sync contacts
  syncCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    marginBottom: Spacing.md,
  },
  syncTitle: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  syncDesc: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },
  syncBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  syncBtnText: {
    fontSize: Typography.body,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  syncResultWrap: { gap: Spacing.md },
  syncResultSection: { gap: Spacing.xs },
  syncResultTitle: {
    fontSize: 13,
    color: Colors.sage,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  syncSuggestTitle: {
    fontSize: 13,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  suggestionCard: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.terracotta + '44',
    gap: Spacing.sm,
  },
  suggestionNames: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  suggestionRootsName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  suggestionArrow: {
    fontSize: 13,
    color: Colors.textLight,
  },
  suggestionContactName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  suggestionScore: {
    backgroundColor: Colors.terracotta + '18',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  suggestionScoreText: {
    fontSize: 10,
    color: Colors.terracotta,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  suggestionPhone: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 12,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  dismissBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  syncNoMatch: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    fontStyle: 'italic',
  },
  syncMatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  syncMatchName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    fontWeight: '600',
  },
  syncMatchPhone: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  syncAgainBtn: { marginTop: Spacing.sm },
  syncAgainText: {
    fontSize: 13,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },

  find150Btn: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  find150BtnTitle: {
    fontSize: Typography.heading.sm,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  find150BtnDesc: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  find150Badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
  },
  find150BadgeText: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  modalTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  modalCancel: {
    fontSize: Typography.body,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  modalSave: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  modalContent: { flex: 1, padding: Spacing.lg },

  // Person summary in modal
  personSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    marginBottom: Spacing.xl,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: { fontSize: 18, color: Colors.white, fontWeight: '600' },
  personName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  personCity: { fontSize: 12, color: Colors.textLight, marginTop: 2 },

  // Section labels
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  // Chips
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    backgroundColor: Colors.card,
  },
  chipActive: {
    backgroundColor: Colors.terracotta,
    borderColor: Colors.terracotta,
  },
  chipText: {
    fontSize: 13,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  chipTextActive: { color: Colors.white, fontWeight: '600' },

  // Layer options
  layerOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  layerOptionActive: {
    borderColor: Colors.terracotta,
    backgroundColor: Colors.terracotta + '08',
  },
  layerRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.tan,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  layerRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.terracotta,
  },
  layerText: { flex: 1 },
  layerLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  layerLabelActive: { color: Colors.terracotta },
  layerLimit: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.textLight,
  },
  layerDesc: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  // Input
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
});
