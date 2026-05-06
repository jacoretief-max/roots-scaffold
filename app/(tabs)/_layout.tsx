import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { useMemories } from '@/api/hooks';

// ── Icon components ────────────────────────────────────
const IconBook = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
    <Path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
  </Svg>
);

const IconHeart = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </Svg>
);

const IconProfile = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
    <Circle cx={12} cy={7} r={4}/>
  </Svg>
);

// ── Tab icon with active dot ───────────────────────────
const TabIcon = ({
  Icon,
  focused,
  notify = false,
}: {
  Icon: ({ color }: { color: string }) => JSX.Element;
  focused: boolean;
  notify?: boolean;
}) => (
  <View style={styles.tabItem}>
    <View style={styles.iconWrapper}>
      <Icon color={focused ? Colors.terracotta : Colors.textLight} />
      {notify && <View style={styles.notifyDot} />}
    </View>
    <View style={[styles.dot, focused && styles.dotActive]} />
  </View>
);

export default function TabLayout() {
  const { data: memories } = useMemories();
  const hasUnread = (memories ?? []).some(m => (m.newEntryCount ?? 0) > 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={IconBook} focused={focused} notify={hasUnread} />
          ),
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={IconHeart} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={IconProfile} focused={focused} />
          ),
        }}
      />
      {/* Hidden routes — functionality absorbed into Circle tab */}
      <Tabs.Screen name="globe" options={{ href: null }} />
      <Tabs.Screen name="connect" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 64,
    backgroundColor: Colors.card,
    borderTopWidth: 0.5,
    borderTopColor: Colors.tan,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrapper: {
    position: 'relative',
  },
  notifyDot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.terracotta,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  dotActive: {
    backgroundColor: Colors.terracotta,
  },
});
