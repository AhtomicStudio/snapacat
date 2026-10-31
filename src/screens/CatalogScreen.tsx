/**
 * The Cat-a-log — a collection book, not a list.
 *
 * It used to render one card per cat you had logged, which meant it could only
 * ever show you what you already had. An empty Cat-a-log showed an empty
 * screen, and a full one gave no reason to keep going.
 *
 * Now the index is the twenty breeds, and the ones you have not met are on it
 * as silhouettes. The empty slots are the engine: they are what makes the next
 * cat worth chasing. Your named cats live inside whichever breed they belong
 * to, reachable by tapping through.
 *
 * The grouping is derived — see utils/collection. Nothing about the stored
 * `cats` documents changed.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  FlatList,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCats } from '../services/dbService';
import { SPRITE_SHEETS, FRAME_COUNT } from '../assets/sprites';
import { RARITY_LABELS, PATTERN_LABELS } from '../utils/spriteLibrary';
import {
  buildCollection,
  collectionProgress,
  filterCollection,
  describeEntry,
  type CollectionEntry,
  type CollectionFilter,
} from '../utils/collection';
import { HIT_SLOP_MD } from '../utils/styles';
import { Touchable } from '../components/Touchable';
import {
  font,
  color,
  space,
  radius,
  shadow,
  fontSize,
  TAP_MIN,
  GUTTER,
} from '../theme';
import type { Cat } from '../types';

export interface CatalogScreenProps {
  /** Owner of the Cat-a-log being shown (the current user). */
  userId: string;
  onLogSpotting: () => void;
  onViewScrapbook: (cat: Cat) => void;
  /** Returns to The Hood. */
  onBack?: () => void;
}

const COLUMNS = 3;

/**
 * Gold, for the rare frame. Deliberately outside the brand palette — it is a
 * reward colour, and it should feel like it arrived from somewhere else.
 */
const RARE = '#C9A227';

// ---------------------------------------------------------------------------
// Breed portrait
// ---------------------------------------------------------------------------

/**
 * Frame 0 of a breed's sheet.
 *
 * Sheets are FRAME_COUNT frames laid out left-to-right, so showing one pose is
 * a crop rather than a separate asset. Undiscovered breeds render the SAME
 * sprite knocked out to a flat silhouette via tintColor — the shape is the
 * tease, and there is no second asset to keep in sync.
 */
