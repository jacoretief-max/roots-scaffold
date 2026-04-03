import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import Svg, { Path, Circle, Line } from 'react-native-svg';

// ── Icon components ────────────────────────────────────
const IconBook = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/>
    <Path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
  </Svg>
);

const IconGlobe = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={10}/>
    <Line x1={2} y1={12} x2={22} y2={12}/>
    <Path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
  </Svg>
);

const IconHeart = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>
  </Svg>
);

const IconSearch = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={11} cy={11} r={8}/>
    <Line x1={21} y1={21} x2={16.65} y2={16.65}/>
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
}: {
  Icon: ({ color }: { color: string }) => JSX.Element;
  focused: boolean;
}) => (
  <View style={styles.tabItem}>
    <Icon color={focused ? Colors.terracotta : Colors.textLight} />
    <View style={[styles.dot, focused && styles.dotActive]} />
  </View>
);

export default function TabLayout() {
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
            <TabIcon Icon={IconBook} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="globe"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={IconGlobe} focused={focused} />
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
        name="connect"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon Icon={IconSearch} focused={focused} />
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
