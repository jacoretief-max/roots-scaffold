import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '@/constants/theme';

// Simple SVG-style tab icons using Text (replace with icon library later)
const TabIcon = ({
  symbol,
  label,
  focused,
}: {
  symbol: string;
  label: string;
  focused: boolean;
}) => (
  <View style={styles.tabItem}>
    <Text style={[styles.tabSymbol, focused && styles.tabSymbolActive]}>
      {symbol}
    </Text>
    <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
      {label}
    </Text>
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
        name="index"         // Memories — home screen
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="⌂" label="Memories" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="globe"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="◎" label="Globe" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="♡" label="Circle" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="connect"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="+" label="Connect" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon symbol="◈" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 72,
    backgroundColor: Colors.card,
    borderTopWidth: 0.5,
    borderTopColor: Colors.tan,
    paddingTop: 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabSymbol: {
    fontSize: 20,
    color: Colors.textLight,
  },
  tabSymbolActive: {
    color: Colors.terracotta,
  },
  tabLabel: {
    fontSize: Typography.nav,
    fontFamily: Typography.fontFamily,
    color: Colors.textLight,
  },
  tabLabelActive: {
    color: Colors.terracotta,
  },
});
