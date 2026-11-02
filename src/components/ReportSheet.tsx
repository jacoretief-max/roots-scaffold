import { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, ScrollView, Linking,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { REPORT_REASONS, ReportReason, ReportTarget, reportContent } from '@/api/safety';

const NOUN: Record<ReportTarget, string> = { photo: 'photo', memory: 'memory', entry: 'perspective', user: 'person' };

// Bottom sheet for reporting a photo, memory, perspective or person.
// After a report the content is hidden for the reporter (server-side);
// `onReported` lets the caller refresh.
export default function ReportSheet({
  visible, targetType, targetId, onClose, onReported,
}: {
  visible: boolean;
  targetType: ReportTarget;
  targetId: string | null;
  onClose: () => void;
  onReported?: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (visible) { setReason(null); setDetails(''); } }, [visible]);

  const submit = async () => {
    if (!reason || !targetId) return;
    setSending(true);
    try {
      await reportContent(targetType, targetId, reason, details.trim() || undefined);
      onClose();
      onReported?.();
      Alert.alert(
        'Thank you for reporting',
        reason === 'child_safety'
          ? 'We have hidden this content and will review it urgently. If a child is in immediate danger, contact your local emergency services.'
          : `We'll review this ${NOUN[targetType]}. You won't see it any more.`
      );
    } catch (err: any) {
      Alert.alert('Could not send report', err?.response?.data?.error ?? 'Please try again, or email info@rooikatlabs.com.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Report this {NOUN[targetType]}</Text>
            <Text style={styles.sub}>Your report is confidential. What's wrong?</Text>
            {REPORT_REASONS.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[styles.option, reason === r.key && styles.optionActive]}
                onPress={() => setReason(r.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: reason === r.key }}
              >
                <Text style={[styles.optionText, reason === r.key && styles.optionTextActive]}>{r.label}</Text>
                {r.hint ? <Text style={styles.optionHint}>{r.hint}</Text> : null}
              </TouchableOpacity>
            ))}
            {reason && (
              <TextInput
                style={styles.details}
                value={details}
                onChangeText={(t) => setDetails(t.slice(0, 1000))}
                placeholder="Anything else we should know? (optional)"
                placeholderTextColor={Colors.textLight}
                multiline
              />
            )}
            <TouchableOpacity
              style={[styles.submit, (!reason || sending) && styles.submitDisabled]}
              onPress={submit}
              disabled={!reason || sending}
            >
              {sending ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.submitText}>Send report</Text>}
            </TouchableOpacity>
            {reason === 'child_safety' && (
              <TouchableOpacity onPress={() => Linking.openURL('https://report.cybertip.org/')}>
                <Text style={styles.link}>You can also report directly to NCMEC's CyberTipline →</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancel} onPress={onClose} disabled={sending}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: Spacing.lg, maxHeight: '85%',
  },
  title: { fontSize: Typography.body + 2, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  sub: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily, marginTop: 4, marginBottom: Spacing.md },
  option: {
    borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm,
  },
  optionActive: { borderColor: Colors.terracotta, borderWidth: 1.5 },
  optionText: { fontSize: Typography.body, color: Colors.textDark, fontFamily: Typography.fontFamily },
  optionTextActive: { color: Colors.terracotta, fontWeight: '600' },
  optionHint: { fontSize: 12, color: Colors.textLight, fontFamily: Typography.fontFamily, marginTop: 2 },
  details: {
    borderWidth: 0.5, borderColor: Colors.tan, borderRadius: BorderRadius.md, backgroundColor: Colors.card,
    minHeight: 70, padding: Spacing.md, fontSize: 14, color: Colors.textDark, fontFamily: Typography.fontFamily,
    textAlignVertical: 'top', marginTop: Spacing.xs,
  },
  submit: {
    backgroundColor: Colors.terracotta, borderRadius: BorderRadius.md, paddingVertical: Spacing.md,
    alignItems: 'center', marginTop: Spacing.md,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { color: Colors.white, fontSize: Typography.body, fontWeight: '700', fontFamily: Typography.fontFamily },
  link: { color: Colors.terracottaDark, fontSize: 13, textAlign: 'center', marginTop: Spacing.md, fontFamily: Typography.fontFamily },
  cancel: { alignItems: 'center', paddingVertical: Spacing.md },
  cancelText: { color: Colors.textLight, fontSize: Typography.body, fontFamily: Typography.fontFamily },
});
