import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'welcome',
    symbol: '❧',
    title: 'Welcome to Roots',
    body: "Roots is built on one belief: the people you love are the most important thing in your life. Research consistently shows that people with strong, meaningful connections are healthier, happier, and live longer.",
  },
  {
    key: 'process',
    title: 'How it works',
    symbol: '◎',
    steps: [
      { label: 'Find your people', desc: 'We help you identify the connections that matter most, guided by Dunbar\'s relationship science.' },
      { label: 'Build your history', desc: 'Recreate the moments you\'ve shared, year by year, at your own pace.' },
      { label: 'Stay connected', desc: 'Roots gently helps you tend those relationships so no one drifts away.' },
    ],
  },
  {
    key: 'promise',
    symbol: '♡',
    title: 'Our promise to you',
    body: "You control every step. Nothing is shared without your explicit permission. No public posts. No ads. No algorithm. This is for you and the people you love.",
    highlights: ['Private by design', 'No advertising', 'No algorithm', 'You own your data'],
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(idx);
  };

  const goNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      router.replace('/(tabs)');
    }
  };

  const skip = () => router.replace('/(tabs)');

  const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={styles.slide}>
      <Text style={styles.symbol}>{item.symbol}</Text>
      <Text style={styles.slideTitle}>{item.title}</Text>

      {/* Slide 1 & 3 — body text */}
      {'body' in item && item.body && (
        <Text style={styles.body}>{item.body}</Text>
      )}

      {/* Slide 2 — step list */}
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

      {/* Slide 3 — highlights */}
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
      {/* Skip */}
      <TouchableOpacity style={styles.skipBtn} onPress={skip}>
        <Text style={styles.skipText}>Skip intro</Text>
      </TouchableOpacity>

      {/* Slides */}
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

      {/* Dots + CTA */}
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === currentIndex && styles.dotActive]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.btn} onPress={goNext}>
          <Text style={styles.btnText}>
            {currentIndex === SLIDES.length - 1 ? 'Get started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  skipBtn: {
    alignSelf: 'flex-end',
    padding: Spacing.lg,
  },
  skipText: {
    fontSize: 13,
    color: Colors.textLight,
    fontFamily: Typography.fontFamily,
  },

  slide: {
    width,
    paddingHorizontal: Spacing.xl * 1.5,
    paddingTop: Spacing.xl,
    flex: 1,
  },
  symbol: {
    fontSize: 44,
    color: Colors.terracotta,
    marginBottom: Spacing.lg,
  },
  slideTitle: {
    fontSize: Typography.heading.lg,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: Spacing.lg,
    lineHeight: 32,
  },
  body: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 24,
  },

  // Step list (slide 2)
  stepList: { gap: Spacing.lg },
  step: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  stepNumberText: { fontSize: 13, color: Colors.white, fontWeight: '700' },
  stepText: { flex: 1 },
  stepLabel: {
    fontSize: Typography.body,
    fontFamily: Typography.fontFamily,
    fontWeight: '700',
    color: Colors.textDark,
    marginBottom: 3,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
    lineHeight: 19,
  },

  // Highlights (slide 3)
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

  // Footer
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.tan,
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.terracotta,
  },
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
});
