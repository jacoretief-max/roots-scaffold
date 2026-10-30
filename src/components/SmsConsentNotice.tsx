import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import {
  SMS_CONSENT_AGREE, SMS_RATES_NOTICE, LEGAL_LINK_LABEL, LEGAL_URL,
} from '@/constants/smsConsent';

// Required disclosure shown wherever a user requests an SMS code.
// With `checked`/`onToggle` it renders as an explicit opt-in checkbox;
// without them it's a notice (tapping "Send code" below it is the consent).
export default function SmsConsentNotice({
  checked, onToggle,
}: { checked?: boolean; onToggle?: () => void }) {
  const isCheckbox = typeof onToggle === 'function';

  const body = (
    <Text style={styles.text}>
      {isCheckbox ? SMS_CONSENT_AGREE : 'We\'ll text a one-time security code to this number.'}{' '}
      {SMS_RATES_NOTICE}{' '}
      <Text style={styles.link} onPress={() => Linking.openURL(LEGAL_URL)}>
        {LEGAL_LINK_LABEL}
      </Text>
    </Text>
  );

  if (!isCheckbox) return <View style={styles.row}>{body}</View>;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!checked }}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked && <Text style={styles.tick}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.xs },
  box: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
    borderColor: Colors.terracotta, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  boxChecked: { backgroundColor: Colors.terracotta },
  tick: { color: Colors.white, fontSize: 13, fontWeight: '700', lineHeight: 15 },
  text: { fontSize: 12, lineHeight: 18, color: Colors.textLight, fontFamily: Typography.fontFamily },
  link: { color: Colors.terracottaDark, textDecorationLine: 'underline' },
});
