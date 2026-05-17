import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const { width } = Dimensions.get('window');
const ONBOARDING_KEY = 'rootedin_seen_onboarding';

const SLIDES = [
  {
    key: 'welcome',
    symbol: '❧',
    title: 'You can only truly know 150 people',
    body: "Robin Dunbar, an Oxford anthropologist, discovered that our brains can maintain about 150 meaningful relationships. Not followers. Not connections. People you actually know.\n\nRooted In helps you make the most of every one of them.",
  },
  {
    key: 'circles',
    title: 'Your inner circles',
    symbol: '◎',
    steps: [
      { label: '5 people',   desc: 'Your closest — the ones you could call at 2am.' },
      { label: '15 people',  desc: 'Close friends and family you stay in regular contact with.' },
      { label: '50 people',  desc: 'Good friends you see a few times a year.' },
      { label: '150 people', desc: 'Your full active social network.' },
    ],
  },
  {
    key: 'promise',
    symbol: '♡',
    title: 'Private, honest, yours',
    body: "Rooted In is not a social network. There is no feed, no likes, no public profile. It is a private space for you to tend the relationships that matter — and nothing else.",
    highlights: ['No ads, ever', 'No public posts', 'No algorithm', 'You own your data'],
  },
];

async function markOnboardingSeen() {
  try { await SecureStore.setItemAsync(ONBOARDING_KEY, 'true'); } catch {}
}

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(idx);
  };

  const goNext = async () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      await markOnboardingSeen();
      router.replace('/auth');
    }
  };

  const skip = async () => {
    await markOnboardingSeen();
    router.replace('/auth');
  };

  const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={styles.slide}>
      <Text style={styles.symbol}>{item.symbol}</Text>
      <Text style={styles.slideTitle}>{item.title}</Text>

      {'body' in item && item.body && (
        <Text style={styles.body}>{item.body}</Text>
      )}
      {'steps' in item && item.steps && (
        <View style={styles.stepList}>
          {item.steps.map((step, i) => (
            <View key={step.label} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{i + 1}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
      {'highlights' in item && item.highlights && (
        <View style={styles.highlights}>
          {item.highlights.map((h) => (
            <View key={h} style={styles.highlight}>
              <Text style={styles.highlightText}>✓  {h}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity style={styles.skipBtn} onPress={skip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
          ))}
        </View>
        <TouchableOpacity style={styles.btn} onPress={goNext}>
          <Text style={styles.btnText}>
            {currentIndex === SLIDES.length - 1 ? 'Create account' : 'Continue'}
          </Text>
        </TouchableOpacity>
        {currentIndex === SLIDES.length - 1 && (
          <TouchableOpacity onPress={skip} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  skipBtn: { alignSelf: 'flex-end', padding: Spacing.lg },
  skipText: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily },

  slide: { width, paddingHorizontal: 36, paddingTop: Spacing.lg, flex: 1 },
  symbol: { fontSize: 44, color: Colors.terracotta, marginBottom: Spacing.lg },
  slideTitle: {
    fontSize: 22,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.lg,
    lineHeight: 30,
  },
  body: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 24,
  },

  stepList: { gap: Spacing.lg },
  step: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumberText: { fontSize: 13, color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },
  stepText: { flex: 1 },
  stepLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 19,
  },

  highlights: { gap: Spacing.sm, marginTop: Spacing.md },
  highlight: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 0.5,
    borderColor: Colors.tan,
  },
  highlightText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.sage,
    fontWeight: '600',
  },

  footer: { paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xl, gap: Spacing.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.tan },
  dotActive: { width: 20, backgroundColor: Colors.terracotta },
  btn: {
    backgroundColor: Colors.terracotta,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  btnText: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.white,
  },
  loginLink: { alignItems: 'center', paddingVertical: Spacing.xs },
  loginLinkText: { fontSize: 13, color: Colors.textLight, fontFamily: Typography.fontFamily },
});
