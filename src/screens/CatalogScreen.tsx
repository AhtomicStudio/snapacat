import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCats } from '../services/dbService';
import { getSpriteTemplateColors } from '../utils/colorExtractor';
import { getSpriteById, RARITY_STARS } from '../utils/spriteLibrary';
import { CARD_SHADOW, BUTTON_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';
import type { Cat } from '../types';

type SortMode = 'recent' | 'alpha';

export interface CatalogScreenProps {
  /** Owner of the Cat-a-log being shown (the current user). */
  userId: string;
  onLogSpotting: () => void;
  onViewScrapbook: (cat: Cat) => void;
}

export function CatalogScreen({ userId, onLogSpotting, onViewScrapbook }: CatalogScreenProps) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  const [refreshing, setRefreshing] = useState(false);

  const loadCats = useCallback(async () => {
    try {
      const data = await getCats(userId);
      setCats(data);
    } catch (err) {
      console.error('Failed to load cats:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadCats();
  }, [loadCats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCats();
    setRefreshing(false);
  }, [loadCats]);

  const displayCats = useMemo(() => {
    let result = cats;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (sortMode === 'alpha') {
      return [...result].sort((a, b) => a.name.localeCompare(b.name));
    }
    // recent: sort by latest sighting timestamp descending
    return [...result].sort((a, b) => {
      const aTime = a.scrapbook.length > 0
        ? Math.max(...a.scrapbook.map((e) => e.timestamp?.seconds ?? 0))
        : 0;
      const bTime = b.scrapbook.length > 0
        ? Math.max(...b.scrapbook.map((e) => e.timestamp?.seconds ?? 0))
        : 0;
      return bTime - aTime;
    });
  }, [cats, searchQuery, sortMode]);

  function getGenderBadge(gender: string) {
    switch (gender) {
      case 'male':   return { bg: '#A8D0E6', label: 'Male ♂' };
      case 'female': return { bg: '#F79E89', label: 'Female ♀' };
      default:       return { bg: '#F8D49B', label: 'Unknown 🐾' };
    }
  }

  const renderCatItem = ({ item }: { item: Cat }) => {
    const badge = getGenderBadge(item.gender);
    const sightingCount = item.scrapbook.length;

    const lastEntry = item.scrapbook[item.scrapbook.length - 1];
    const colors =
      lastEntry?.extracted_colors?.length
        ? lastEntry.extracted_colors
        : getSpriteTemplateColors(item.sprite_template_id);

    // Unique Hoods this cat has been spotted in
    const hoods = [...new Set(item.scrapbook.map((e) => e.hood_name).filter(Boolean))];

    return (
      <Pressable
        onPress={() => onViewScrapbook(item)}
        style={({ pressed }) => [
          CARD_SHADOW,
          pressScale(pressed, 0.98),
          {
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            marginBottom: 16,
            padding: 16,
            // Warm hairline instead of a hard border
            borderWidth: 1,
            borderColor: pressed ? '#FFAAA6' : 'rgba(234,227,218,0.6)',
          },
        ]}
      >
        {/* Card header */}
        <View className="flex-row justify-between items-center mb-sm">
          <Text className="text-xl font-bold text-text-primary font-display">
            {item.name}
          </Text>
          <View
            className="px-sm py-xs rounded-full"
            style={{ backgroundColor: badge.bg }}
          >
            <Text className="text-xs font-semibold text-text-primary">{badge.label}</Text>
          </View>
        </View>

        {/* Sprite area — tinted by cat's primary palette color */}
        <View
          style={{
            height: 80, borderRadius: 14, marginVertical: 8,
            overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#FAF6F0',
          }}
        >
          {/* Low-opacity colour wash */}
          <View
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: colors[0] ?? '#FAF6F0',
              opacity: 0.18,
            }}
          />
          <Text style={{ fontSize: 32 }}>🐱</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Text style={{ fontSize: 10, color: '#706B67', textTransform: 'capitalize' }}>
              {getSpriteById(item.sprite_template_id).label}
            </Text>
            <Text style={{ fontSize: 8 }}>
              {RARITY_STARS[getSpriteById(item.sprite_template_id).rarity]}
            </Text>
          </View>
        </View>

        {/* Palette strip + hood chips */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8, alignItems: 'center' }}>
          {colors.slice(0, 5).map((color, index) => (
            <View
              key={`${item.cat_id}-color-${index}`}
              style={{
                backgroundColor: color,
                width: 20, height: 20, borderRadius: 10,
                borderWidth: 1.5, borderColor: '#EAE3DA',
              }}
            />
          ))}

          {hoods.length > 0 && (
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 5 }}>
              {hoods.slice(0, 2).map((hood) => (
                <View
                  key={`${item.cat_id}-hood-${hood}`}
                  style={{
                    backgroundColor: '#FAF6F0',
                    borderRadius: 99,
                    paddingHorizontal: 9,
                    paddingVertical: 4,
                    borderWidth: 1,
                    borderColor: 'rgba(234,227,218,0.8)',
                    maxWidth: 130,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 10, fontWeight: '600', color: '#706B67' }}
                  >
                    📍 {hood}
                  </Text>
                </View>
              ))}
              {hoods.length > 2 && (
                <Text style={{ fontSize: 10, color: '#B0ABA6', alignSelf: 'center' }}>
                  +{hoods.length - 2}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Card footer */}
        <View className="flex-row justify-between items-center mt-sm">
          <Text className="text-sm text-text-secondary font-sans">
            {sightingCount === 0
              ? 'No Field Notes yet'
              : `${sightingCount} Field Note${sightingCount === 1 ? '' : 's'}`}
          </Text>

          {/* Tapping the card already fires onViewScrapbook; this label
              is a visual affordance, not a second pressable region. */}
          <View
            className="rounded-xl py-sm px-md flex-row items-center gap-xs"
            style={{ backgroundColor: '#FFE8DC', minHeight: 36 }}
          >
            <Text className="text-ginger-dark font-semibold text-sm">
              View Scrapbook →
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row justify-between items-center px-lg py-md border-b border-border bg-card-bg"
      >
        <View>
          <Text className="text-title font-bold text-text-primary font-display">
            Cat-a-log
          </Text>
          <Text className="text-sm text-text-secondary font-sans mt-xs">
            Spotted cats in the neighborhood
          </Text>
        </View>

        {/* Primary CTA — scale + ginger button shadow */}
        <Pressable
          onPress={onLogSpotting}
          hitSlop={HIT_SLOP_MD}
          style={({ pressed }) => [
            BUTTON_SHADOW,
            pressScale(pressed, 0.95),
            {
              backgroundColor: pressed ? '#E67035' : '#FF8E53',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              minHeight: 44,
              justifyContent: 'center',
            },
          ]}
        >
          <Text className="text-milk font-bold text-sm">+ Spotting</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, backgroundColor: '#FFFFFF' }}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search cats…"
          placeholderTextColor="#B0ABA6"
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={{
            backgroundColor: '#FAF6F0',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 15,
            color: '#2C2A29',
            borderWidth: 1,
            borderColor: 'rgba(234,227,218,0.8)',
            minHeight: 44,
          }}
        />
      </View>

      {/* Sort toggle */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(234,227,218,0.6)' }}>
        {(['recent', 'alpha'] as SortMode[]).map((mode) => {
          const isActive = sortMode === mode;
          const label = mode === 'recent' ? 'Recent' : 'A – Z';
          return (
            <Pressable
              key={mode}
              onPress={() => setSortMode(mode)}
              style={({ pressed }) => [
                pressScale(pressed, 0.94),
                {
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 99,
                  backgroundColor: isActive ? '#FFE8DC' : '#FAF6F0',
                  borderWidth: 1.5,
                  borderColor: isActive ? '#FF8E53' : '#EAE3DA',
                },
              ]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#E67035' : '#706B67' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 12, color: '#B0ABA6' }}>
            {displayCats.length} cat{displayCats.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Body */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#FF8E53" />
        </View>
      ) : (
        <FlatList
          data={displayCats}
          keyExtractor={(item) => item.cat_id}
          renderItem={renderCatItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF8E53" colors={['#FF8E53']} />
          }
          ListEmptyComponent={searchQuery.trim() ? (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 44 }}>🔍</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2A29', marginTop: 14 }}>
                No cats match "{searchQuery.trim()}"
              </Text>
              <Text style={{ fontSize: 13, color: '#706B67', marginTop: 6, textAlign: 'center' }}>
                Try a different name, or clear the search.
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 52 }}>🐾</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#2C2A29', marginTop: 16 }}>
                No cats discovered yet
              </Text>
              <Text style={{ fontSize: 14, color: '#706B67', marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
                Head outside and log your first neighborhood cat sighting.
              </Text>
              <Pressable
                onPress={onLogSpotting}
                style={({ pressed }) => [
                  pressScale(pressed, 0.95),
                  {
                    marginTop: 24,
                    backgroundColor: pressed ? '#E67035' : '#FF8E53',
                    borderRadius: 14,
                    paddingHorizontal: 28,
                    paddingVertical: 14,
                    minHeight: 44,
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: '#FF8E53',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 10,
                    elevation: 6,
                  },
                ]}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFFFFF' }}>+ Log Sighting</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
