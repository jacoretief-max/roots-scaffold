import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Modal, Switch, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useConnection, useLogContact, useRemoveConnection, useUpdateConnection, useContactEvents, useCreateContactEvent } from '@/api/hooks';
import { Colors, Typography, Spacing, BorderRadius, DunbarLayers, Shadows } from '@/constants/theme';
import { DunbarLayer } from '@/types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// ── Edit connection modal ──────────────────────────────
const EditModal = ({
  visible,
  connection,
  onClose,
  onSave,
}: {
  visible: boolean;
  connection: any;
  onClose: () => void;
  onSave: (payload: { layer: DunbarLayer; relation: string; contactFrequency: number }) => void;
}) => {
  const [layer, setLayer] = useState<DunbarLayer>(connection?.layer ?? 'active');
  const [relation, setRelation] = useState(connection?.relation ?? '');
  const [contactFrequency, setContactFrequency] = useState(connection?.contactFrequency ?? 14);

  const FREQUENCY_OPTIONS = [
    { label: 'Every few days', days: 3 },
    { label: 'Weekly', days: 7 },
    { label: 'Fortnightly', days: 14 },
    { label: 'Monthly', days: 30 },
    { label: 'Every few months', days: 90 },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit connection</Text>
          <TouchableOpacity onPress={() => onSave({ layer, relation, contactFrequency })}>
            <Text style={styles.modalSave}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
          {/* Layer */}
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

          {/* Contact frequency */}
          <Text style={styles.sectionLabel}>How often to stay in touch?</Text>
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

// ── Event helpers ───────────────────────────────────────
const getEventColor = (type: string) => {
  switch (type) {
    case 'calendar':  return '#534AB7';
    case 'call':      return Colors.sage;
    case 'whatsapp':  return '#25D366';
    case 'memory':    return Colors.terracotta;
    case 'manual':    return Colors.textLight;
    default:          return Colors.tan;
  }
};

const getEventEmoji = (type: string) => {
  switch (type) {
    case 'calendar':  return '📅';
    case 'call':      return '📞';
    case 'whatsapp':  return '💬';
    case 'memory':    return '📖';
    case 'manual':    return '✓';
    default:          return '·';
  }
};

// ── Person screen ──────────────────────────────────────
export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: connection, isLoading } = useConnection(id);
  const { mutate: logContact, isPending: isLogging } = useLogContact();
  const { mutate: removeConnection, isPending: isRemoving } = useRemoveConnection();
  const { mutate: updateConnection, isPending: isUpdating } = useUpdateConnection();
  const { data: contactEvents = [], isLoading: eventsLoading } = useContactEvents(id);
  const { mutate: createContactEvent } = useCreateContactEvent(id);
  const [editVisible, setEditVisible] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingEventType, setPendingEventType] = useState<string>('manual');

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.terracotta} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (!connection) {
    return (
      <SafeAreaView style={styles.container}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.notFound}>Connection not found.</Text>
      </SafeAreaView>
    );
  }

  const displayName = connection.connectedUser?.displayName ?? 'Unknown';
  const avatarColour = connection.connectedUser?.avatarColour ?? Colors.terracotta;
  const city = connection.connectedUser?.city ?? '';
  const score = connection.score ?? 80;
  const layer = DunbarLayers.find(l => l.key === connection.layer);

  const scoreColor =
    score > 75 ? Colors.scoreHealthy
    : score > 50 ? Colors.scoreMedium
    : Colors.scoreLow;

  const lastContactText = () => {
    if (!connection.lastContactAt) return 'No contact logged yet';
    return dayjs(connection.lastContactAt).fromNow();
  };

  const handleLogContact = () => {
    setPendingEventType('manual');
    setShowNoteInput(true);
  };

  const handleSaveContactEvent = () => {
    createContactEvent(
      {
        type: pendingEventType,
        title: pendingEventType === 'manual' ? 'Contact logged' : 'Calendar event',
        date: new Date().toISOString(),
        note: noteText.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowNoteInput(false);
          setNoteText('');
          Alert.alert('Logged', `Contact with ${displayName} logged.`);
        },
      }
    );
  };

  const handleRemove = () => {
    Alert.alert(
      `Remove ${displayName}?`,
      'They will be removed from your circle. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeConnection(id, {
              onSuccess: () => router.back(),
              onError: () => Alert.alert('Error', 'Failed to remove connection.'),
            });
          },
        },
      ]
    );
  };

  const handleSaveEdit = (payload: { layer: DunbarLayer; relation: string; contactFrequency: number }) => {
    updateConnection(
      { id, ...payload },
      {
        onSuccess: () => {
          setEditVisible(false);
          Alert.alert('Saved', 'Connection updated.');
        },
        onError: () => Alert.alert('Error', 'Failed to update connection.'),
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => setEditVisible(true)}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: avatarColour }]}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {city ? <Text style={styles.city}>{city}</Text> : null}

          {/* Layer + relation badges */}
          <View style={styles.badges}>
            {layer && (
              <View style={styles.layerBadge}>
                <Text style={styles.layerBadgeText}>{layer.label}</Text>
              </View>
            )}
            {connection.relation && (
              <View style={styles.relationBadge}>
                <Text style={styles.relationBadgeText}>{connection.relation}</Text>
              </View>
            )}
          </View>

          {connection.since && (
            <Text style={styles.since}>Since {connection.since}</Text>
          )}
        </View>

        {/* Connection health */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connection health</Text>

          <View style={styles.healthCard}>
            {/* Score */}
            <View style={styles.scoreRow}>
              <Text style={styles.scoreLabel}>Score</Text>
              <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
            </View>
            <View style={styles.scoreBarBg}>
              <View style={[
                styles.scoreBarFill,
                { width: `${score}%` as any, backgroundColor: scoreColor }
              ]} />
            </View>

            <View style={styles.divider} />

            {/* Last contact */}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Last contact</Text>
              <Text style={styles.metaValue}>{lastContactText()}</Text>
            </View>

            {/* Contact frequency */}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Target frequency</Text>
              <Text style={styles.metaValue}>
                Every {connection.contactFrequency ?? 14} days
              </Text>
            </View>
          </View>
        </View>

        {/* AI nudge */}
        {connection.nudge && (
          <View style={styles.section}>
            <View style={styles.nudgeCard}>
              <Text style={styles.nudgeLabel}>Nudge</Text>
              <Text style={styles.nudgeText}>{connection.nudge}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>

          {showNoteInput ? (
            <View style={styles.noteCapture}>
              <Text style={styles.noteCaptureTitle}>Add a note (optional)</Text>
              <TextInput
                style={styles.noteInput}
                value={noteText}
                onChangeText={setNoteText}
                placeholder="What did you talk about? How are they doing?"
                placeholderTextColor={Colors.textLight}
                multiline
                autoFocus
                maxLength={500}
              />
              <View style={styles.noteActions}>
                <TouchableOpacity
                  style={styles.noteSaveBtn}
                  onPress={handleSaveContactEvent}
                >
                  <Text style={styles.noteSaveBtnText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.noteSkipBtn}
                  onPress={() => {
                    setNoteText('');
                    handleSaveContactEvent();
                  }}
                >
                  <Text style={styles.noteSkipBtnText}>Skip note</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.notePhaseHint}>Voice notes coming in Phase 4</Text>
            </View>
          ) : (
            <>
              {/* Always in touch toggle */}
              <View style={styles.alwaysInTouchRow}>
                <View style={styles.alwaysInTouchInfo}>
                  <Text style={styles.alwaysInTouchLabel}>Always in touch</Text>
                  <Text style={styles.alwaysInTouchDesc}>
                    We live together or speak daily — skip contact tracking
                  </Text>
                </View>
                <Switch
                  value={(connection as any).alwaysInTouch ?? false}
                  onValueChange={(value) => {
                    updateConnection({ id, alwaysInTouch: value } as any, {
                      onSuccess: () => {},
                    });
                  }}
                  trackColor={{ false: Colors.tan, true: Colors.terracotta }}
                  thumbColor={Colors.white}
                />
              </View>

              {/* Log contact */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleLogContact}
                disabled={isLogging}
                activeOpacity={0.85}
              >
                {isLogging
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.actionBtnText}>Log contact</Text>
                }
              </TouchableOpacity>

              {/* Edit connection */}
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={() => setEditVisible(true)}
                activeOpacity={0.85}
              >
                <Text style={styles.actionBtnSecondaryText}>Edit layer & frequency</Text>
              </TouchableOpacity>

              {/* Remove */}
              <TouchableOpacity
                style={styles.actionBtnDestructive}
                onPress={handleRemove}
                disabled={isRemoving}
                activeOpacity={0.85}
              >
                {isRemoving
                  ? <ActivityIndicator color={Colors.scoreLow} />
                  : <Text style={styles.actionBtnDestructiveText}>Remove from circle</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Contact timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent touchpoints</Text>
          {eventsLoading && (
            <ActivityIndicator color={Colors.terracotta} />
          )}
          {!eventsLoading && contactEvents.length === 0 && (
            <View style={styles.timelineEmpty}>
              <Text style={styles.timelineEmptyText}>
                No interactions logged yet. Use "Log contact" after calls, or sync your calendar.
              </Text>
            </View>
          )}
          {contactEvents.slice(0, 5).map((event, index) => (
            <View key={event.id} style={styles.timelineItem}>
              {index < Math.min(contactEvents.length, 5) - 1 && (
                <View style={styles.timelineLine} />
              )}
              <View style={[styles.timelineIcon, { backgroundColor: getEventColor(event.type) }]}>
                <Text style={styles.timelineIconText}>{getEventEmoji(event.type)}</Text>
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{event.title}</Text>
                <Text style={styles.timelineDate}>
                  {new Date(event.date).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </Text>
                {event.note && (
                  <Text style={styles.timelineNote}>{event.note}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Edit modal */}
      <EditModal
        visible={editVisible}
        connection={connection}
        onClose={() => setEditVisible(false)}
        onSave={handleSaveEdit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  backBtn: { paddingVertical: Spacing.xs },
  backBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
  },
  editBtn: { paddingVertical: Spacing.xs },
  editBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
  notFound: {
    fontSize: Typography.body,
    color: Colors.textLight,
    textAlign: 'center',
    marginTop: 40,
    fontFamily: Typography.fontFamily,
  },

  // Profile card
  profileCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.tan,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: { fontSize: 32, color: Colors.white, fontWeight: '700' },
  displayName: {
    fontSize: Typography.heading.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 4,
  },
  city: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  layerBadge: {
    backgroundColor: Colors.terracotta + '18',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: Colors.terracotta + '44',
  },
  layerBadgeText: {
    fontSize: 12,
    color: Colors.terracotta,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  relationBadge: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  relationBadgeText: {
    fontSize: 12,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
  },
  since: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
  },

  // Health card
  healthCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    ...Shadows.card,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  scoreLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    fontWeight: '700',
  },
  scoreNum: {
    fontSize: 24,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
  },
  scoreBarBg: {
    height: 6,
    backgroundColor: Colors.tan,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  divider: {
    height: 0.5,
    backgroundColor: Colors.tan,
    marginVertical: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  metaLabel: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  metaValue: {
    fontSize: 13,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },

  // Nudge
  nudgeCard: {
    backgroundColor: Colors.terracotta + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.terracotta,
  },
  nudgeLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: 4,
  },
  nudgeText: {
    fontSize: Typography.body,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
    fontStyle: 'italic',
    lineHeight: 22,
  },

  // Action buttons
  actionBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  actionBtnText: {
    fontSize: Typography.body,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.sm,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  actionBtnSecondaryText: {
    fontSize: Typography.body,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
  },
  actionBtnDestructive: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.scoreLow + '66',
  },
  actionBtnDestructiveText: {
    fontSize: Typography.body,
    color: Colors.scoreLow,
    fontFamily: Typography.fontFamily,
  },

  // Coming soon
  comingSoonCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    alignItems: 'center',
    gap: Spacing.md,
  },
  comingSoonText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    lineHeight: 19,
  },
  comingSoonBadge: {
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
  },
  comingSoonBadgeText: {
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

  // Layer options in modal
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

  // Chips in modal
  sectionLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
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
  noteCapture: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 0.5,
    borderColor: Colors.terracotta + '44',
    gap: Spacing.md,
  },
  noteCaptureTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  noteInput: {
    backgroundColor: Colors.background,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  noteSaveBtn: {
    flex: 1,
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  noteSaveBtnText: {
    fontSize: Typography.body,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },
  noteSkipBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  noteSkipBtnText: {
    fontSize: Typography.body,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
  notePhaseHint: {
    fontSize: 11,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  timelineEmpty: {
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  timelineEmptyText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    lineHeight: 19,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
    position: 'relative',
  },
  timelineLine: {
    position: 'absolute',
    left: 15,
    top: 30,
    bottom: -Spacing.md,
    width: 1,
    backgroundColor: Colors.tan,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timelineIconText: {
    fontSize: 14,
  },
  timelineContent: { flex: 1, paddingTop: 4 },
  timelineTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
  },
  timelineDate: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
  },
  timelineNote: {
    fontSize: 13,
    color: Colors.textDark,
    fontFamily: Typography.fontFamily,
    marginTop: Spacing.xs,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  alwaysInTouchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    gap: Spacing.md,
  },
  alwaysInTouchInfo: { flex: 1 },
  alwaysInTouchLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '600',
    color: Colors.textDark,
  },
  alwaysInTouchDesc: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginTop: 2,
    lineHeight: 17,
  },
});
