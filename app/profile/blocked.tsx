import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { BlockedUser, getBlockedUsers, unblockUser } from '@/api/safety';

export default function BlockedPeopleScreen() {
  const [people, setPeople] = useState<BlockedUser[] | null>(null);

  const load = useCallback(() => {
    getBlockedUsers().then(setPeople).catch(() => { setPeople([]); Alert.alert('Error', 'Could not load blocked people.'); });
  }, []);
  useEffect(load, [load]);

  const handleUnblock = (p: BlockedUser) => {
    Alert.alert(
      `Unblock ${p.displayName}?`,
      'They will be able to find you and send you a connection request again. Your previous connection is not restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => unblockUser(p.id).then(load).catch(() => Alert.alert('Error', 'Could not unblock. Try again.')) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerBack}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked people</Text>
        <View style={{ width: 60 }} />
      </View>
      {people === null ? (
        <ActivityIndicator style={{ marginTop: Spacing.xl }} color={Colors.terracotta} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: Spacing.lg }}
          ListEmptyComponent={
            <Text style={styles.empty}>You haven't blocked anyone. You can block someone from their profile in your circle.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: item.avatarColour }]}>
                <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.name}>{item.displayName}</Text>
              <TouchableOpacity onPress={() => handleUnblock(item)} style={styles.unblockBtn}>
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.tan,
  },
  headerBack: { fontSize: Typography.body, color: Colors.terracotta, fontFamily: Typography.fontFamily },
  headerTitle: { fontSize: Typography.body, fontFamily: Typography.fontFamily, fontWeight: '700', color: Colors.textDark },
  empty: { fontSize: 14, color: Colors.textLight, fontFamily: Typography.fontFamily, textAlign: 'center', marginTop: Spacing.xl, lineHeight: 21 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: Colors.tan,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontWeight: '700', fontFamily: Typography.fontFamily },
  name: { flex: 1, fontSize: Typography.body, color: Colors.textDark, fontFamily: Typography.fontFamily },
  unblockBtn: { borderWidth: 0.5, borderColor: Colors.terracotta, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  unblockText: { color: Colors.terracotta, fontSize: 13, fontWeight: '600', fontFamily: Typography.fontFamily },
});
