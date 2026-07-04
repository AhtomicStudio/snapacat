import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCats } from '../services/dbService';
import { getSpriteTemplateColors } from '../utils/colorExtractor';
import { SPRITE_LIBRARY } from '../utils/spriteLibrary';
import { Bouncy } from '../components/Bouncy';
import { CARD_SHADOW, BUTTON_SHADOW } from '../utils/styles';
import type { Cat, ScrapbookEntry, User, UserProgression } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HomeScreenProps {
  user: User;
  onOpenCatalog: () => void;
  onLogSpotting: () => void;
  onOpenHoods: () => void;
  onOpenFriends: () => void;
  onViewScrapbook: (cat: Cat) => void;
  /** Open the global Shop screen. */
  onOpenShop?: () => void;
  /** Current user's PawPoints progression for balance display. */
  progression?: UserProgression;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function greeting(): { label: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { label: 'Good morning', emoji: '☀️' };
  if (h < 18) return { label: 'Good afternoon', emoji: '🌤️' };
  return { label: 'Good evening', emoji: '🌙' };
}

type RecentSighting = { cat: Cat; entry: ScrapbookEntry };

function findLatestSighting(cats: Cat[]): RecentSighting | null {
  let best: RecentSighting | null = null;
  for (const cat of cats) {
    for (const entry of cat.scrapbook) {
      const t = entry.timestamp?.seconds ?? 0;
      const bestT = best?.entry.timestamp?.seconds ?? -1;
      if (t >= bestT) best = { cat, entry };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function StatChip({
  emoji, value, label, onPress,
}: {
  emoji: string; value: string; label: string; onPress?: () => void;
}) {
  const inner = (
    <View
      style={[
        CARD_SHADOW,
        {
          flex: 1,
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          paddingVertical: 12,
          paddingHorizontal: 4,
          alignItems: 'center',
        },
      ]}
    >
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
      <Text className="text-xl font-bold text-text-primary font-display" style={{ marginTop: 2 }}>
        {value}
      </Text>
      <Text className="text-xs text-text-secondary font-sans" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (onPress) {
    return (
      <Bouncy onPress={onPress} scaleTo={0.93} containerStyle={{ flex: 1 }}>
        {inner}
      </Bouncy>
    );
  }
  return inner;
}


// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function HomeScreen({
  user,
  onOpenCatalog,
  onLogSpotting,
  onOpenHoods,
  onOpenFriends,
  onViewScrapbook,
  onOpenShop,
  progression,
}: HomeScreenProps) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await getCats(user.uid);
        if (active) setCats(data);
      } catch (err) {
        console.error('Failed to load cats for Home:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user.uid]);

  const { label: greetLabel, emoji: greetEmoji } = useMemo(greeting, []);

  const spotted = useMemo(() => cats.filter((c) => c.scrapbook.length > 0).length, [cats]);
  const fieldNotes = useMemo(
    () => cats.reduce((sum, c) => sum + c.scrapbook.length, 0),
    [cats],
  );
  const hoodCount = Object.keys(user.hoods).length;
  const friendCount = user.friends.length;

  // Track unique sprite types discovered — the real collection metric (out of 20 possible)
  const uniqueTypesDiscovered = useMemo(
    () => new Set(cats.map((c) => c.sprite_template_id)).size,
    [cats],
  );
  const progress = uniqueTypesDiscovered / SPRITE_LIBRARY.length;

  // Recent cats for the "Recently Spotted" strip
  const recentCats = useMemo(
    () =>
      [...cats]
        .filter((c) => c.scrapbook.length > 0)
        .sort((a, b) => {
          const aTime = Math.max(...a.scrapbook.map((e) => e.timestamp?.seconds ?? 0));
          const bTime = Math.max(...b.scrapbook.map((e) => e.timestamp?.seconds ?? 0));
          return bTime - aTime;
        })
        .slice(0, 6),
    [cats],
  );

  const recent = useMemo(() => findLatestSighting(cats), [cats]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setCats(await getCats(user.uid));
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [user.uid]);

  // Animate progress bar from 0 → current value on first load and when it changes
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading) {
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 900,
        delay: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [loading, progress]); // eslint-disable-line react-hooks/exhaustive-deps
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF8E53" colors={['#FF8E53']} />
        }
      >
        {/* ---------------------------------------------------------------- */}
        {/* Greeting row                                                      */}
        {/* ---------------------------------------------------------------- */}
        <View className="flex-row items-center justify-between mb-lg">
          <View className="flex-1">
            <Text className="text-sm text-text-secondary font-sans">
              {greetLabel} {greetEmoji}
            </Text>
            <Text className="text-title font-bold text-text-primary font-display" numberOfLines={1}>
              {user.username}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {/* Daily streak chip — only once a real streak is going */}
            {(progression?.streak_count ?? 0) >= 2 && (
              <View
                style={{
                  backgroundColor: '#FFE8DC',
                  borderRadius: 99,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Text style={{ fontSize: 12 }}>🔥</Text>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#E67035' }}>
                  {progression!.streak_count}
                </Text>
              </View>
            )}

            {/* PawPoints balance pill */}
            {progression !== undefined && (
              <View
                style={[
                  CARD_SHADOW,
                  {
                    backgroundColor: '#FF8E53',
                    borderRadius: 99,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  },
                ]}
              >
                <Text style={{ fontSize: 13 }}>🐾</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                  {progression.paw_points}
                </Text>
              </View>
            )}

            {/* Shop shortcut (visible when Shop is wired up) */}
            {onOpenShop && (
              <Bouncy
                onPress={onOpenShop}
                scaleTo={0.9}
                style={[CARD_SHADOW, {
                  width: 42, height: 42, borderRadius: 21,
                  backgroundColor: '#EDE9FE',
                  alignItems: 'center', justifyContent: 'center',
                }]}
              >
                <Text style={{ fontSize: 20 }}>🛍</Text>
              </Bouncy>
            )}

            {/* Avatar bubble */}
            <View
              className="items-center justify-center"
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFE8DC' }}
            >
              <Text style={{ fontSize: 28 }}>🐱</Text>
            </View>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Hero card                                                         */}
        {/* ---------------------------------------------------------------- */}
        <View
          style={[
            BUTTON_SHADOW,
            {
              backgroundColor: '#FF8E53',
              borderRadius: 28,
              padding: 22,
              overflow: 'hidden',
              marginBottom: 24,
            },
          ]}
        >
          {/* Soft accent blobs for warm depth (no gradient lib needed) */}
          <View
            style={{
              position: 'absolute',
              top: -36,
              right: -28,
              width: 130,
              height: 130,
              borderRadius: 65,
              backgroundColor: '#FFAAA6',
              opacity: 0.5,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -44,
              left: -30,
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: '#FFE8DC',
              opacity: 0.22,
            }}
          />

          <Text style={{ fontSize: 40 }}>🐾</Text>
          <Text className="font-bold font-display" style={{ color: '#FFFFFF', fontSize: 22, marginTop: 6 }}>
            Spot. Collect. Cozy up.
          </Text>
          <Text className="font-sans" style={{ color: '#FFFFFF', opacity: 0.92, fontSize: 13, marginTop: 4 }}>
            {spotted > 0
              ? `You've met ${spotted} neighborhood cat${spotted === 1 ? '' : 's'} so far.`
              : 'Your Cat-a-log is waiting for its first friend.'}
          </Text>

          {/* Collection progress bar */}
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                height: 10,
                borderRadius: 5,
                backgroundColor: 'rgba(255,255,255,0.32)',
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  height: 10,
                  width: progressWidth,
                  borderRadius: 5,
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>
            <Text className="font-sans" style={{ color: '#FFFFFF', opacity: 0.92, fontSize: 12, marginTop: 6 }}>
              {uniqueTypesDiscovered} of {SPRITE_LIBRARY.length} types discovered
            </Text>
          </View>

          {/* Primary CTA */}
          <Bouncy
            onPress={onLogSpotting}
            scaleTo={0.94}
            style={{
              marginTop: 18,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 18 }}>📸</Text>
            <Text className="font-bold font-display" style={{ color: '#E67035', fontSize: 16 }}>
              Log a Sighting
            </Text>
          </Bouncy>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Stat strip — tappable                                             */}
        {/* ---------------------------------------------------------------- */}
        <View className="flex-row gap-sm mb-xl">
          <StatChip emoji="🐱" value={loading ? '–' : `${spotted}`} label="Spotted"    onPress={onOpenCatalog} />
          <StatChip emoji="📓" value={loading ? '–' : `${fieldNotes}`} label="Notes"   onPress={onOpenCatalog} />
          <StatChip emoji="🏡" value={`${hoodCount}`}  label="Hoods"   onPress={onOpenHoods} />
          <StatChip emoji="👥" value={`${friendCount}`} label="Friends" onPress={onOpenFriends} />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Recently Spotted strip                                            */}
        {/* ---------------------------------------------------------------- */}
        <View className="flex-row items-center justify-between mb-md">
          <Text className="text-lg font-bold text-text-primary font-display">
            Recently Spotted
          </Text>
          <Bouncy onPress={onOpenCatalog} scaleTo={0.96} style={{ paddingVertical: 4, paddingHorizontal: 4 }}>
            <Text className="text-sm font-semibold text-ginger font-sans">See all →</Text>
          </Bouncy>
        </View>

        {recentCats.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingBottom: 4 }}
            style={{ marginBottom: 24 }}
          >
            {recentCats.map((cat) => {
              const lastEntry = cat.scrapbook[cat.scrapbook.length - 1];
              const colors =
                lastEntry?.extracted_colors?.length
                  ? lastEntry.extracted_colors
                  : getSpriteTemplateColors(cat.sprite_template_id);
              return (
                <Bouncy
                  key={cat.cat_id}
                  onPress={() => onViewScrapbook(cat)}
                  scaleTo={0.94}
                  style={[
                    CARD_SHADOW,
                    {
                      backgroundColor: '#FFFFFF',
                      borderRadius: 18,
                      padding: 14,
                      width: 128,
                      borderWidth: 1,
                      borderColor: 'rgba(234,227,218,0.6)',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 30, marginBottom: 8 }}>🐱</Text>
                  <Text
                    style={{ fontSize: 14, fontWeight: '800', color: '#2C2A29', marginBottom: 3 }}
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Text>
                  {lastEntry && (
                    <Text
                      style={{ fontSize: 10, color: '#706B67', marginBottom: 8 }}
                      numberOfLines={1}
                    >
                      📍 {lastEntry.hood_name}
                    </Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {colors.slice(0, 3).map((c, i) => (
                      <View
                        key={i}
                        style={{
                          width: 14, height: 14, borderRadius: 7,
                          backgroundColor: c,
                          borderWidth: 1.5, borderColor: '#EAE3DA',
                        }}
                      />
                    ))}
                  </View>
                </Bouncy>
              );
            })}
          </ScrollView>
        ) : (
          <Bouncy
            onPress={onLogSpotting}
            scaleTo={0.98}
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 18,
                padding: 20,
                marginBottom: 24,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(255,142,83,0.3)',
                borderStyle: 'dashed',
              },
            ]}
          >
            <Text style={{ fontSize: 26, marginBottom: 6 }}>🐾</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2A29' }}>
              No cats spotted yet
            </Text>
            <Text style={{ fontSize: 11, color: '#706B67', marginTop: 3 }}>
              Tap to log your first sighting →
            </Text>
          </Bouncy>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Latest Field Note                                                 */}
        {/* ---------------------------------------------------------------- */}
        <View className="flex-row items-center justify-between mt-sm mb-md">
          <Text className="text-lg font-bold text-text-primary font-display">Latest Field Note</Text>
          <Bouncy onPress={onOpenCatalog} scaleTo={0.96} style={{ paddingVertical: 4, paddingHorizontal: 4 }}>
            <Text className="text-sm font-semibold text-ginger font-sans">See all →</Text>
          </Bouncy>
        </View>

        {recent ? (
          <Bouncy
            onPress={() => onViewScrapbook(recent.cat)}
            scaleTo={0.98}
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 18,
                padding: 16,
                borderLeftWidth: 4,
                borderLeftColor: '#FF8E53',
              },
            ]}
          >
            <View className="flex-row justify-between items-center mb-xs">
              <Text className="text-base font-bold text-text-primary font-display">
                {recent.cat.name}
              </Text>
              <Text className="text-xs text-text-secondary font-sans">
                📍 {recent.entry.hood_name}
              </Text>
            </View>
            <Text className="text-sm text-text-primary font-sans leading-relaxed" numberOfLines={2}>
              "{recent.entry.note_text || 'A quiet little sighting.'}"
            </Text>
            <View className="flex-row items-center mt-sm" style={{ gap: 6 }}>
              {(recent.entry.extracted_colors?.length
                ? recent.entry.extracted_colors
                : getSpriteTemplateColors(recent.cat.sprite_template_id)
              ).map((color, i) => (
                <View
                  key={`${recent.cat.cat_id}-c-${i}`}
                  style={{
                    backgroundColor: color,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: '#EAE3DA',
                  }}
                />
              ))}
            </View>
          </Bouncy>
        ) : (
          <Bouncy
            onPress={onLogSpotting}
            scaleTo={0.98}
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 18,
                padding: 22,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(255,142,83,0.35)',
                borderStyle: 'dashed',
              },
            ]}
          >
            <Text style={{ fontSize: 30 }}>🐾</Text>
            <Text className="text-sm font-semibold text-text-primary font-display mt-sm">
              No sightings yet
            </Text>
            <Text className="text-xs text-text-secondary font-sans mt-xs text-center">
              Tap to log your first Field Note and start your Cat-a-log.
            </Text>
          </Bouncy>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
