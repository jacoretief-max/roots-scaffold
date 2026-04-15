import { useState, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator,
  Modal, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import * as Contacts from 'expo-contacts';
import * as Calendar from 'expo-calendar';
import { router } from 'expo-router';
import {
  useConnections,
  useUserSearch,
  useAddConnection,
  useSyncContacts,
  useConfirmContactMatch,
  useConfirmCalendarMatch,
  useSyncCalendar,
} from '@/api/hooks';
import { Connection, DunbarLayer } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, DunbarLayers, Shadows } from '@/constants/theme';

// ── Dunbar ring diagram ────────────────────────────────
const DunbarDiagram = ({
  counts,
  activeLayer,
  onPress,
}: {
  counts: Record<string, number>;
  activeLayer: DunbarLayer | null;
  onPress: (layer: DunbarLayer) => void;
}) => {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const radii = [82, 64, 46, 28];
  const layers = ['meaningful', 'active', 'close', 'intimate'] as DunbarLayer[];
  const ringColors = ['#EAE0D0', '#DDD0BA', '#C45A3A22', '#C45A3A44'];

  return (
    <View style={styles.diagramWrap}>
      <Svg width={size} height={size}>
        {radii.map((r, i) => (
          <Circle
            key={layers[i]}
            cx={cx} cy={cy} r={r}
            fill={activeLayer === layers[i] ? '#C45A3A18' : ringColors[i]}
            stroke={activeLayer === layers[i] ? Colors.terracotta : Colors.tan}
            strokeWidth={activeLayer === layers[i] ? 1.5 : 0.5}
          />
        ))}
        <Circle cx={cx} cy={cy} r={8} fill={Colors.terracotta} />
      </Svg>

      <View style={styles.layerCounts}>
        {DunbarLayers.map((l) => {
          const count = counts[l.key] ?? 0;
          const isActive = activeLayer === l.key;
          return (
            <TouchableOpacity
              key={l.key}
              style={[styles.layerCount, isActive && styles.layerCountActive]}
              onPress={() => onPress(l.key as DunbarLayer)}
            >
              <Text style={[styles.layerCountNum, isActive && styles.layerCountNumActive]}>
                {count}
              </Text>
              <Text style={[styles.layerCountLabel, isActive && styles.layerCountLabelActive]}>
                {l.label}
              </Text>
              <Text style={styles.layerCountLimit}>/ {l.limit}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeLayer && (
        <View style={styles.layerDesc}>
          <Text style={styles.layerDescText}>
            {DunbarLayers.find(l => l.key === activeLayer)?.description}
          </Text>
        </View>
      )}
    </View>
  );
};

// ── Connection card ────────────────────────────────────
const ConnectionCard = ({ item }: { item: Connection }) => {
  const score = item.score ?? 80;
  const scoreColor =
    score > 75 ? Colors.scoreHealthy
    : score > 50 ? Colors.scoreMedium
    : Colors.scoreLow;

  const displayName = item.connectedUser?.displayName ?? (item as any).display_name ?? 'Unknown';
  const avatarColour = item.connectedUser?.avatarColour ?? (item as any).avatar_colour ?? Colors.terracotta;
  const city = item.connectedUser?.city ?? (item as any).city;

  const lastContactText = () => {
    if (!item.lastContactAt) return 'No contact logged';
    const days = Math.floor(
      (Date.now() - new Date(item.lastContactAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/person/${item.id}`)}
      activeOpacity={0.85}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColour }]}>
        <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        <View style={[styles.statusDot, { backgroundColor: Colors.statusAvailable }]} />
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.cardNameRow}>
          <Text style={styles.cardName}>{displayName}</Text>
          <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
        </View>
        <Text style={styles.cardMeta}>
          {item.relation ?? 'Connection'}{city ? ` · ${city}` : ''}
        </Text>
        <View style={styles.scoreBarBg}>
          <View style={[styles.scoreBarFill, { width: `${score}%` as any, backgroundColor: scoreColor }]} />
        </View>
        <Text style={styles.lastContact}>{lastContactText()}</Text>
        {item.nudge && (
          <View style={styles.nudgeRow}>
            <Text style={styles.nudgeText}>{item.nudge}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ── Search result row ──────────────────────────────────
const SearchResult = ({
  person,
  onAdd,
}: {
  person: { id: string; displayName: string; avatarColour: string; city?: string; inCircle: boolean };
  onAdd: (person: any) => void;
}) => (
  <View style={styles.resultRow}>
    <View style={[styles.resultAvatar, { backgroundColor: person.avatarColour }]}>
      <Text style={styles.resultAvatarText}>{person.displayName.charAt(0).toUpperCase()}</Text>
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
      <TouchableOpacity style={styles.addBtn} onPress={() => onAdd(person)}>
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
          day: 'numeric', month: 'short', year: 'numeric',
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
            <TouchableOpacity style={calStyles.confirmBtn} onPress={() => onConfirm(match, eventNote || undefined)}>
              <Text style={calStyles.confirmBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={calStyles.dismissBtn} onPress={() => onConfirm(match)}>
              <Text style={calStyles.dismissBtnText}>Skip note</Text>
            </TouchableOpacity>
          </View>
          <Text style={calStyles.hint}>Voice notes coming in Phase 4</Text>
        </View>
      ) : (
        <View style={calStyles.actions}>
          <TouchableOpacity style={calStyles.confirmBtn} onPress={() => setNoteVisible(true)}>
            <Text style={calStyles.confirmBtnText}>Yes, we met</Text>
          </TouchableOpacity>
          <TouchableOpacity style={calStyles.dismissBtn} onPress={() => onDismiss(match.connectionId)}>
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
  name: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  meta: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily, marginTop: 2, marginBottom: Spacing.sm },
  noteInput: {
    backgroundColor: Colors.card, borderWidth: 0.5, borderColor: Colors.tan,
    borderRadius: BorderRadius.sm, padding: Spacing.md, fontSize: Typography.body,
    fontFamily: Typography.fontFamily, color: Colors.textDark, minHeight: 70, textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  confirmBtn: { flex: 1, backgroundColor: Colors.terracotta, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center' },
  confirmBtnText: { fontSize: 13, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },
  dismissBtn: { flex: 1, borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center' },
  dismissBtnText: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily },
  hint: { fontSize: 11, color: Colors.textLight, fontFamily: Typography.fontFamily, textAlign: 'center', fontStyle: 'italic' },
});

// ── Add to circle modal ────────────────────────────────
const AddToCircleModal = ({
  visible, person, onClose, onAdd,
}: {
  visible: boolean;
  person: { id: string; displayName: string; avatarColour: string; city?: string } | null;
  onClose: () => void;
  onAdd: (payload: { connectedUserId: string; relation: string; layer: DunbarLayer; since?: string; contactFrequency: number }) => void;
}) => {
  const [relation, setRelation] = useState('');
  const [layer, setLayer] = useState<DunbarLayer>('active');
  const [since, setSince] = useState('');
  const [contactFrequency, setContactFrequency] = useState(14);

  const RELATIONS = ['Best friend', 'Friend', 'Close friend', 'Family', 'Partner', 'Colleague', 'Mentor', 'Neighbour', 'Acquaintance'];
  const FREQUENCY_OPTIONS = [
    { label: 'Every few days', days: 3 },
    { label: 'Weekly', days: 7 },
    { label: 'Fortnightly', days: 14 },
    { label: 'Monthly', days: 30 },
    { label: 'Every few months', days: 90 },
  ];

  const handleAdd = () => {
    if (!relation) { Alert.alert('Missing info', 'Please select a relation type.'); return; }
    onAdd({ connectedUserId: person!.id, relation, layer, since: since || undefined, contactFrequency });
  };

  const reset = () => { setRelation(''); setLayer('active'); setSince(''); setContactFrequency(14); };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { reset(); onClose(); }}>
      <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add to circle</Text>
          <TouchableOpacity onPress={handleAdd}>
            <Text style={styles.modalSave}>Add</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {person && (
            <View style={styles.personSummary}>
              <View style={[styles.personAvatar, { backgroundColor: person.avatarColour }]}>
                <Text style={styles.personAvatarText}>{person.displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <View>
                <Text style={styles.personName}>{person.displayName}</Text>
                {person.city && <Text style={styles.personCity}>{person.city}</Text>}
              </View>
            </View>
          )}
          <Text style={styles.sectionLabel}>Relation</Text>
          <View style={styles.chipGrid}>
            {RELATIONS.map(r => (
              <TouchableOpacity key={r} style={[styles.chip, relation === r && styles.chipActive]} onPress={() => setRelation(r)}>
                <Text style={[styles.chipText, relation === r && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            value={RELATIONS.includes(relation) ? '' : relation}
            onChangeText={setRelation}
            placeholder="Or type your own…"
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.sectionLabel}>Circle layer</Text>
          {DunbarLayers.map(l => (
            <TouchableOpacity key={l.key} style={[styles.layerOption, layer === l.key && styles.layerOptionActive]} onPress={() => setLayer(l.key as DunbarLayer)}>
              <View style={styles.layerRadio}>
                {layer === l.key && <View style={styles.layerRadioInner} />}
              </View>
              <View style={styles.layerText}>
                <Text style={[styles.layerLabel, layer === l.key && styles.layerLabelActive]}>
                  {l.label}<Text style={styles.layerLimit}> · up to {l.limit}</Text>
                </Text>
                <Text style={styles.layerDescModalText}>{l.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
          <Text style={styles.sectionLabel}>Friends since (optional)</Text>
          <TextInput
            style={styles.input}
            value={since}
            onChangeText={setSince}
            placeholder="e.g. 2015 or uni days"
            placeholderTextColor={Colors.textLight}
          />
          <Text style={styles.sectionLabel}>How often do you want to stay in touch?</Text>
          <View style={styles.chipGrid}>
            {FREQUENCY_OPTIONS.map(f => (
              <TouchableOpacity key={f.days} style={[styles.chip, contactFrequency === f.days && styles.chipActive]} onPress={() => setContactFrequency(f.days)}>
                <Text style={[styles.chipText, contactFrequency === f.days && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ── Circle screen ──────────────────────────────────────
export default function CircleScreen() {
  const [activeLayer, setActiveLayer] = useState<DunbarLayer | null>(null);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [syncResult, setSyncResult] = useState<{ matched: any[]; suggestions: any[]; total: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [calendarResult, setCalendarResult] = useState<{ matches: any[]; dismissedIds: string[] } | null>(null);
  const searchRef = useRef<TextInput>(null);

  const { data: allConnections = [], isLoading: loadingAll } = useConnections();
  const { data: filtered = [], isLoading: loadingFiltered } = useConnections(activeLayer ?? undefined);
  const { data: searchResults = [], isLoading: isSearching } = useUserSearch(query);
  const { mutate: addConnection } = useAddConnection();
  const { mutate: syncContacts } = useSyncContacts();
  const { mutate: confirmMatch } = useConfirmContactMatch();
  const { mutate: confirmCalendarMatch } = useConfirmCalendarMatch();
  const { mutate: syncCalendar } = useSyncCalendar();

  const isLoading = loadingAll || loadingFiltered;
  const searchMode = searchFocused || query.length > 0;
  const showInvite = query.length > 1 && searchResults.length === 0 && !isSearching;

  const counts = allConnections.reduce((acc, c) => {
    const layer = c.layer ?? (c as any).layer;
    acc[layer] = (acc[layer] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const displayConnections = activeLayer ? filtered : allConnections;

  const handleLayerPress = (layer: DunbarLayer) => {
    setActiveLayer(prev => prev === layer ? null : layer);
  };

  // ── Sync contacts ──────────────────────────────────
  const handleSyncContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your contacts.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setIsSyncing(true);
    setSyncResult(null);
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
    });
    const contacts = data.filter(c => c.name).map(c => ({
      name: c.name!,
      phoneNumber: c.phoneNumbers?.[0]?.number,
    }));
    syncContacts(contacts, {
      onSuccess: (result) => { setSyncResult(result); setIsSyncing(false); },
      onError: () => { Alert.alert('Sync failed', 'Could not sync contacts. Please try again.'); setIsSyncing(false); },
    });
  };

  const handleConfirmMatch = (suggestion: any) => {
    confirmMatch(
      { connectedUserId: suggestion.connectedUserId, phoneNumber: suggestion.phoneNumber },
      {
        onSuccess: () => {
          setSyncResult(prev => prev ? {
            ...prev,
            matched: [...prev.matched, { connectionId: suggestion.connectionId, name: suggestion.rootsName, phoneNumber: suggestion.phoneNumber }],
            suggestions: prev.suggestions?.filter((s: any) => s.connectionId !== suggestion.connectionId),
          } : prev);
        },
      }
    );
  };

  const handleDismissMatch = (connectionId: string) => {
    setSyncResult(prev => prev ? {
      ...prev,
      suggestions: prev.suggestions?.filter((s: any) => s.connectionId !== connectionId),
    } : prev);
  };

  // ── Sync calendar ──────────────────────────────────
  const handleSyncCalendar = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your calendar.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setIsCalendarSyncing(true);
    setCalendarResult(null);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calEvents = await Calendar.getEventsAsync(calendars.map(c => c.id), thirtyDaysAgo, now);
    const events = calEvents.filter(e => e.title).map(e => ({
      title: e.title,
      date: e.startDate,
      attendees: (e.attendees ?? []).map((a: any) => a.name ?? a.email ?? ''),
    }));
    syncCalendar(events, {
      onSuccess: (result) => {
        setCalendarResult({ matches: result.matches, dismissedIds: [] });
        setIsCalendarSyncing(false);
        if (result.matches.length === 0) Alert.alert('No matches', `Checked ${result.total} events — no circle members found.`);
      },
      onError: () => { Alert.alert('Sync failed', 'Could not sync calendar. Please try again.'); setIsCalendarSyncing(false); },
    });
  };

  const handleConfirmCalendar = (match: any, note?: string) => {
    confirmCalendarMatch({ connectionId: match.connectionId, eventDate: match.eventDate, eventTitle: match.eventTitle, note }, {
      onSuccess: () => {
        setCalendarResult(prev => prev ? {
          ...prev,
          matches: prev.matches.filter(m => m.connectionId !== match.connectionId),
        } : prev);
      },
    });
  };

  const handleDismissCalendar = (connectionId: string) => {
    setCalendarResult(prev => prev ? {
      ...prev,
      matches: prev.matches.filter(m => m.connectionId !== connectionId),
    } : prev);
  };

  // ── Add connection ─────────────────────────────────
  const handleAdd = (person: any) => { setSelectedPerson(person); setModalVisible(true); };

  const handleConfirmAdd = (payload: any) => {
    addConnection(payload, {
      onSuccess: () => {
        setModalVisible(false);
        setSelectedPerson(null);
        setQuery('');
        searchRef.current?.blur();
        Alert.alert('Added to circle', `${selectedPerson?.displayName} has been added to your circle.`);
      },
      onError: () => Alert.alert('Error', 'Failed to add connection. Please try again.'),
    });
  };

  const handleInvite = (name: string) => {
    const message = `Hi! I've been using Roots — a private app for keeping in touch with the people who matter most. No social feed, no ads, just real connections. Join me here: https://yourroots.app`;
    const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(whatsappUrl).then(supported => {
      if (supported) Linking.openURL(whatsappUrl);
      else Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Circle</Text>
      </View>

      {/* Pinned search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          ref={searchRef}
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          placeholder="Search people on Roots…"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>×</Text>
          </TouchableOpacity>
        ) : (
          searchFocused && (
            <TouchableOpacity onPress={() => { setSearchFocused(false); searchRef.current?.blur(); }} style={styles.clearBtn}>
              <Text style={styles.cancelSearchText}>Cancel</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* ── Search mode ─────────────────────────────── */}
      {searchMode ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {isSearching && (
            <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.lg }} />
          )}

          {/* Results */}
          {searchResults.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>
                {searchResults.length} {searchResults.length === 1 ? 'person' : 'people'} found
              </Text>
              {searchResults.map((person: any) => (
                <SearchResult key={person.id} person={person} onAdd={handleAdd} />
              ))}
            </View>
          )}

          {/* Invite if no results */}
          {showInvite && (
            <View style={[styles.section, styles.inviteCard]}>
              <Text style={styles.inviteTitle}>"{query}" isn't on Roots yet</Text>
              <Text style={styles.inviteDesc}>
                Invite them to join. Once they sign up, you can add them to your circle.
              </Text>
              <TouchableOpacity style={styles.inviteBtn} onPress={() => handleInvite(query)}>
                <Text style={styles.inviteBtnText}>Invite {query} via WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteBtnSms}
                onPress={() => {
                  const msg = `Hi ${query}! I've been using Roots — a private app for keeping in touch with the people who matter most. Join me: https://yourroots.app`;
                  Linking.openURL(`sms:?body=${encodeURIComponent(msg)}`);
                }}
              >
                <Text style={styles.inviteBtnSmsText}>Send SMS instead</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty search — show sync tools */}
          {query.length === 0 && (
            <View style={styles.section}>
              <Text style={styles.emptySearchTitle}>Find your people</Text>
              <Text style={styles.emptySearchDesc}>
                Search for friends and family on Roots, or sync your contacts and calendar to connect faster.
              </Text>

              {/* Sync contacts */}
              <View style={styles.syncCard}>
                <Text style={styles.syncTitle}>Sync your contacts</Text>
                <Text style={styles.syncDesc}>
                  Match your phone contacts to people in your circle and fill in missing phone numbers.
                </Text>
                {syncResult ? (
                  <View>
                    {syncResult.matched.length > 0 && (
                      <View style={styles.syncResultSection}>
                        <Text style={styles.syncResultTitle}>✓  {syncResult.matched.length} matched automatically</Text>
                        {syncResult.matched.map((m: any) => (
                          <View key={m.connectionId} style={styles.syncMatchRow}>
                            <Text style={styles.syncMatchName}>{m.name}</Text>
                            <Text style={styles.syncMatchPhone}>{m.phoneNumber}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {syncResult.suggestions?.length > 0 && (
                      <View style={styles.syncResultSection}>
                        <Text style={styles.syncSuggestTitle}>Possible matches — please confirm</Text>
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
                            {s.phoneNumber && <Text style={styles.suggestionPhone}>{s.phoneNumber}</Text>}
                            <View style={styles.suggestionActions}>
                              <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirmMatch(s)}>
                                <Text style={styles.confirmBtnText}>Yes, that's them</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismissMatch(s.connectionId)}>
                                <Text style={styles.dismissBtnText}>Not the same</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    {syncResult.matched.length === 0 && !syncResult.suggestions?.length && (
                      <Text style={styles.syncNoMatch}>No matches found from {syncResult.total} contacts</Text>
                    )}
                    <TouchableOpacity onPress={() => setSyncResult(null)} style={styles.syncAgainBtn}>
                      <Text style={styles.syncAgainText}>Sync again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.syncBtn} onPress={handleSyncContacts} disabled={isSyncing}>
                    {isSyncing ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.syncBtnText}>Sync contacts</Text>}
                  </TouchableOpacity>
                )}
              </View>

              {/* Sync calendar */}
              <View style={styles.syncCard}>
                <Text style={styles.syncTitle}>Sync your calendar</Text>
                <Text style={styles.syncDesc}>
                  Match recent calendar events to people in your circle and log interactions.
                </Text>
                <TouchableOpacity style={styles.syncBtn} onPress={handleSyncCalendar} disabled={isCalendarSyncing}>
                  {isCalendarSyncing ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.syncBtnText}>Sync calendar</Text>}
                </TouchableOpacity>
              </View>

              {/* Calendar matches */}
              {calendarResult && calendarResult.matches.length > 0 && (
                <View style={styles.syncCard}>
                  <Text style={styles.syncTitle}>Calendar matches</Text>
                  <Text style={styles.syncDesc}>Did you meet with these people?</Text>
                  {calendarResult.matches.map((m: any) => (
                    <CalendarMatchCard key={m.connectionId} match={m} onConfirm={handleConfirmCalendar} onDismiss={handleDismissCalendar} />
                  ))}
                </View>
              )}

              {/* Find My 150 */}
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
      ) : (
        // ── Browse mode ──────────────────────────────
        <ScrollView showsVerticalScrollIndicator={false}>
          <DunbarDiagram counts={counts} activeLayer={activeLayer} onPress={handleLayerPress} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {activeLayer
                ? `${DunbarLayers.find(l => l.key === activeLayer)?.label} · ${displayConnections.length} ${displayConnections.length === 1 ? 'person' : 'people'}`
                : `All connections · ${allConnections.length}`
              }
            </Text>

            {isLoading && <ActivityIndicator color={Colors.terracotta} style={{ marginTop: Spacing.lg }} />}

            {!isLoading && allConnections.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>Your circle is empty</Text>
                <Text style={styles.emptyDesc}>
                  Use the search bar above to find people and add them to your circle.
                </Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => searchRef.current?.focus()}>
                  <Text style={styles.emptyBtnText}>Search people</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isLoading && allConnections.length > 0 && displayConnections.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  No one in your {DunbarLayers.find(l => l.key === activeLayer)?.label.toLowerCase()} circle yet
                </Text>
                <Text style={styles.emptyDesc}>Add people and assign them to this layer.</Text>
              </View>
            )}

            {!isLoading && displayConnections.map((c) => (
              <ConnectionCard key={c.id} item={c} />
            ))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      <AddToCircleModal
        visible={modalVisible}
        person={selectedPerson}
        onClose={() => { setModalVisible(false); setSelectedPerson(null); }}
        onAdd={handleConfirmAdd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  title: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },

  // Search bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    height: '100%',
  },
  clearBtn: { paddingLeft: Spacing.sm },
  clearBtnText: { fontSize: 20, color: Colors.textLight, lineHeight: 22 },
  cancelSearchText: { fontSize: 13, color: Colors.terracotta, fontFamily: Typography.fontFamily, fontWeight: '600' },

  // Sections
  section: { paddingHorizontal: Spacing.lg },
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },

  // Dunbar diagram
  diagramWrap: { alignItems: 'center', paddingVertical: Spacing.lg },
  layerCounts: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.lg },
  layerCount: { alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, borderRadius: BorderRadius.sm, minWidth: 60 },
  layerCountActive: { backgroundColor: Colors.terracotta + '18' },
  layerCountNum: { fontSize: 24, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  layerCountNumActive: { color: Colors.terracotta },
  layerCountLabel: { fontSize: 11, color: Colors.textLight, marginTop: 1, fontFamily: Typography.fontFamily },
  layerCountLabelActive: { color: Colors.terracotta },
  layerCountLimit: { fontSize: 10, color: Colors.tan, fontFamily: Typography.fontFamily },
  layerDesc: { marginTop: Spacing.sm, paddingHorizontal: Spacing.xl },
  layerDescText: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, textAlign: 'center', fontStyle: 'italic' },

  // Connection card
  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.card,
    borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm,
    gap: Spacing.md, borderWidth: 0.5, borderColor: Colors.tan, ...Shadows.card,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, color: Colors.white, fontWeight: '600' },
  statusDot: { position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.card },
  cardInfo: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  cardName: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  scoreNum: { fontSize: 16, fontFamily: Typography.fontFamily, fontWeight: '700' },
  cardMeta: { fontSize: 12, color: Colors.textLight, marginBottom: Spacing.sm, fontFamily: Typography.fontFamily },
  scoreBarBg: { height: 4, backgroundColor: Colors.tan, borderRadius: 2, overflow: 'hidden', marginBottom: Spacing.xs },
  scoreBarFill: { height: '100%', borderRadius: 2 },
  lastContact: { fontSize: 11, color: Colors.textLight, fontFamily: Typography.fontFamily, marginTop: 2 },
  nudgeRow: { marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.terracotta + '10', borderLeftWidth: 2, borderLeftColor: Colors.terracotta },
  nudgeText: { fontSize: 12, color: Colors.terracottaDark, fontStyle: 'italic', fontFamily: Typography.fontFamily, lineHeight: 17 },

  // Search results
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 0.5, borderBottomColor: Colors.tan },
  resultAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  resultAvatarText: { fontSize: 16, color: Colors.white, fontWeight: '600' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '600', color: Colors.textDark },
  resultCity: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },
  inCircleBadge: { backgroundColor: Colors.terracotta + '18', borderRadius: BorderRadius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  inCircleBadgeText: { fontSize: 12, color: Colors.terracotta, fontWeight: '600', fontFamily: Typography.fontFamily },
  addBtn: { backgroundColor: Colors.terracotta, borderRadius: BorderRadius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  addBtnText: { fontSize: 13, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },

  // Invite card
  inviteCard: { marginTop: Spacing.lg },
  inviteTitle: { fontSize: Typography.heading.sm, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark, marginBottom: Spacing.sm },
  inviteDesc: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, lineHeight: 20, marginBottom: Spacing.lg },
  inviteBtn: { backgroundColor: Colors.terracotta, borderRadius: BorderRadius.sm, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.sm },
  inviteBtnText: { fontSize: Typography.body, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },
  inviteBtnSms: { borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.sm, padding: Spacing.md, alignItems: 'center' },
  inviteBtnSmsText: { fontSize: Typography.body, color: Colors.textDark, fontFamily: Typography.fontFamily },

  // Empty state (search prompt)
  emptySearchTitle: { fontSize: Typography.heading.sm, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark, marginBottom: Spacing.sm, marginTop: Spacing.lg },
  emptySearchDesc: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, lineHeight: 20, marginBottom: Spacing.xl },

  // Sync cards
  syncCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 0.5, borderColor: Colors.tan },
  syncTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  syncDesc: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, lineHeight: 19, marginBottom: Spacing.md },
  syncBtn: { backgroundColor: Colors.terracotta, borderRadius: BorderRadius.sm, padding: Spacing.md, alignItems: 'center' },
  syncBtnText: { fontSize: Typography.body, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },
  syncResultSection: { marginBottom: Spacing.md },
  syncResultTitle: { fontSize: 13, color: Colors.scoreHealthy, fontFamily: Typography.fontFamily, fontWeight: '600', marginBottom: Spacing.sm },
  syncMatchRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  syncMatchName: { fontSize: 13, color: Colors.textDark, fontFamily: Typography.fontFamily },
  syncMatchPhone: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },
  syncSuggestTitle: { fontSize: 13, color: Colors.textDark, fontFamily: Typography.fontFamily, fontWeight: '600', marginBottom: Spacing.sm },
  syncNoMatch: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, marginBottom: Spacing.md },
  syncAgainBtn: { marginTop: Spacing.sm },
  syncAgainText: { fontSize: 13, color: Colors.terracotta, fontFamily: Typography.fontFamily },
  suggestionCard: { backgroundColor: Colors.background, borderRadius: BorderRadius.sm, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 0.5, borderColor: Colors.tan },
  suggestionNames: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  suggestionRootsName: { fontSize: 13, color: Colors.textDark, fontWeight: '600', fontFamily: Typography.fontFamily },
  suggestionArrow: { fontSize: 13, color: Colors.textLight },
  suggestionContactName: { fontSize: 13, color: Colors.textDark, fontFamily: Typography.fontFamily },
  suggestionScore: { backgroundColor: Colors.terracotta + '18', borderRadius: BorderRadius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  suggestionScoreText: { fontSize: 11, color: Colors.terracotta, fontWeight: '700', fontFamily: Typography.fontFamily },
  suggestionPhone: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily, marginBottom: Spacing.sm },
  suggestionActions: { flexDirection: 'row', gap: Spacing.sm },
  confirmBtn: { flex: 1, backgroundColor: Colors.terracotta, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center' },
  confirmBtnText: { fontSize: 12, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },
  dismissBtn: { flex: 1, borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.sm, padding: Spacing.sm, alignItems: 'center' },
  dismissBtnText: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },

  // Find My 150
  find150Btn: { backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 0.5, borderColor: Colors.tan, opacity: 0.7 },
  find150BtnTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark, marginBottom: 4 },
  find150BtnDesc: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, lineHeight: 19, marginBottom: Spacing.sm },
  find150Badge: { backgroundColor: Colors.terracotta + '18', borderRadius: BorderRadius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  find150BadgeText: { fontSize: 11, color: Colors.terracotta, fontWeight: '700', fontFamily: Typography.fontFamily },

  // Empty circle state
  empty: { alignItems: 'center', paddingTop: Spacing.xl, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  emptyTitle: { fontSize: Typography.heading.sm, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark, marginBottom: Spacing.sm, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, textAlign: 'center', lineHeight: 20, marginBottom: Spacing.lg },
  emptyBtn: { backgroundColor: Colors.terracotta, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  emptyBtnText: { fontSize: Typography.body, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },

  // Add to circle modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 0.5, borderBottomColor: Colors.tan },
  modalCancel: { fontSize: Typography.body, color: Colors.textLight, fontFamily: Typography.fontFamily },
  modalTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  modalSave: { fontSize: Typography.body, color: Colors.terracotta, fontWeight: '700', fontFamily: Typography.fontFamily },
  modalContent: { flex: 1, paddingHorizontal: Spacing.lg },
  personSummary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg, borderBottomWidth: 0.5, borderBottomColor: Colors.tan, marginBottom: Spacing.md },
  personAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  personAvatarText: { fontSize: 20, color: Colors.white, fontWeight: '600' },
  personName: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  personCity: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  chip: { borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  chipActive: { backgroundColor: Colors.terracotta + '18', borderColor: Colors.terracotta },
  chipText: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily },
  chipTextActive: { color: Colors.terracotta, fontWeight: '600' },
  input: { borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.sm, padding: Spacing.md, fontSize: Typography.body, fontFamily: Typography.fontFamily, color: Colors.textDark, backgroundColor: Colors.card, marginBottom: Spacing.md },
  layerOption: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.md, marginBottom: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 0.5, borderColor: Colors.tan },
  layerOptionActive: { borderColor: Colors.terracotta, backgroundColor: Colors.terracotta + '08' },
  layerRadio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: Colors.tan, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  layerRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.terracotta },
  layerText: { flex: 1 },
  layerLabel: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '600', color: Colors.textDark },
  layerLabelActive: { color: Colors.terracotta },
  layerLimit: { fontSize: 12, color: Colors.textLight, fontWeight: '400' },
  layerDescModalText: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily, marginTop: 2 },
});
