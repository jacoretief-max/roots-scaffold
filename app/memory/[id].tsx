import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Animated,
  Dimensions, Modal, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  useMemory, useAddMemoryEntry, useUpdateMemoryEntry,
  useDeleteMemoryEntry, useUpdateMemory, useConnectionSearch,
} from '@/api/hooks';
import { useAuthStore } from '@/store/authStore';
import { MemoryEntry, MemoryEvent, VisibilityLevel } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

// ── Colour rotation hook ───────────────────────────────
const FALLBACK_COLORS = [
  Colors.terracotta,
  '#7A5C3A',
  Colors.sage,
  '#4A6A7A',
  '#7A4A5C',
];

const useColorRotation = (colors: string[], interval = 2200) => {
  const [index, setIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (colors.length <= 1) return;
    const timer = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0.6, duration: 400, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
      setIndex((i) => (i + 1) % colors.length);
    }, interval);
    return () => clearInterval(timer);
  }, [colors.length]);

  return { color: colors[index] ?? FALLBACK_COLORS[0], fadeAnim };
};

// ── Structured view ────────────────────────────────────
const StructuredView = ({
  entries,
  currentUserId,
  isCreator,
  onDeleteEntry,
}: {
  entries: MemoryEntry[];
  currentUserId: string;
  isCreator: boolean;
  onDeleteEntry: (entryId: string, authorName: string) => void;
}) => (
  <ScrollView
    style={styles.structuredScroll}
    contentContainerStyle={styles.structuredContent}
    showsVerticalScrollIndicator={false}
  >
    {entries.length === 0 && (
      <View style={styles.noEntries}>
        <Text style={styles.noEntriesText}>No perspectives yet.</Text>
        <Text style={styles.noEntriesSub}>Be the first to write your memory.</Text>
      </View>
    )}
    {entries.map((entry) => {
      const isMe = entry.authorId === currentUserId;
      const canDelete = isCreator || isMe;
      return (
        <View key={entry.id} style={[styles.entryCard, isMe && styles.entryCardMe]}>
          {/* Author row */}
          <View style={styles.entryHeader}>
            {entry.author?.avatarUrl ? (
              <Image
                source={{ uri: entry.author.avatarUrl }}
                style={styles.entryAvatar}
              />
            ) : (
              <View style={[styles.entryAvatar, { backgroundColor: entry.author?.avatarColour ?? Colors.terracotta }]}>
                <Text style={styles.entryAvatarText}>
                  {entry.author?.displayName?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.entryAuthor}>
                {isMe ? 'You' : entry.author?.displayName}
              </Text>
              <Text style={styles.entryTime}>
                {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric'
                }) : ''}
              </Text>
            </View>
            {entry.isNew && !isMe && (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            )}
            {canDelete && (
              <TouchableOpacity
                onPress={() => onDeleteEntry(entry.id, isMe ? 'your' : entry.author?.displayName ?? '')}
                style={styles.entryDeleteBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.entryDeleteBtnText}>×</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Memory text */}
          <Text style={styles.entryText}>{entry.text}</Text>
        </View>
      );
    })}
  </ScrollView>
);

// ── Immersive view ────────────────────────────────────
const ImmersiveView = ({
  entries,
  colors,
}: {
  entries: MemoryEntry[];
  colors: string[];
}) => {
  const [entryIndex, setEntryIndex] = useState(0);
  const { color, fadeAnim } = useColorRotation(colors, 5200);
  const driftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (entries.length === 0) return;
    const timer = setInterval(() => {
      setEntryIndex((i) => (i + 1) % entries.length);
      driftAnim.setValue(0);
      Animated.timing(driftAnim, {
        toValue: -20,
        duration: 5000,
        useNativeDriver: true,
      }).start();
    }, 5200);
    return () => clearInterval(timer);
  }, [entries.length]);

  useEffect(() => {
    Animated.timing(driftAnim, {
      toValue: -20,
      duration: 5000,
      useNativeDriver: true,
    }).start();
  }, []);

  const currentEntry = entries[entryIndex];

  return (
    <Animated.View style={[styles.immersive, { backgroundColor: color, opacity: fadeAnim }]}>
      <View style={styles.immersiveOverlay} />

      {currentEntry && (
        <Animated.View style={[
          styles.immersiveContent,
          { transform: [{ translateY: driftAnim }] }
        ]}>
          <Text style={styles.immersiveAuthor}>
            {currentEntry.author?.displayName ?? 'You'}
          </Text>
          <Text style={styles.immersiveText}>{currentEntry.text}</Text>
        </Animated.View>
      )}

      {/* Entry selector dots */}
      {entries.length > 1 && (
        <View style={styles.immersiveDots}>
          {entries.map((_, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setEntryIndex(i)}
              style={[styles.immersiveDot, i === entryIndex && styles.immersiveDotActive]}
            />
          ))}
        </View>
      )}

      {entries.length === 0 && (
        <View style={styles.immersiveEmpty}>
          <Text style={styles.immersiveEmptyText}>No memories written yet.</Text>
        </View>
      )}
    </Animated.View>
  );
};

