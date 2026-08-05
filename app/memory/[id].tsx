import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
  Dimensions, Modal, Image, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMemory, useAddMemoryEntry, useUpdateMemoryEntry,
  useDeleteMemoryEntry, useUpdateMemory, useConnectionSearch,
  useDeleteMedia, useUpdateMediaCaption, useUpdateMyMemoryVisibility,
  QueryKeys,
} from '@/api/hooks';
import { uploadMedia } from '@/api/upload';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { MemoryEntry, MemoryEvent, MemoryMediaItem, VisibilityLevel } from '@/types';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const { width, height } = Dimensions.get('window');

// ── Icons ──────────────────────────────────────────────
const IconCamera = ({ color, size = 24 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <Circle cx="12" cy="13" r="4"/>
  </Svg>
);

// ── Photo section (hero + strip) ──────────────────────
// Tapping a strip tile swaps that photo into the big spot up top (strip
// stays put, just re-highlights). Tapping the big photo opens the lightbox
// at whichever photo is currently selected.
const PhotoSection = ({
  photos,
  onPress,
}: {
  photos: string[];
  onPress: (index: number) => void;
}) => {
  const [selected, setSelected] = useState(0);

  // Reset to the first photo if the set of photos changes underneath us
  // (e.g. a new upload lands) so `selected` never points past the end.
  useEffect(() => {
    if (selected >= photos.length) setSelected(0);
  }, [photos.length]);

  return (
    <View style={styles.photoSection}>
      <TouchableOpacity onPress={() => onPress(selected)} activeOpacity={0.92}>
        <Image source={{ uri: photos[selected] }} style={styles.photoHero} resizeMode="cover" />
      </TouchableOpacity>
      {photos.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoStrip}
        >
          {photos.map((uri, i) => (
            <TouchableOpacity
              key={uri}
              onPress={() => setSelected(i)}
              activeOpacity={0.9}
            >
              <Image
                source={{ uri }}
                style={[styles.photoStripThumb, i === selected && styles.photoStripThumbActive]}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

// ── Lightbox ───────────────────────────────────────────
// Captions: added later via the pencil icon, never forced at upload time.
// Only the photo's uploader or the memory's creator can add/edit one —
// mirrors the delete-photo permission model.
const Lightbox = ({
  photos,
  mediaByUrl,
  currentUserId,
  isCreator,
  startIndex,
  visible,
  onClose,
  onSaveCaption,
}: {
  photos: string[];
  mediaByUrl: Record<string, MemoryMediaItem | undefined>;
  currentUserId: string;
  isCreator: boolean;
  startIndex: number;
  visible: boolean;
  onClose: () => void;
  onSaveCaption: (mediaId: string, caption: string) => void;
}) => {
  const [current, setCurrent] = useState(startIndex);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');

  useEffect(() => {
    if (visible) setCurrent(startIndex);
    setEditingCaption(false);
  }, [visible, startIndex]);

  const currentMedia = mediaByUrl[photos[current]];
  const canCaption = !!currentMedia && (isCreator || currentMedia.userId === currentUserId);

  const handleStartEdit = () => {
    setCaptionDraft(currentMedia?.caption ?? '');
    setEditingCaption(true);
  };

  const handleSaveCaption = () => {
    if (currentMedia) onSaveCaption(currentMedia.id, captionDraft.trim());
    setEditingCaption(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightboxBg}>
        <TouchableOpacity style={styles.lightboxClose} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.lightboxCloseText}>×</Text>
        </TouchableOpacity>

        <FlatList
          data={photos}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={current}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => {
            setCurrent(Math.round(e.nativeEvent.contentOffset.x / width));
            setEditingCaption(false);
          }}
          renderItem={({ item }) => (
            <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
              <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
            </View>
          )}
        />

        {photos.length > 1 && (
          <View style={styles.lightboxDots}>
            {photos.map((_, i) => (
              <View key={i} style={[styles.lightboxDot, i === current && styles.lightboxDotActive]} />
            ))}
          </View>
        )}

        {/* Caption — view, edit, or the pencil to add one */}
        {editingCaption ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.lightboxCaptionEditWrap}
          >
            <TextInput
              style={styles.lightboxCaptionInput}
              value={captionDraft}
              onChangeText={(t) => setCaptionDraft(t.slice(0, 150))}
              placeholder="Add a short caption…"
              placeholderTextColor={Colors.textLight}
              autoFocus
              multiline
            />
            <View style={styles.lightboxCaptionActions}>
              <TouchableOpacity onPress={() => setEditingCaption(false)}>
                <Text style={styles.lightboxCaptionCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveCaption}>
                <Text style={styles.lightboxCaptionSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.lightboxCaptionBar}>
            {currentMedia?.caption ? (
              <Text style={styles.lightboxCaptionText} numberOfLines={2}>{currentMedia.caption}</Text>
            ) : <View />}
            {canCaption && (
              <TouchableOpacity onPress={handleStartEdit} style={styles.lightboxPencilBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.lightboxPencilText}>✎</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
};

// ── Perspectives view ─────────────────────────────────
const PerspectivesView = ({
  entries,
  currentUserId,
  isCreator,
  onDeleteEntry,
}: {
  entries: MemoryEntry[];
  currentUserId: string;
  isCreator: boolean;
  onDeleteEntry: (entryId: string, authorName: string) => void;
}) => {
  if (entries.length === 0) {
    return (
      <View style={styles.noEntries}>
        <Text style={styles.noEntriesText}>No takes yet.</Text>
        <Text style={styles.noEntriesSub}>Be the first to write your memory.</Text>
      </View>
    );
  }

  return (
    <View style={styles.perspectivesContainer}>
      {entries.map((entry) => {
        const isMe = entry.authorId === currentUserId;
        const canDelete = isCreator || isMe;
        return (
          <View key={entry.id} style={[styles.entryCard, isMe && styles.entryCardMe]}>
            <View style={styles.entryHeader}>
              {entry.author?.avatarUrl ? (
                <Image source={{ uri: entry.author.avatarUrl }} style={styles.entryAvatar} />
              ) : (
                <View style={[styles.entryAvatar, { backgroundColor: entry.author?.avatarColour ?? Colors.terracotta }]}>
                  <Text style={styles.entryAvatarText}>
                    {entry.author?.displayName?.charAt(0).toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.entryAuthor}>{isMe ? 'You' : entry.author?.displayName}</Text>
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
            <Text style={styles.entryText}>{entry.text}</Text>
          </View>
        );
      })}
    </View>
  );
};

// ── Add perspective input ──────────────────────────────
const AddPerspective = ({
  eventId,
  onPickPhoto,
}: {
  eventId: string;
  onPickPhoto: () => void;
}) => {
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
        <TouchableOpacity onPress={onPickPhoto} style={styles.photoPickerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <IconCamera color={Colors.textLight} size={22} />
        </TouchableOpacity>
        <TextInput
          style={styles.perspectiveInput}
          placeholder="Add your take…"
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

// ── Your visibility modal (any contributor — independent of the creator) ──
// Sets memory_author_visibility for the current user: who beyond the tagged
// participants can see the perspective and photos *they* add to this
// memory. Separate from "Edit memory details" (creator-only, event default).
const MyVisibilityModal = ({
  visible,
  currentVisibility,
  isSaving,
  onClose,
  onSave,
}: {
  visible: boolean;
  currentVisibility: VisibilityLevel;
  isSaving: boolean;
  onClose: () => void;
  onSave: (visibility: VisibilityLevel) => void;
}) => {
  const [visibility, setVisibility] = useState<VisibilityLevel>(currentVisibility);

  // Reset local selection whenever the modal is (re)opened, so it reflects
  // the latest saved value rather than a stale choice from last time.
  useEffect(() => {
    if (visible) setVisibility(currentVisibility);
  }, [visible, currentVisibility]);

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
          <Text style={styles.editTitle}>Your visibility</Text>
          <TouchableOpacity onPress={() => onSave(visibility)} disabled={isSaving}>
            <Text style={[styles.editSave, isSaving && styles.editSaveDisabled]}>
              {isSaving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.editScroll}>
          <Text style={styles.myVisibilityIntro}>
            Who — beyond the people tagged in this memory — can see the perspective
            and photos you add here. Everyone tagged always sees everything, no
            matter what you choose.
          </Text>

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
  const qc = useQueryClient();
  const [menuVisible, setMenuVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editText, setEditText] = useState('');
  const [editEntryId, setEditEntryId] = useState('');
  const [editMemoryVisible, setEditMemoryVisible] = useState(false);
  const [myVisibilityModalVisible, setMyVisibilityModalVisible] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to add photos to this memory.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
      allowsMultipleSelection: true,
    });
    if (result.canceled || result.assets.length === 0) return;

    const uris = result.assets.map(a => a.uri);

    // Show immediately as local URIs, then upload and swap in S3 URLs
    setLocalPhotos(prev => [...prev, ...uris]);
    if (!event) return;
    try {
      const s3Urls = await Promise.all(
        uris.map(uri => uploadMedia(uri, 'image/jpeg', 'memories', 'memory', event.id))
      );
      // Replace local URIs with S3 URLs
      setLocalPhotos(prev => {
        const withoutLocal = prev.filter(u => !uris.includes(u));
        return [...withoutLocal, ...s3Urls];
      });
    } catch (err) {
      console.warn('Photo upload failed:', err);
      // Local URIs remain visible for the session — non-fatal
    }
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  };
  // Mark other people's entries as viewed when memory loads
  // Then invalidate the memories list so the ring/dot clears on the landing screen
  useEffect(() => {
    if (!event) return;
    api.post(`/memories/${id}/view`)
      .then(() => qc.invalidateQueries({ queryKey: QueryKeys.memories }))
      .catch(() => {});
  }, [event?.id]);

  const { mutate: updateEntry, isPending: isUpdating } = useUpdateMemoryEntry(id);
  const { mutate: deleteEntry } = useDeleteMemoryEntry(id);
  const { mutate: updateMemory, isPending: isSavingMemory } = useUpdateMemory();
  const { mutate: deleteMedia } = useDeleteMedia(id);
  const { mutate: updateMediaCaption } = useUpdateMediaCaption(id);
  const { mutate: updateMyVisibility, isPending: isSavingMyVisibility } = useUpdateMyMemoryVisibility(id);

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

  const isCreator = event.createdByUserId === user?.id;

  // Can this viewer add a take / photo? Being able to SEE a memory (per
  // visibility layer) is separate from being a tagged participant — only
  // participants (or the creator) can actually contribute to it. Without
  // this check, non-participants who can view a memory would still see the
  // compose box even though the server rejects their attempt to post.
  const canContribute = isCreator || (event.participantIds ?? []).includes(user?.id ?? '');

  // S3 photos from the API, plus any locally-picked photos not yet in the API response
  const s3Media = event.media ?? [];
  const allPhotos = [...new Set([...s3Media, ...localPhotos])];

  // Photos this specific user uploaded — shown (with delete) in their own
  // "Edit your take" strip. Deletion permission itself is enforced
  // server-side (uploader or creator), but the strip only ever shows your
  // own uploads, matching "photos you already added" to your take.
  const myMediaItems = (event.mediaItems ?? []).filter(m => m.userId === user?.id);

  // URL → media item lookup, so the Lightbox can show/edit a caption for
  // whichever photo is currently on screen. Locally-picked photos not yet
  // confirmed by the server won't have an entry here — captioning is
  // unavailable for those until the upload completes.
  const mediaByUrl: Record<string, MemoryMediaItem | undefined> = {};
  for (const m of event.mediaItems ?? []) mediaByUrl[m.url] = m;

  const handleSaveCaption = (mediaId: string, caption: string) => {
    updateMediaCaption(
      { mediaId, caption },
      { onError: () => Alert.alert('Error', 'Could not save the caption. Please try again.') }
    );
  };

  const handleDeleteMedia = (mediaId: string) => {
    Alert.alert(
      'Remove photo?',
      'This will remove it from the memory for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMedia(mediaId) },
      ]
    );
  };

  const openEditPerspective = () => {
    const myEntry = event.entries?.find(e => e.authorId === user?.id);
    if (!myEntry) return;
    setEditEntryId(myEntry.id);
    setEditText(myEntry.text);
    setEditVisible(true);
  };

  const handleDeleteEntry = (entryId: string, authorLabel: string) => {
    Alert.alert(
      'Delete your take?',
      `Remove ${authorLabel}'s take? This cannot be undone.`,
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

  const handleSaveMyVisibility = (visibility: VisibilityLevel) => {
    updateMyVisibility(visibility, {
      onSuccess: () => setMyVisibilityModalVisible(false),
      onError: () => Alert.alert('Error', 'Could not update your visibility. Please try again.'),
    });
  };

  const myEntry = event.entries?.find(e => e.authorId === user?.id);
  const myVisibility = event.myVisibility ?? event.visibility;
  const myVisibilityLabel = VISIBILITY_OPTIONS.find(o => o.key === myVisibility)?.label ?? 'Only us';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Memories</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.headerMenuBtn}>
          <Text style={styles.headerMenuBtnText}>•••</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable body: meta + photos + perspectives */}
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Event meta */}
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

          {/* Your own visibility for this memory — independent of the
              creator's default, and of who created it. */}
          {canContribute && (
            <TouchableOpacity
              style={styles.myVisibilityPill}
              onPress={() => setMyVisibilityModalVisible(true)}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.myVisibilityPillText}>
                Your visibility: {myVisibilityLabel} ›
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Photos */}
        {allPhotos.length > 0 && (
          <PhotoSection photos={allPhotos} onPress={openLightbox} />
        )}

        {/* Perspectives */}
        <PerspectivesView
          entries={event.entries ?? []}
          currentUserId={user?.id ?? ''}
          isCreator={isCreator}
          onDeleteEntry={handleDeleteEntry}
        />
      </ScrollView>

      {/* Bottom action bar — only shown to people who can actually contribute.
          Being able to view a memory (per visibility layer) doesn't mean
          you're a tagged participant; showing the compose box to someone
          who isn't would look like it works and then just fail. */}
      {canContribute && (
        myEntry ? (
          <View style={styles.alreadyAdded}>
            <Text style={styles.alreadyAddedText}>You've added your take</Text>
            <TouchableOpacity
              onPress={pickPhoto}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.cameraBtn}
            >
              <IconCamera color={Colors.terracotta} size={24} />
            </TouchableOpacity>
          </View>
        ) : (
          <AddPerspective eventId={id} onPickPhoto={pickPhoto} />
        )
      )}

      {/* Action sheet menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        />
        <View style={styles.menuSheet}>
          {isCreator && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); setEditMemoryVisible(true); }}
            >
              <Text style={styles.menuItemText}>Edit memory details</Text>
            </TouchableOpacity>
          )}
          {myEntry && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuVisible(false); openEditPerspective(); }}
            >
              <Text style={styles.menuItemText}>Edit your take</Text>
            </TouchableOpacity>
          )}
          {isCreator && (
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={() => {
                setMenuVisible(false);
                Alert.alert(
                  'Delete memory?',
                  'This will permanently remove the memory and all perspectives. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => router.back() },
                  ]
                );
              }}
            >
              <Text style={styles.menuItemDestructiveText}>Delete memory</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.menuItem, styles.menuCancel]}
            onPress={() => setMenuVisible(false)}
          >
            <Text style={styles.menuCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Edit your take modal */}
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
            <Text style={styles.editTitle}>Edit your take</Text>
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

            {/* Photo strip */}
            <View style={styles.editPhotoRow}>
              <TouchableOpacity onPress={pickPhoto} style={styles.editPhotoPickerBtn}>
                <Text style={styles.editPhotoPickerIcon}>📷</Text>
                <Text style={styles.editPhotoPickerLabel}>Add photos</Text>
              </TouchableOpacity>
              {myMediaItems.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editPhotoStrip}>
                  {myMediaItems.map((item) => (
                    <View key={item.id} style={styles.editPhotoThumbWrap}>
                      <TouchableOpacity
                        onPress={() => openLightbox(allPhotos.indexOf(item.url))}
                        activeOpacity={0.85}
                      >
                        <Image source={{ uri: item.url }} style={styles.editPhotoStripThumb} resizeMode="cover" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleDeleteMedia(item.id)}
                        style={styles.editPhotoDeleteBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.editPhotoDeleteBtnText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
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

      {/* Your visibility modal — any contributor, not just the creator */}
      {canContribute && myVisibilityModalVisible && (
        <MyVisibilityModal
          visible={myVisibilityModalVisible}
          currentVisibility={myVisibility}
          isSaving={isSavingMyVisibility}
          onClose={() => setMyVisibilityModalVisible(false)}
          onSave={handleSaveMyVisibility}
        />
      )}

      {/* Lightbox */}
      <Lightbox
        photos={allPhotos}
        mediaByUrl={mediaByUrl}
        currentUserId={user?.id ?? ''}
        isCreator={isCreator}
        startIndex={lightboxIndex}
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
        onSaveCaption={handleSaveCaption}
      />
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
  headerMenuBtn: { paddingVertical: Spacing.sm, paddingLeft: Spacing.lg },
  headerMenuBtnText: {
    fontSize: 18,
    color: Colors.terracotta,
    letterSpacing: 2,
    lineHeight: 22,
  },

  // Action sheet
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  menuSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingBottom: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  menuItem: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  menuItemText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    textAlign: 'center',
  },
  menuItemDestructive: { borderBottomColor: Colors.tan },
  menuItemDestructiveText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: '#C0392B',
    textAlign: 'center',
  },
  menuCancel: { marginTop: Spacing.sm, borderBottomWidth: 0 },
  menuCancelText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    fontWeight: '700',
    textAlign: 'center',
  },

  // Main scroll
  mainScroll: { flex: 1 },
  mainScrollContent: { paddingBottom: 120 },

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
  myVisibilityPill: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.tan,
  },
  myVisibilityPillText: {
    fontSize: 12,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  myVisibilityIntro: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 19,
    marginBottom: Spacing.md,
  },

  // Photo section
  photoSection: {
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  photoHero: {
    width: '100%',
    height: 240,
  },
  photoStrip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  photoStripThumb: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  photoStripThumbActive: {
    borderColor: Colors.terracotta,
  },

  // Perspectives container
  perspectivesContainer: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  noEntries: { alignItems: 'center', paddingTop: 60, paddingBottom: Spacing.xl },
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

  // Lightbox
  lightboxBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 56,
    right: Spacing.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxCloseText: {
    fontSize: 32,
    color: Colors.white,
    lineHeight: 36,
  },
  lightboxImage: {
    width: width,
    height: height * 0.75,
  },
  lightboxDots: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  lightboxDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  lightboxDotActive: {
    width: 20,
    backgroundColor: Colors.white,
  },

  // Lightbox caption
  lightboxCaptionBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 80,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  lightboxCaptionText: {
    flex: 1,
    fontSize: 13,
    color: Colors.white,
    fontFamily: Typography.fontFamily,
    lineHeight: 18,
  },
  lightboxPencilBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxPencilText: { fontSize: 15, color: Colors.white },
  lightboxCaptionEditWrap: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: 72,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  lightboxCaptionInput: {
    color: Colors.white,
    fontSize: 14,
    fontFamily: Typography.fontFamily,
    minHeight: 40,
    maxHeight: 80,
  },
  lightboxCaptionActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  lightboxCaptionCancel: { color: Colors.tan, fontSize: 13, fontFamily: Typography.fontFamily },
  lightboxCaptionSave: { color: Colors.white, fontWeight: '700', fontSize: 13, fontFamily: Typography.fontFamily },

  // Photo picker button
  photoPickerBtn: {
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.xs,
    justifyContent: 'center',
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
    flex: 1,
  },
  cameraBtn: {
    paddingLeft: Spacing.md,
  },

  // Edit modal photo strip
  editPhotoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  editPhotoPickerBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.tan,
    borderStyle: 'dashed',
    backgroundColor: Colors.card,
    gap: 2,
    flexShrink: 0,
  },
  editPhotoPickerIcon: { fontSize: 20 },
  editPhotoPickerLabel: {
    fontSize: 9,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
  },
  editPhotoStrip: { flex: 1 },
  editPhotoStripThumb: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.md,
    marginRight: Spacing.sm,
  },
  editPhotoThumbWrap: {
    marginRight: Spacing.sm,
  },
  editPhotoDeleteBtn: {
    position: 'absolute',
    top: -6,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  editPhotoDeleteBtnText: {
    color: Colors.white,
    fontSize: 13,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
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
