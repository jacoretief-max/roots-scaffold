import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Platform, Animated,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useCreateMemory } from '@/api/hooks';
import { useConnectionSearch } from '@/api/hooks';
import { useAuthStore } from '@/store/authStore';
import { Colors, Typography, Spacing, BorderRadius, VisibilityLevels } from '@/constants/theme';
import { VisibilityLevel } from '@/types';

const TOTAL_STEPS = 4;

// ── Step indicator ─────────────────────────────────────
const StepIndicator = ({ current }: { current: number }) => (
  <View style={styles.stepIndicator}>
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
      <View key={i} style={styles.stepRow}>
        <View style={[
          styles.stepDot,
          i < current && styles.stepDotDone,
          i === current && styles.stepDotActive,
        ]} />
        {i < TOTAL_STEPS - 1 && (
          <View style={[styles.stepLine, i < current && styles.stepLineDone]} />
        )}
      </View>
    ))}
  </View>
);

// ── Participant pill ───────────────────────────────────
interface Participant {
  id?: string;           // real user ID if linked
  name: string;
  avatarColour: string;
  isRootsUser: boolean;
}

const ParticipantPill = ({
  participant,
  onRemove,
}: {
  participant: Participant;
  onRemove: () => void;
}) => (
  <View style={[styles.pill, participant.isRootsUser && styles.pillLinked]}>
    <View style={[styles.pillAvatar, { backgroundColor: participant.avatarColour }]}>
      <Text style={styles.pillAvatarText}>
        {participant.name.charAt(0).toUpperCase()}
      </Text>
    </View>
    <Text style={styles.pillName}>{participant.name}</Text>
    {participant.isRootsUser && <Text style={styles.pillLinkedDot}>●</Text>}
    <TouchableOpacity onPress={onRemove} style={styles.pillRemove}>
      <Text style={styles.pillRemoveText}>×</Text>
    </TouchableOpacity>
  </View>
);

// ── Step 1: Title, date, location ──────────────────────
const Step1 = ({
  title, setTitle,
  date, setDate,
  location, setLocation,
}: {
  title: string; setTitle: (v: string) => void;
  date: Date; setDate: (v: Date) => void;
  location: string; setLocation: (v: string) => void;
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <ScrollView style={styles.stepContent} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>What happened?</Text>
      <Text style={styles.stepSub}>Give this memory a name, date and place.</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Memory title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Mark's 40th birthday"
          placeholderTextColor={Colors.textLight}
          maxLength={100}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={{ color: Colors.textDark, fontFamily: Typography.fontFamily }}>
            {dayjs(date).format('D MMMM YYYY')}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, d) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (d) setDate(d);
            }}
          />
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Cape Town"
          placeholderTextColor={Colors.textLight}
          maxLength={100}
        />
      </View>
    </ScrollView>
  );
};