// ── Add perspective input ──────────────────────────────
const AddPerspective = ({ eventId }: { eventId: string }) => {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const { mutate: addEntry, isPending } = useAddMemoryEntry(eventId);

  const handleSubmit = () => {
    if (!text.trim()) return;
    addEntry(text.trim(), {
      onSuccess: () => setText(''),
    });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={[styles.addPerspective, focused && styles.addPerspectiveFocused]}>
        <TextInput
          style={styles.perspectiveInput}
          placeholder="Add your perspective…"
          placeholderTextColor={Colors.textLight}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || isPending) && styles.sendBtnDisabled]}
          onPress={handleSubmit}
          disabled={!text.trim() || isPending}
        >
          <Text style={styles.sendBtnText}>{isPending ? '…' : 'Add'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ── Edit memory modal (creator only) ──────────────────
const VISIBILITY_OPTIONS: { key: VisibilityLevel; label: string; desc: string }[] = [
  { key: 'onlyUs',      label: 'Only us',              desc: 'Tagged people only' },
  { key: 'intimate',    label: 'Intimate',              desc: 'Tagged + your intimate circle (up to 5)' },
  { key: 'close',       label: 'Close',                 desc: 'Tagged + intimate and close (up to 15)' },
  { key: 'active',      label: 'Active',                desc: 'Tagged + first 50 connections' },
  { key: 'meaningful',  label: 'Everyone meaningful',   desc: 'Your full meaningful network (up to 150)' },
];

const EditMemoryModal = ({
  visible,
  event,
  onClose,
  onSave,
}: {
  visible: boolean;
  event: MemoryEvent;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    date: string;
    location: string;
    visibility: VisibilityLevel;
    participantIds: string[];
  }) => void;
}) => {
  const [title, setTitle] = useState(event.title ?? '');
  const [date, setDate] = useState(event.date ?? '');
  const [location, setLocation] = useState(event.location ?? '');
  const [visibility, setVisibility] = useState<VisibilityLevel>(event.visibility ?? 'intimate');
  const [participants, setParticipants] = useState<{ id: string; displayName: string; avatarColour: string }[]>(
    event.participants ?? []
  );
  const [searchQuery, setSearchQuery] = useState('');
  const { data: searchResults = [] } = useConnectionSearch(searchQuery);

  const creatorId = event.createdByUserId;

  const addParticipant = (person: { id: string; displayName: string; avatarColour: string }) => {
    if (participants.find(p => p.id === person.id)) return;
    setParticipants(prev => [...prev, person]);
    setSearchQuery('');
  };

  const removeParticipant = (personId: string) => {
    setParticipants(prev => prev.filter(p => p.id !== personId));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.editModal} edges={['top', 'bottom']}>
        <View style={styles.editHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.editCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.editTitle}>Edit memory</Text>
          <TouchableOpacity
            onPress={() => onSave({
              title: title.trim(),
              date,
              location: location.trim(),
              visibility,
              participantIds: participants.map(p => p.id),
            })}
            disabled={!title.trim()}
          >
            <Text style={[styles.editSave, !title.trim() && styles.editSaveDisabled]}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.editScroll} keyboardShouldPersistTaps="handled">
          {/* Title */}
          <Text style={styles.editSectionLabel}>Title</Text>
          <TextInput
            style={styles.editTextInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Memory title"
            placeholderTextColor={Colors.textLight}
            maxLength={120}
          />

          {/* Date */}
          <Text style={styles.editSectionLabel}>Date</Text>
          <TextInput
            style={styles.editTextInput}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.textLight}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />

          {/* Location */}
          <Text style={styles.editSectionLabel}>Location</Text>
          <TextInput
            style={styles.editTextInput}
            value={location}
            onChangeText={setLocation}
            placeholder="City, country or venue"
            placeholderTextColor={Colors.textLight}
            maxLength={120}
          />

          {/* Visibility */}
          <Text style={styles.editSectionLabel}>Visibility</Text>
          {VISIBILITY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.visibilityOption, visibility === opt.key && styles.visibilityOptionActive]}
              onPress={() => setVisibility(opt.key)}
            >
              <View style={styles.visibilityRadio}>
                {visibility === opt.key && <View style={styles.visibilityRadioInner} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.visibilityLabel, visibility === opt.key && styles.visibilityLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.visibilityDesc}>{opt.desc}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Participants */}
          <Text style={styles.editSectionLabel}>People in this memory</Text>

          {/* Current participants */}
          {participants.map(p => (
            <View key={p.id} style={styles.participantRow}>
              <View style={[styles.participantRowAvatar, { backgroundColor: p.avatarColour }]}>
                <Text style={styles.participantRowAvatarText}>
                  {p.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.participantRowName}>{p.displayName}</Text>
              {p.id !== creatorId && (
                <TouchableOpacity onPress={() => removeParticipant(p.id)} style={styles.participantRemoveBtn}>
                  <Text style={styles.participantRemoveBtnText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Search to add */}
          <TextInput
            style={[styles.editTextInput, { marginTop: Spacing.sm }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search your connections to add…"
            placeholderTextColor={Colors.textLight}
          />
          {searchResults.map((result: any) => {
            const cu = result.connectedUser ?? result;
            if (participants.find(p => p.id === cu.id)) return null;
            return (
              <TouchableOpacity
                key={cu.id}
                style={styles.searchResultRow}
                onPress={() => addParticipant({ id: cu.id, displayName: cu.displayName, avatarColour: cu.avatarColour })}
              >
                <View style={[styles.participantRowAvatar, { backgroundColor: cu.avatarColour }]}>
                  <Text style={styles.participantRowAvatarText}>
                    {cu.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.participantRowName}>{cu.displayName}</Text>
                <Text style={styles.searchResultAdd}>+ Add</Text>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ── Event screen ───────────────────────────────────────
export default function MemoryEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading } = useMemory(id);
  const { user } = useAuthStore();
  const [view, setView] = useState<'structured' | 'immersive'>('immersive');
  const [editVisible, setEditVisible] = useState(false);
  const [editText, setEditText] = useState('');
  const [editEntryId, setEditEntryId] = useState('');
  const [editMemoryVisible, setEditMemoryVisible] = useState(false);
  const { mutate: updateEntry, isPending: isUpdating } = useUpdateMemoryEntry(id);
  const { mutate: deleteEntry } = useDeleteMemoryEntry(id);
  const { mutate: updateMemory, isPending: isSavingMemory } = useUpdateMemory();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.terracotta} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.notFound}>Memory not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>← Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const bgColors = FALLBACK_COLORS;
  const isCreator = event.createdByUserId === user?.id;

  const openEditPerspective = () => {
    const myEntry = event.entries?.find(e => e.authorId === user?.id);
    if (!myEntry) return;
    setEditEntryId(myEntry.id);
    setEditText(myEntry.text);
    setEditVisible(true);
  };

  const handleDeleteEntry = (entryId: string, authorLabel: string) => {
    Alert.alert(
      'Delete perspective?',
      `Remove ${authorLabel} perspective? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteEntry(entryId),
        },
      ]
    );
  };

  const handleSaveMemory = (payload: {
    title: string; date: string; location: string;
    visibility: VisibilityLevel; participantIds: string[];
  }) => {
    updateMemory(
      { id, ...payload },
      {
        onSuccess: () => {
          setEditMemoryVisible(false);
          Alert.alert('Saved', 'Memory updated.');
        },
        onError: () => Alert.alert('Error', 'Failed to update memory.'),
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Memories</Text>
        </TouchableOpacity>

        {/* View toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'structured' && styles.toggleBtnActive]}
            onPress={() => setView('structured')}
          >
            <Text style={[styles.toggleBtnText, view === 'structured' && styles.toggleBtnTextActive]}>
              Story
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'immersive' && styles.toggleBtnActive]}
            onPress={() => setView('immersive')}
          >
            <Text style={[styles.toggleBtnText, view === 'immersive' && styles.toggleBtnTextActive]}>
              Immersive
            </Text>
          </TouchableOpacity>
        </View>

        {/* Creator edit button — balanced with back btn width */}
        {isCreator ? (
          <TouchableOpacity onPress={() => setEditMemoryVisible(true)} style={styles.headerEditBtn}>
            <Text style={styles.headerEditBtnText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerEditPlaceholder} />
        )}
      </View>

      {/* Event title block */}
      <View style={styles.eventMeta}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventDetails}>
          {new Date(event.date).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric'
          })}
          {event.location ? `  ·  ${event.location}` : ''}
        </Text>
        {event.music && (
          <View style={styles.musicChip}>
            <Text style={styles.musicChipText}>
              ♪  {event.music.title} — {event.music.artist}
            </Text>
          </View>
        )}
        {/* Participant avatars */}
        <View style={styles.participants}>
          {event.participants?.slice(0, 6).map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.participantAvatar,
                { backgroundColor: p.avatarColour, marginLeft: i > 0 ? -8 : 0 }
              ]}
            >
              <Text style={styles.participantAvatarText}>
                {p.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          ))}
          {(event.participants?.length ?? 0) > 6 && (
            <View style={[styles.participantAvatar, { backgroundColor: Colors.tan, marginLeft: -8 }]}>
              <Text style={[styles.participantAvatarText, { color: Colors.textDark }]}>
                +{(event.participants?.length ?? 0) - 6}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {view === 'structured' ? (
          <StructuredView
            entries={event.entries ?? []}
            currentUserId={user?.id ?? ''}
            isCreator={isCreator}
            onDeleteEntry={handleDeleteEntry}
          />
        ) : (
          <ImmersiveView
            entries={event.entries ?? []}
            colors={bgColors}
          />
        )}
      </View>

      {/* Add / edit perspective — only in Story view */}
      {view === 'structured' && (() => {
        const myEntry = event.entries?.find(e => e.authorId === user?.id);
        return myEntry
          ? (
            <View style={styles.alreadyAdded}>
              <Text style={styles.alreadyAddedText}>You've added your perspective</Text>
              <TouchableOpacity onPress={openEditPerspective}>
                <Text style={styles.editLink}>Edit</Text>
              </TouchableOpacity>
            </View>
          )
          : <AddPerspective eventId={id} />;
      })()}

      {/* Edit perspective modal */}
      <Modal
        visible={editVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditVisible(false)}
      >
        <SafeAreaView style={styles.editModal} edges={['top', 'bottom']}>
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={() => setEditVisible(false)}>
              <Text style={styles.editCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.editTitle}>Edit perspective</Text>
            <TouchableOpacity
              onPress={() => {
                if (!editText.trim()) return;
                updateEntry(
                  { entryId: editEntryId, text: editText.trim() },
                  { onSuccess: () => setEditVisible(false) }
                );
              }}
              disabled={!editText.trim() || isUpdating}
            >
              <Text style={[styles.editSave, (!editText.trim() || isUpdating) && styles.editSaveDisabled]}>
                {isUpdating ? 'Saving…' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={80}
          >
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              maxLength={5000}
              textAlignVertical="top"
              placeholderTextColor={Colors.textLight}
            />
            <Text style={styles.editCharCount}>{editText.length} / 5000</Text>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Edit memory modal (creator only) */}
      {isCreator && editMemoryVisible && (
        <EditMemoryModal
          visible={editMemoryVisible}
          event={event}
          onClose={() => setEditMemoryVisible(false)}
          onSave={handleSaveMemory}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  notFound: {
    fontSize: Typography.body,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  backLink: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    marginTop: Spacing.md,
    fontFamily: Typography.fontFamily,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  backBtn: { paddingVertical: Spacing.sm, minWidth: 80 },
  backBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
  },
  toggleBtnActive: { backgroundColor: Colors.card },
  toggleBtnText: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  toggleBtnTextActive: { color: Colors.terracotta, fontWeight: '700' },
  headerEditBtn: { paddingVertical: Spacing.sm, minWidth: 80, alignItems: 'flex-end' },
  headerEditBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
  headerEditPlaceholder: { minWidth: 80 },

  // Event meta
  eventMeta: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  eventTitle: {
    fontSize: Typography.heading.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
  },
  musicChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    marginBottom: Spacing.sm,
  },
  musicChipText: {
    fontSize: 12,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  participants: { flexDirection: 'row', marginTop: 4 },
  participantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  participantAvatarText: { fontSize: 11, color: Colors.white, fontWeight: '600' },

  // Content
  content: { flex: 1 },

  // Structured view
  structuredScroll: { flex: 1 },
  structuredContent: {
    padding: Spacing.lg,
    paddingBottom: 120,
    gap: Spacing.md,
  },
  noEntries: { alignItems: 'center', paddingTop: 60 },
  noEntriesText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  noEntriesSub: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
    fontFamily: Typography.fontFamily,
  },
  entryCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    ...Shadows.card,
  },
  entryCardMe: { borderColor: Colors.terracotta + '44' },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  entryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryAvatarText: { fontSize: 13, color: Colors.white, fontWeight: '600' },
  entryAuthor: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  entryTime: { fontSize: 11, color: Colors.textLight },
  newBadge: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newBadgeText: { fontSize: 9, color: Colors.white, fontWeight: '700', letterSpacing: 0.8 },
  entryDeleteBtn: {
    marginLeft: 'auto' as any,
    padding: 2,
  },
  entryDeleteBtnText: {
    fontSize: 20,
    color: Colors.textLight,
    lineHeight: 22,
  },
  entryText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    lineHeight: 22,
  },

  // Immersive view
  immersive: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  immersiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  immersiveContent: {
    position: 'absolute',
    bottom: 80,
    left: Spacing.xl * 1.5,
    right: Spacing.xl * 1.5,
    alignItems: 'center',
  },
  immersiveAuthor: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.fontFamily,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.lg,
  },
  immersiveText: {
    fontSize: 22,
    fontFamily: Typography.fontFamily,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 34,
    fontStyle: 'italic',
  },
  immersiveDots: {
    position: 'absolute',
    bottom: Spacing.xl,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  immersiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  immersiveDotActive: {
    width: 20,
    backgroundColor: Colors.white,
  },
  immersiveEmpty: { alignItems: 'center' },
  immersiveEmptyText: {
    fontSize: Typography.body,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Typography.fontFamily,
  },

  // Add perspective
  addPerspective: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    gap: Spacing.sm,
  },
  addPerspectiveFocused: { borderTopColor: Colors.terracotta },
  perspectiveInput: {
    flex: 1,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    maxHeight: 100,
    paddingVertical: Spacing.sm,
  },
  sendBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sendBtnDisabled: { backgroundColor: Colors.tan },
  sendBtnText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },

  // Already added
  alreadyAdded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
  },
  alreadyAddedText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    fontStyle: 'italic',
  },
  editLink: {
    fontSize: 13,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },

  // Edit modal (shared by perspective + memory edit)
  editModal: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  editCancel: {
    fontSize: Typography.body,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  editTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  editSave: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
  editSaveDisabled: { opacity: 0.4 },
  editScroll: { flex: 1, padding: Spacing.lg },
  editInput: {
    flex: 1,
    padding: Spacing.lg,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    lineHeight: 24,
  },
  editCharCount: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'right',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },

  // Edit memory modal fields
  editSectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  editTextInput: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },

  // Visibility selector
  visibilityOption: {
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
  visibilityOptionActive: {
    borderColor: Colors.terracotta,
    backgroundColor: Colors.terracotta + '08',
  },
  visibilityRadio: {
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
  visibilityRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.terracotta,
  },
  visibilityLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  visibilityLabelActive: { color: Colors.terracotta },
  visibilityDesc: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  // Participant management
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  participantRowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantRowAvatarText: { fontSize: 13, color: Colors.white, fontWeight: '600' },
  participantRowName: {
    flex: 1,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  participantRemoveBtn: { padding: Spacing.xs },
  participantRemoveBtnText: {
    fontSize: 20,
    color: Colors.textLight,
    lineHeight: 22,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  searchResultAdd: {
    fontSize: 13,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
});