function BreedPortrait({
  breedId,
  size,
  silhouette,
}: {
  breedId: string;
  size: number;
  silhouette: boolean;
}) {
  const sheet = SPRITE_SHEETS[breedId];
  if (!sheet) return null;

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <Image
        source={sheet}
        // Stretch rather than contain: the frame is cropped by the parent, so
        // the sheet is laid out at its full width and only frame 0 shows.
        resizeMode="stretch"
        fadeDuration={0}
        style={[
          { width: size * FRAME_COUNT, height: size },
          silhouette ? { tintColor: color.charcoal, opacity: 0.22 } : null,
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function BreedCard({ entry, onPress }: { entry: CollectionEntry; onPress: () => void }) {
  const { breed, discovered } = entry;
  const isRare = discovered && breed.rarity === 'rare';

  return (
    <Touchable
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={
        discovered ? `${breed.label}, ${describeEntry(entry)}` : 'A breed you have not met yet'
      }
      style={[
        styles.card,
        discovered ? styles.cardFound : styles.cardMissing,
        isRare ? styles.cardRare : null,
      ]}
    >
      <View
        style={[
          styles.plate,
          discovered ? styles.plateFound : null,
          isRare ? styles.plateRare : null,
        ]}
      >
        {discovered && <View style={styles.portraitShadow} />}
        <BreedPortrait breedId={breed.id} size={74} silhouette={!discovered} />
        {isRare && (
          <View style={styles.rareTag}>
            <Text style={styles.rareTagText}>RARE</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        {/* Two lines: breed names run long ("Orange Mackerel Tabby") and a
            single line truncated most of them to "Orange Macke…". */}
        <Text numberOfLines={2} style={discovered ? styles.cardName : styles.cardNameMissing}>
          {discovered ? breed.label : '?????'}
        </Text>
        <Text numberOfLines={1} style={discovered ? styles.cardSub : styles.cardSubMissing}>
          {describeEntry(entry)}
        </Text>
      </View>
    </Touchable>
  );
}

// ---------------------------------------------------------------------------
// Breed sheet — the page a card opens
// ---------------------------------------------------------------------------

function BreedSheet({
  entry,
  onClose,
  onViewScrapbook,
}: {
  entry: CollectionEntry | null;
  onClose: () => void;
  onViewScrapbook: (cat: Cat) => void;
}) {
  const open = entry != null && entry.discovered;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Touchable onPress={onClose} pressedStyle={{}} style={styles.sheetScrim}>
        <Touchable onPress={() => {}} pressedStyle={{}} style={styles.sheet}>
          {entry && (
            <>
              <View style={styles.sheetPlate}>
                <View style={styles.sheetPortraitShadow} />
                <BreedPortrait breedId={entry.breed.id} size={132} silhouette={false} />
              </View>

              <Text style={styles.sheetTitle}>{entry.breed.label}</Text>

              <View style={styles.sheetTags}>
                <View
                  style={[
                    styles.tag,
                    entry.breed.rarity === 'rare' ? { backgroundColor: RARE, borderColor: RARE } : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.tagText,
                      entry.breed.rarity === 'rare' ? { color: color.milk } : null,
                    ]}
                  >
                    {RARITY_LABELS[entry.breed.rarity]}
                  </Text>
                </View>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{PATTERN_LABELS[entry.breed.pattern]}</Text>
                </View>
              </View>

              <Text style={styles.sheetBlurb}>{entry.breed.description}</Text>

              <View style={styles.sheetDivider} />

              <Text style={styles.sheetSectionLabel}>
                {entry.cats.length === 1 ? 'Your cat' : `Your cats (${entry.cats.length})`}
              </Text>

              {entry.cats.map((cat) => (
                <Touchable
                  key={cat.cat_id}
                  onPress={() => onViewScrapbook(cat)}
                  scaleTo={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${cat.name}'s scrapbook`}
                  style={styles.catRow}
                >
                  <BreedPortrait breedId={entry.breed.id} size={40} silhouette={false} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catRowName}>{cat.name}</Text>
                    <Text style={styles.catRowSub}>
                      {cat.scrapbook.length === 0
                        ? 'No Field Notes yet'
                        : `${cat.scrapbook.length} Field Note${cat.scrapbook.length === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  <Text style={styles.catRowChevron}>›</Text>
                </Touchable>
              ))}
            </>
          )}
        </Touchable>
      </Touchable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const FILTERS: { id: CollectionFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'found', label: 'Found' },
  { id: 'missing', label: 'Missing' },
  { id: 'rare', label: 'Rare' },
];

export function CatalogScreen({
  userId,
  onLogSpotting,
  onViewScrapbook,
  onBack,
}: CatalogScreenProps) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CollectionFilter>('all');
  const [openEntry, setOpenEntry] = useState<CollectionEntry | null>(null);

  const load = useCallback(async () => {
    try {
      setCats(await getCats(userId));
    } catch (err) {
      console.error('Failed to load the Cat-a-log:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const entries = useMemo(() => buildCollection(cats), [cats]);
  const progress = useMemo(() => collectionProgress(entries), [entries]);
  const visible = useMemo(() => filterCollection(entries, filter, query), [entries, filter, query]);

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
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
          <Text style={styles.screenTitle}>Cat-a-log</Text>
        </View>

        {/*
          The one number the game still shows. Everywhere else they were removed
          on purpose (see utils/hoodMood) — but completion is the GOAL of a
          collection rather than a hidden mechanic, so withholding it would
          remove the point instead of preserving a mystery.
        */}
        <View style={styles.progressBlock}>
          <View style={styles.progressLabels}>
            <Text style={styles.progressCaption}>Breeds discovered</Text>
            <Text style={styles.progressCount}>
              {progress.found}
              <Text style={styles.progressTotal}> / {progress.total}</Text>
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round(progress.ratio * 100)}%` }]}
            />
          </View>
        </View>
      </View>

      {/* ── Search + filters ────────────────────────────────────────────── */}
      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your cats…"
          placeholderTextColor={color.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search your cats"
          style={styles.search}
        />
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = f.id === filter;
            return (
              <Touchable
                key={f.id}
                onPress={() => setFilter(f.id)}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}
              >
                <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
                  {f.label}
                </Text>
              </Touchable>
            );
          })}
        </View>
      </View>

      {/* ── The book ────────────────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={color.ginger} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(e) => e.breed.id}
          numColumns={COLUMNS}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={color.ginger}
              colors={[color.ginger]}
            />
          }
          renderItem={({ item }) => (
            <BreedCard
              entry={item}
              // Tapping a slot you have not filled sends you out to fill it —
              // the only useful thing an empty slot can do.
              onPress={() => (item.discovered ? setOpenEntry(item) : onLogSpotting())}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing matches that</Text>
              <Text style={styles.emptyBody}>
                {query.trim()
                  ? 'Only cats you have already met can be searched.'
                  : 'Try another filter.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Log CTA ─────────────────────────────────────────────────────── */}
      {/* Stacked fade so the grid runs UNDER the button rather than stopping
          dead behind it. A single flat band would cut the page in half. */}
      <View style={styles.ctaFade} pointerEvents="none">
        {[0.08, 0.22, 0.45, 0.72, 1].map((a, i) => (
          <View
            key={i}
            style={{ flex: 1, backgroundColor: color.background, opacity: a }}
          />
        ))}
      </View>
      <View style={styles.ctaWrap} pointerEvents="box-none">
        <Touchable
          onPress={onLogSpotting}
          scaleTo={0.97}
          accessibilityRole="button"
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Log a sighting</Text>
        </Touchable>
      </View>

      <BreedSheet
        entry={openEntry}
        onClose={() => setOpenEntry(null)}
        onViewScrapbook={(cat) => {
          setOpenEntry(null);
          onViewScrapbook(cat);
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    paddingHorizontal: GUTTER,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backButton: {
    minWidth: TAP_MIN,
    minHeight: TAP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    // Pulls the glyph's optical edge onto the gutter; a 44pt target otherwise
    // indents the title by its own padding.
    marginLeft: -space.sm - space.xs,
  },
  backArrow: { fontFamily: font.bold, color: color.ginger, fontSize: fontSize.lg },
  screenTitle: { fontFamily: font.bold, fontSize: fontSize.xxl, color: color.textPrimary },

  progressBlock: { marginTop: space.sm + 4 },
  progressLabels: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  progressCaption: { fontFamily: font.regular, fontSize: fontSize.xs, color: color.textSecondary },
  progressCount: { fontFamily: font.bold, fontSize: fontSize.base, color: color.gingerDark },
  progressTotal: { fontFamily: font.medium, fontSize: fontSize.xs, color: color.textMuted },
  progressTrack: {
    marginTop: 7,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F0EBE3',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: color.ginger },

  // ── Controls ─────────────────────────────────────────────────────────────
  controls: { paddingHorizontal: GUTTER, paddingTop: space.sm + 4, gap: space.sm + 2 },
  search: {
    backgroundColor: color.surface,
    borderRadius: radius.sm + 4,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingHorizontal: 14,
    minHeight: TAP_MIN,
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: color.textPrimary,
  },
  filterRow: { flexDirection: 'row', gap: space.sm },
  filterChip: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  filterChipActive: {
    backgroundColor: color.ginger,
    borderColor: color.ginger,
    // The lip: a solid, unblurred drop that makes a control read as a physical
    // key rather than a coloured rectangle.
    shadowColor: color.gingerDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  filterChipText: { fontFamily: font.bold, fontSize: fontSize.xs, color: color.textSecondary },
  filterChipTextActive: { color: color.milk },

  // ── Grid ─────────────────────────────────────────────────────────────────
  grid: { paddingHorizontal: GUTTER, paddingTop: space.md, paddingBottom: 120 },
  column: { gap: space.sm + 4, marginBottom: space.sm + 4 },

  card: { flex: 1, borderRadius: radius.lg - 4, overflow: 'hidden' },
  cardFound: {
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.border,
    ...shadow.card,
  },
  cardMissing: {
    backgroundColor: '#F3EDE4',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DCD3C6',
  },
  cardRare: { borderWidth: 2, borderColor: RARE },

  plate: { height: 92, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  plateFound: { backgroundColor: '#F6EFE4' },
  plateRare: { backgroundColor: '#FBF3DF' },
  portraitShadow: {
    position: 'absolute',
    bottom: 9,
    width: 40,
    height: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(48,40,30,0.14)',
  },
  rareTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: RARE,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  rareTagText: { fontFamily: font.bold, fontSize: 9, color: color.milk, letterSpacing: 0.3 },

  cardBody: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 10,
    // Reserves the second line so a one-line name and a two-line name produce
    // the same card height — otherwise the grid rows go ragged.
    minHeight: 56,
  },
  cardName: { fontFamily: font.bold, fontSize: 11.5, color: color.textPrimary },
  cardNameMissing: { fontFamily: font.bold, fontSize: 11.5, color: color.textMuted },
  cardSub: { fontFamily: font.regular, fontSize: 10.5, color: color.textSecondary, marginTop: 2 },
  cardSubMissing: { fontFamily: font.regular, fontSize: 10.5, color: '#B7B0A7', marginTop: 2 },

  // ── States ───────────────────────────────────────────────────────────────
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: space.lg },
  emptyTitle: { fontFamily: font.bold, fontSize: fontSize.base, color: color.textPrimary },
  emptyBody: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: color.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },

  // ── CTA ──────────────────────────────────────────────────────────────────
  ctaFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 130 },
  ctaWrap: { position: 'absolute', left: GUTTER, right: GUTTER, bottom: space.lg + 6 },
  cta: {
    backgroundColor: color.ginger,
    borderRadius: radius.lg - 4,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.gingerDark,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  ctaText: { fontFamily: font.bold, fontSize: fontSize.lg - 1, color: color.milk },

  // ── Breed sheet ──────────────────────────────────────────────────────────
  sheetScrim: { flex: 1, backgroundColor: 'rgba(20,14,8,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.background,
    borderTopLeftRadius: radius.lg + 2,
    borderTopRightRadius: radius.lg + 2,
    paddingHorizontal: GUTTER,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    maxHeight: '86%',
  },
  sheetPlate: {
    alignSelf: 'center',
    width: 168,
    height: 152,
    borderRadius: radius.lg - 4,
    backgroundColor: '#F6EFE4',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  sheetPortraitShadow: {
    position: 'absolute',
    bottom: 16,
    width: 72,
    height: 12,
    borderRadius: 36,
    backgroundColor: 'rgba(48,40,30,0.15)',
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: fontSize.xxl,
    color: color.textPrimary,
    textAlign: 'center',
    marginTop: space.md,
  },
  sheetTags: { flexDirection: 'row', gap: space.sm, justifyContent: 'center', marginTop: space.sm },
  tag: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: { fontFamily: font.bold, fontSize: fontSize.xs, color: color.textSecondary },
  sheetBlurb: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: color.textSecondary,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: space.md,
  },
  sheetDivider: { height: 1, backgroundColor: color.border, marginVertical: space.lg },
  sheetSectionLabel: {
    fontFamily: font.bold,
    fontSize: fontSize.xs,
    color: color.textSecondary,
    marginBottom: space.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 4,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderSoft,
    paddingHorizontal: space.sm + 4,
    paddingVertical: space.sm + 2,
    marginBottom: space.sm,
    minHeight: TAP_MIN + 12,
  },
  catRowName: { fontFamily: font.bold, fontSize: fontSize.base, color: color.textPrimary },
  catRowSub: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: color.textSecondary,
    marginTop: 1,
  },
  catRowChevron: { fontFamily: font.bold, fontSize: fontSize.xl, color: color.ginger },
});