// ── Step 2: Who was there ──────────────────────────────
const Step2 = ({
  participants,
  setParticipants,
}: {
  participants: Participant[];
  setParticipants: (v: Participant[]) => void;
}) => {
  const [query, setQuery] = useState('');
  const { data: suggestions = [], isLoading } = useConnectionSearch(query);

  const AVATAR_COLORS = [
    '#C45A3A', '#4A7A52', '#4A6A7A', '#7A4A5C',
    '#7A5C3A', '#534AB7', '#1D9E75', '#BA7517',
  ];

  const addFromSuggestion = (suggestion: any) => {
    if (participants.find(p => p.id === suggestion.id)) return;
    setParticipants([...participants, {
      id: suggestion.id,
      name: suggestion.displayName,
      avatarColour: suggestion.avatarColour,
      isRootsUser: true,
    }]);
    setQuery('');
  };

  const addFreeText = () => {
    if (!query.trim()) return;
    if (participants.find(p => p.name.toLowerCase() === query.toLowerCase())) return;
    setParticipants([...participants, {
      name: query.trim(),
      avatarColour: AVATAR_COLORS[participants.length % AVATAR_COLORS.length],
      isRootsUser: false,
    }]);
    setQuery('');
  };

  const remove = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  return (
    <KeyboardAvoidingView
      style={styles.stepContent}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.stepTitle}>Who was there?</Text>
      <Text style={styles.stepSub}>
        Add people from your circle or type any name.
      </Text>

      {/* Pills */}
      {participants.length > 0 && (
        <View style={styles.pillsRow}>
          {participants.map((p, i) => (
            <ParticipantPill key={i} participant={p} onRemove={() => remove(i)} />
          ))}
        </View>
      )}

      {/* Search input */}
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Type a name…"
          placeholderTextColor={Colors.textLight}
          onSubmitEditing={addFreeText}
          returnKeyType="done"
        />
        {query.trim().length > 0 && (
          <TouchableOpacity style={styles.addBtn} onPress={addFreeText}>
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Suggestions from circle */}
      {isLoading && <ActivityIndicator color={Colors.terracotta} style={{ marginTop: 8 }} />}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          <Text style={styles.suggestionsLabel}>From your circle</Text>
          {suggestions.map((s: any) => (
            <TouchableOpacity
              key={s.id}
              style={styles.suggestion}
              onPress={() => addFromSuggestion(s)}
            >
              <View style={[styles.suggestionAvatar, { backgroundColor: s.avatarColour }]}>
                <Text style={styles.suggestionAvatarText}>
                  {s.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.suggestionInfo}>
                <Text style={styles.suggestionName}>{s.displayName}</Text>
                <Text style={styles.suggestionMeta}>{s.relation} · {s.city}</Text>
              </View>
              <View style={styles.rootsBadge}>
                <Text style={styles.rootsBadgeText}>Roots</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <Text style={[styles.legendDot, { color: Colors.terracotta }]}>●</Text>
          <Text style={styles.legendText}>Connected on Roots</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={[styles.legendDot, { color: Colors.tan }]}>●</Text>
          <Text style={styles.legendText}>Not on Roots yet</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

// ── Step 3: Write your memory ──────────────────────────
const Step3 = ({
  text, setText,
}: {
  text: string; setText: (v: string) => void;
}) => {
  const scrollRef = useRef<ScrollView>(null);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={120}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.stepContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.stepTitle}>Your perspective</Text>
        <Text style={styles.stepSub}>Write what this moment meant to you.</Text>

        <TextInput
          style={styles.memoryInput}
          value={text}
          onChangeText={setText}
          placeholder="What do you remember about this moment? How did it feel?"
          placeholderTextColor={Colors.textLight}
          multiline
          maxLength={5000}
          textAlignVertical="top"
          autoFocus
          blurOnSubmit={false}
          scrollEnabled={false}
        />
        <Text style={styles.charCount}>{text.length} / 5000</Text>

        {/* Extra padding so content is never hidden behind keyboard */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── Step 4: Visibility ─────────────────────────────────
const Step4 = ({
  visibility, setVisibility,
  participants,
}: {
  visibility: VisibilityLevel;
  setVisibility: (v: VisibilityLevel) => void;
  participants: Participant[];
}) => (
  <ScrollView style={styles.stepContent}>
    <Text style={styles.stepTitle}>Who can see this?</Text>
    <Text style={styles.stepSub}>
      Tagged people always have access. Choose who else can see this memory.
    </Text>

    {VisibilityLevels.map((level) => (
      <TouchableOpacity
        key={level.key}
        style={[
          styles.visibilityOption,
          visibility === level.key && styles.visibilityOptionActive,
        ]}
        onPress={() => setVisibility(level.key as VisibilityLevel)}
      >
        <View style={styles.visibilityRadio}>
          {visibility === level.key && <View style={styles.visibilityRadioInner} />}
        </View>
        <View style={styles.visibilityText}>
          <Text style={[
            styles.visibilityLabel,
            visibility === level.key && styles.visibilityLabelActive,
          ]}>
            {level.label}
          </Text>
          <Text style={styles.visibilityDesc}>{level.description}</Text>
        </View>
      </TouchableOpacity>
    ))}

    {/* Preview */}
    <View style={styles.visibilityPreview}>
      <Text style={styles.visibilityPreviewText}>
        {participants.length > 0
          ? `${participants.map(p => p.name).join(', ')} will always be notified.`
          : 'Tagged people will always be notified.'}
      </Text>
    </View>
  </ScrollView>
);

// ── New Memory wizard ──────────────────────────────────
export default function NewMemoryScreen() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date());
  const [location, setLocation] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [memoryText, setMemoryText] = useState('');
  const [visibility, setVisibility] = useState<VisibilityLevel>('intimate');
  const { user } = useAuthStore();
  const { mutate: createMemory, isPending } = useCreateMemory();

  const canProceed = () => {
    if (step === 0) return title.trim().length > 0;
    if (step === 2) return memoryText.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const participantIds = [
      user?.id,
      ...participants.filter(p => p.isRootsUser && p.id).map(p => p.id!),
    ].filter(Boolean) as string[];

    createMemory(
      {
        title: title.trim(),
        date: dayjs(date).format('YYYY-MM-DD'),
        location: location.trim() || undefined,
        visibility,
        participantIds,
        memoryText: memoryText.trim() || undefined,
      },
      {
        onSuccess: (event) => {
          router.replace(`/memory/${event.id}`);
        },
      }
    );
  };

  const stepLabels = ['Details', 'People', 'Memory', 'Visibility'];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => step === 0 ? router.back() : setStep(step - 1)}
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>
            {step === 0 ? 'Cancel' : '← Back'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{stepLabels[step]}</Text>
        <Text style={styles.headerStep}>{step + 1} of {TOTAL_STEPS}</Text>
      </View>

      {/* Step indicator */}
      <StepIndicator current={step} />

      {/* Step content */}
      <View style={styles.content}>
        {step === 0 && (
          <Step1
            title={title} setTitle={setTitle}
            date={date} setDate={setDate}
            location={location} setLocation={setLocation}
          />
        )}
        {step === 1 && (
          <Step2
            participants={participants}
            setParticipants={setParticipants}
          />
        )}
        {step === 2 && (
          <Step3 text={memoryText} setText={setMemoryText} />
        )}
        {step === 3 && (
          <Step4
            visibility={visibility}
            setVisibility={setVisibility}
            participants={participants}
          />
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, (!canProceed() || isPending) && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={!canProceed() || isPending}
        >
          {isPending
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.nextBtnText}>
                {step === TOTAL_STEPS - 1 ? 'Save memory' : 'Continue'}
              </Text>
          }
        </TouchableOpacity>

        {step === 1 && (
          <TouchableOpacity onPress={() => setStep(step + 1)} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip — just me</Text>
          </TouchableOpacity>
        )}
      </View>
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
  backBtn: { minWidth: 60 },
  backBtnText: {
    fontSize: Typography.body,
    color: Colors.terracotta,
    fontFamily: Typography.fontFamily,
  },
  headerTitle: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  headerStep: {
    fontSize: 13,
    color: Colors.textLight,
    minWidth: 60,
    textAlign: 'right',
    fontFamily: Typography.fontFamily,
  },

  // Step indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.tan,
  },
  stepDotActive: { backgroundColor: Colors.terracotta, width: 12, height: 12, borderRadius: 6 },
  stepDotDone: { backgroundColor: Colors.sage },
  stepLine: { width: 40, height: 1, backgroundColor: Colors.tan, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: Colors.sage },

  content: { flex: 1 },
  stepContent: { flex: 1, padding: Spacing.lg },
  stepTitle: {
    fontSize: Typography.heading.md,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.xs,
  },
  stepSub: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    marginBottom: Spacing.xl,
    lineHeight: 19,
  },

  // Fields
  field: { marginBottom: Spacing.lg },
  fieldLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    justifyContent: 'center',
  },

  // People step
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.pill,
    paddingRight: Spacing.sm,
    gap: 6,
    overflow: 'hidden',
  },
  pillLinked: { borderColor: Colors.terracotta + '66' },
  pillAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillAvatarText: { fontSize: 12, color: Colors.white, fontWeight: '600' },
  pillName: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
  },
  pillLinkedDot: { fontSize: 8, color: Colors.terracotta },
  pillRemove: { padding: 2 },
  pillRemoveText: { fontSize: 16, color: Colors.textLight, lineHeight: 18 },

  searchRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  addBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  addBtnText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
    fontFamily: Typography.fontFamily,
  },

  suggestions: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  suggestionsLabel: {
    fontSize: Typography.label,
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: Typography.fontFamily,
    padding: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: Colors.tan,
  },
  suggestionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionAvatarText: { fontSize: 14, color: Colors.white, fontWeight: '600' },
  suggestionInfo: { flex: 1 },
  suggestionName: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
  },
  suggestionMeta: { fontSize: 12, color: Colors.textLight },
  rootsBadge: {
    backgroundColor: Colors.terracotta + '18',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: Colors.terracotta + '44',
  },
  rootsBadgeText: { fontSize: 10, color: Colors.terracotta, fontWeight: '700' },

  legend: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { fontSize: 10 },
  legendText: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily },

  // Memory text step
  memoryInput: {
    backgroundColor: Colors.card,
    borderWidth: 0.5,
    borderColor: Colors.tan,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textDark,
    minHeight: 200,
    lineHeight: 24,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'right',
    marginTop: Spacing.xs,
    fontFamily: Typography.fontFamily,
  },

  // Visibility step
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
  },
  visibilityRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.terracotta,
  },
  visibilityText: { flex: 1 },
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
  visibilityPreview: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.tan,
    borderRadius: BorderRadius.sm,
  },
  visibilityPreviewText: {
    fontSize: 12,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Footer
  footer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.tan,
  },
  nextBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  nextBtnDisabled: { backgroundColor: Colors.tan },
  nextBtnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },
  skipBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  skipBtnText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },
});
