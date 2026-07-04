import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FriendActivity, User } from '../types';
import { getFriendHoods, getUser } from '../services/dbService';
import { AddFriend } from '../components/AddFriend';
import {
  generateMockFriendActivities,
  formatActivityText,
  getTimeSince,
  activityEmoji,
} from '../utils/socialUtils';
import { CARD_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';

// ---------------------------------------------------------------------------
// Props & local types
// ---------------------------------------------------------------------------

export interface FriendsScreenProps {
  currentUid: string;
  currentUser: User;
  onBack: () => void;
  onViewFriendHood: (friendUid: string) => void;
}

interface FriendEntry {
  uid: string;
  username: string;
  hoodCount: number;
}

// ---------------------------------------------------------------------------
// FriendsScreen
// ---------------------------------------------------------------------------

export function FriendsScreen({
  currentUid,
  currentUser,
  onBack,
  onViewFriendHood,
}: FriendsScreenProps) {
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [activities, setActivities] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [friendUids, setFriendUids] = useState<string[]>(currentUser.friends);

  const loadFriends = useCallback(async (uids: string[]) => {
    setLoading(true);
    try {
      const results = await Promise.all(
        uids.map(async (uid) => {
          const data = await getFriendHoods(uid);
          if (!data) return null;
          return { uid, username: data.username, hoodCount: Object.keys(data.hoods).length };
        }),
      );
      const valid = results.filter((r): r is FriendEntry => r !== null);
      setFriends(valid);
      setActivities(
        generateMockFriendActivities(
          valid.map((f) => ({ uid: f.uid, username: f.username })),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFriends(friendUids);
  }, [friendUids, loadFriends]);

  // After AddFriend succeeds, re-read the user document to get the updated
  // friends array (AddFriend calls addFriend internally, which updates the mock DB).
  const handleFriendAdded = useCallback(async () => {
    const updated = await getUser(currentUid);
    if (updated) {
      setFriendUids(updated.friends);
    }
  }, [currentUid]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF6F0' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(234,227,218,0.6)',
          backgroundColor: '#FFFFFF',
          gap: 12,
        }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={HIT_SLOP_MD}
          style={({ pressed }) => [
            pressScale(pressed),
            { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
          ]}
        >
          <Text style={{ color: '#FF8E53', fontWeight: '700', fontSize: 18 }}>←</Text>
        </Pressable>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#2C2A29' }}>Friends</Text>
          <Text style={{ fontSize: 12, color: '#706B67', marginTop: 1 }}>
            {loading ? '…' : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'}`}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      >
        {/* ── Add Friend ──────────────────────────────────────────────────── */}
        <View
          style={[
            CARD_SHADOW,
            { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 28 },
          ]}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2A29', marginBottom: 14 }}>
            Add a Friend
          </Text>
          <AddFriend currentUid={currentUid} onFriendAdded={handleFriendAdded} />
        </View>

        {/* ── Friends list ─────────────────────────────────────────────────── */}
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C2A29', marginBottom: 14 }}>
          Your Friends
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 28, alignItems: 'center' }}>
            <ActivityIndicator color="#FF8E53" />
            <Text style={{ fontSize: 12, color: '#706B67', marginTop: 8 }}>
              Loading friends…
            </Text>
          </View>
        ) : friends.length === 0 ? (
          <View
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 32,
                alignItems: 'center',
                marginBottom: 28,
                borderWidth: 1.5,
                borderColor: 'rgba(255,142,83,0.3)',
                borderStyle: 'dashed',
              },
            ]}
          >
            <Text style={{ fontSize: 36, marginBottom: 12 }}>👥</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2A29' }}>
              No friends yet
            </Text>
            <Text
              style={{ fontSize: 12, color: '#706B67', marginTop: 6, textAlign: 'center', lineHeight: 18 }}
            >
              Add a friend by entering their User ID above.{'\n'}
              Share cat sightings and visit each other's Hoods!
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: 28 }}>
            {friends.map((friend) => (
              <FriendCard
                key={friend.uid}
                friend={friend}
                onVisitHood={() => onViewFriendHood(friend.uid)}
              />
            ))}
          </View>
        )}

        {/* ── Activity feed ────────────────────────────────────────────────── */}
        {!loading && activities.length > 0 && (
          <>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C2A29', marginBottom: 14 }}>
              Recent Activity
            </Text>
            {activities.map((activity) => (
              <ActivityCard key={activity.activity_id} activity={activity} />
            ))}
          </>
        )}

        {!loading && friends.length > 0 && activities.length === 0 && (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#706B67' }}>
              Your friends have been quiet lately. 🐾
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// FriendCard
// ---------------------------------------------------------------------------

function FriendCard({
  friend,
  onVisitHood,
}: {
  friend: FriendEntry;
  onVisitHood: () => void;
}) {
  return (
    <View
      style={[
        CARD_SHADOW,
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          padding: 14,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
        },
      ]}
    >
      {/* Avatar */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#FFE8DC',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Text style={{ fontSize: 26 }}>🐱</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#2C2A29' }}>
          {friend.username}
        </Text>
        <Text style={{ fontSize: 12, color: '#706B67', marginTop: 2 }}>
          {friend.hoodCount} {friend.hoodCount === 1 ? 'Hood' : 'Hoods'}
        </Text>
      </View>

      {/* Visit Hood button */}
      <Pressable
        onPress={onVisitHood}
        style={({ pressed }) => [
          pressScale(pressed, 0.94),
          {
            backgroundColor: '#FFE8DC',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 9,
            minHeight: 36,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#E67035' }}>Visit 🏡</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ActivityCard
// ---------------------------------------------------------------------------

function ActivityCard({ activity }: { activity: FriendActivity }) {
  return (
    <View
      style={[
        CARD_SHADOW,
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: 14,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
        },
      ]}
    >
      {/* Type emoji bubble */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#FAF6F0',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text style={{ fontSize: 20 }}>{activityEmoji(activity.type)}</Text>
      </View>

      {/* Description */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: '#2C2A29', lineHeight: 18 }}>
          <Text style={{ fontWeight: '700' }}>{activity.username}</Text>
          {' '}{formatActivityText(activity)}
        </Text>
        <Text style={{ fontSize: 11, color: '#706B67', marginTop: 4 }}>
          {getTimeSince(activity.timestamp_seconds)}
        </Text>
      </View>
    </View>
  );
}
