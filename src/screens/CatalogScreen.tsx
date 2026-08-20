import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCats } from '../services/dbService';
import { getSpriteTemplateColors } from '../utils/colorExtractor';
import { getSpriteById, RARITY_STARS } from '../utils/spriteLibrary';
import { HIT_SLOP_MD } from '../utils/styles';
import { Touchable } from '../components/Touchable';
import {
  color,
  space,
  radius,
  text,
  shadow,
  pill,
  fontSize,
  weight,
  TAP_MIN,
} from '../theme';
import type { Cat } from '../types';

type SortMode = 'recent' | 'alpha';

export interface CatalogScreenProps {
  /** Owner of the Cat-a-log being shown (the current user). */
  userId: string;
  onLogSpotting: () => void;
  onViewScrapbook: (cat: Cat) => void;
  /**
   * Returns to The Hood. Required now that the Cat-a-log is pushed over the
   * scene rather than living in a tab bar — without it the screen is a dead
   * end on any device without a hardware back gesture.
   */
  onBack?: () => void;
}

export function CatalogScreen({ userId, onLogSpotting, onViewScrapbook, onBack }: CatalogScreenProps) {
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
      <Touchable
        onPress={() => onViewScrapbook(item)}
        scaleTo={0.98}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, open scrapbook`}
        style={styles.catCard}
      >
        {/* Card header */}
        <View style={styles.cardHeader}>
          <Text style={styles.catName}>{item.name}</Text>
          <View style={[pill, { backgroundColor: badge.bg }]}>
            <Text style={styles.badgeLabel}>{badge.label}</Text>
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
        <View style={styles.cardFooter}>
          <Text style={text.secondary}>
            {sightingCount === 0
              ? 'No Field Notes yet'
              : `${sightingCount} Field Note${sightingCount === 1 ? '' : 's'}`}
          </Text>

          {/* Tapping the card already fires onViewScrapbook; this label
              is a visual affordance, not a second pressable region. */}
          <View style={styles.scrapbookChip}>
            <Text style={styles.scrapbookChipText}>View Scrapbook →</Text>
          </View>
        </View>
      </Touchable>
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Touchable
              onPress={onBack}
              hitSlop={HIT_SLOP_MD}
              accessibilityRole="button"
              accessibilityLabel="Back to your Hood"
              style={styles.backButton}
            >
              <Text style={styles.backArrow}>←</Text>
            </Touchable>
          )}
          <View style={styles.headerTitles}>
            <Text style={styles.screenTitle}>Cat-a-log</Text>
            <Text style={styles.screenSubtitle}>Spotted cats in the neighborhood</Text>
          </View>
        </View>

        <Touchable
          onPress={onLogSpotting}
          hitSlop={HIT_SLOP_MD}
          scaleTo={0.95}
          accessibilityRole="button"
          accessibilityLabel="Log a new sighting"
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>+ Spotting</Text>
        </Touchable>
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
            <Touchable
              key={mode}
              onPress={() => setSortMode(mode)}
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={[styles.sortChip, isActive ? styles.sortChipActive : null]}
            >
              <Text style={[styles.sortChipText, isActive ? styles.sortChipTextActive : null]}>
                {label}
              </Text>
            </Touchable>
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
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={color.ginger} />
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
              <Touchable
                onPress={onLogSpotting}
                scaleTo={0.95}
                accessibilityRole="button"
                style={styles.emptyCta}
              >
                <Text style={styles.emptyCtaText}>+ Log Sighting</Text>
              </Touchable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Centre-aligned so the back arrow, the title block and the CTA share one
    // axis. The arrow used to float between the two title lines.
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    backgroundColor: color.surface,
    gap: space.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 },
  headerTitles: { flex: 1 },
  backButton: {
    minWidth: TAP_MIN,
    minHeight: TAP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    // Pulls the glyph's optical edge back to the gutter; a 44pt tap target
    // otherwise indents the title by its own padding.
    marginLeft: -space.sm - space.xs,
  },
  backArrow: { color: color.ginger, fontWeight: weight.bold, fontSize: fontSize.lg },
  screenTitle: { fontSize: fontSize.xxl, fontWeight: weight.heavy, color: color.textPrimary },
  screenSubtitle: { fontSize: fontSize.xs, color: color.textSecondary, marginTop: 2 },

  primaryButton: {
    backgroundColor: color.ginger,
    borderRadius: radius.sm + 4,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    ...shadow.button,
  },
  primaryButtonText: { color: color.milk, fontWeight: weight.heavy, fontSize: fontSize.sm },

  // ── Cat card ─────────────────────────────────────────────────────────────
  catCard: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    marginBottom: space.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: color.borderSoft,
    ...shadow.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
    gap: space.sm,
  },
  catName: {
    fontSize: fontSize.xl,
    fontWeight: weight.bold,
    color: color.textPrimary,
    flexShrink: 1,
  },
  badgeLabel: { fontSize: fontSize.xs, fontWeight: weight.semibold, color: color.textPrimary },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
    gap: space.sm,
  },
  scrapbookChip: {
    // The chip stretched to full width before, because a View in a column
    // parent fills it unless told not to. This is the whole fix.
    alignSelf: 'flex-start',
    backgroundColor: color.gingerLight,
    borderRadius: radius.sm + 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 36,
    justifyContent: 'center',
  },
  scrapbookChipText: {
    color: color.gingerDark,
    fontWeight: weight.semibold,
    fontSize: fontSize.sm,
  },

  // ── Sort ─────────────────────────────────────────────────────────────────
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: color.surfaceSunken,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  sortChipActive: { backgroundColor: color.gingerLight, borderColor: color.ginger },
  sortChipText: { fontSize: fontSize.xs, fontWeight: weight.bold, color: color.textSecondary },
  sortChipTextActive: { color: color.gingerDark },

  // ── States ───────────────────────────────────────────────────────────────
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyCta: {
    marginTop: space.lg,
    backgroundColor: color.ginger,
    borderRadius: radius.sm + 6,
    paddingHorizontal: 28,
    paddingVertical: 14,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.button,
  },
  emptyCtaText: { fontSize: fontSize.base, fontWeight: weight.heavy, color: color.milk },
});
