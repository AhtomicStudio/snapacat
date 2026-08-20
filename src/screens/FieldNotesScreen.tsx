import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCats, createCat, addScrapbookEntry, saveUserProgression } from '../services/dbService';
import { CARD_SHADOW, BUTTON_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';
import { Touchable } from '../components/Touchable';
import { color, space, radius, shadow, fontSize, weight, TAP_MIN } from '../theme';
import type { CatGender, HexColor, UserProgression } from '../types';
import type { RGB } from '../utils/colorExtractor';
import { awardPawPoints, PAW_POINT_REWARDS } from '../utils/progressionEngine';
import { primePerchSprites } from '../hooks/usePerchSprites';
import { SPRITE_LIBRARY, getSpriteById, RARITY_STARS } from '../utils/spriteLibrary';

export interface FieldNotesScreenProps {
  userId: string;
  onBack: () => void;
  onSubmitSuccess: () => void;
  progression?: UserProgression;
  onUpdateProgression?: (updated: UserProgression) => void;
  capturedPhotoUri?: string;
  onRetakePhoto?: () => void;
  /** Pre-matched sprite ID from SpriteRevealScreen — skips manual picker. */
  spriteTemplateId?: string;
  /** Extracted palette colours from the photo. */
  extractedColors?: HexColor[];
}

// Reused group-card style — shadow depth, no hard border ring
const GROUP_CARD = {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
  ...CARD_SHADOW,
} as const;

export function FieldNotesScreen({
  userId, onBack, onSubmitSuccess, progression, onUpdateProgression,
  capturedPhotoUri, onRetakePhoto, spriteTemplateId: matchedSpriteId, extractedColors,
}: FieldNotesScreenProps) {
  const [catName, setCatName]   = useState('');
  const [gender, setGender]     = useState<CatGender>('unknown');
  // If a sprite was auto-matched, pre-fill it; user can still override
  const [spriteTemplateId, setSpriteTemplate] = useState(matchedSpriteId ?? SPRITE_LIBRARY[0]!.id);
  const [overridePicker, setOverridePicker]   = useState(false);
  const [hoodName, setHoodName]               = useState('');
  const [notes, setNotes]                     = useState('');
  const [hasPhoto, setHasPhoto]               = useState(!!capturedPhotoUri);
  const [mockPixels, setMockPixels]           = useState<RGB[]>([]);

  const catNameRef  = useRef<TextInput>(null);
  const hoodNameRef = useRef<TextInput>(null);
  const notesRef    = useRef<TextInput>(null);

  function handleTakePhoto() {
    setHasPhoto(true);
    const samplePixels: RGB[] = [
      { r: 255, g: 142, b: 83  },
      { r: 255, g: 142, b: 83  },
      { r: 44,  g: 42,  b: 41  },
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 170, b: 166 },
    ];
    setMockPixels(samplePixels);
    Alert.alert(
      '📸 Mock Photo Taken!',
      'Extracted dominant color pixels will be used to auto-tint your cat sprite.',
    );
  }

  async function handleSubmit() {
    if (!catName.trim()) {
      Alert.alert('Required Field', 'Please enter a name for the cat.');
      return;
    }
    if (!hoodName.trim()) {
      Alert.alert('Required Field', 'Please enter the Hood name (where you saw the cat).');
      return;
    }

    try {
      // Match only within this user's own Cat-a-log — names are reliable there.
      const myCats = await getCats(userId);
      let matchedCat = myCats.find(
        (c) => c.name.toLowerCase().trim() === catName.toLowerCase().trim(),
      );

      let catId = '';
      if (matchedCat) {
        catId = matchedCat.cat_id;
      } else {
        const newCat = await createCat(catName.trim(), gender, spriteTemplateId, userId);
        catId = newCat.cat_id;
        // The Hood perches are cached per uid, so without this the cat you just
        // logged would not show up there — which is the whole loop. Priming
        // rather than invalidating, because the very next thing a user does
        // after logging a cat is usually open their Hood, and dropping the
        // entry would make that entry pay for a cold fetch. Only the new-cat
        // branch needs it; a scrapbook entry on an existing cat changes no
        // sprite_template_id.
        primePerchSprites(userId, newCat.sprite_template_id);
      }

      await addScrapbookEntry(catId, {
        user_id: userId,
        hood_name: hoodName.trim(),
        note_text: notes.trim(),
        // Camera flow passes extracted_colors directly; manual flow falls back to mockPixels
        extracted_colors: extractedColors,
        photoPixels: !extractedColors && hasPhoto ? mockPixels : undefined,
      });

      // Award PawPoints
      if (progression && onUpdateProgression) {
        const source = !matchedCat ? 'new_cat_discovery' : 'field_note';
        const updated = awardPawPoints(progression, source);
        onUpdateProgression(updated);
        await saveUserProgression(userId, updated);
        const earned = PAW_POINT_REWARDS[source];
        const headline = !matchedCat
          ? `✨ New cat discovered: ${catName.trim()}!`
          : `Added to ${matchedCat.name}'s scrapbook.`;
        Alert.alert(
          'Field Note Logged! 🎉',
          `${headline}\n\n+${earned} 🐾 PawPoints earned!`,
        );
      } else {
        Alert.alert(
          'Success 🎉',
          matchedCat
            ? `Added to ${matchedCat.name}'s scrapbook.`
            : 'Field Note logged to the Cat-a-log!',
        );
      }

      onSubmitSuccess();
    } catch (err) {
      console.error('Failed to submit field note:', err);
      Alert.alert('Error', 'Failed to log sighting. Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.header}>
        <Touchable
          onPress={onBack}
          hitSlop={HIT_SLOP_MD}
          accessibilityRole="button"
          accessibilityLabel="Cancel and go back"
          style={styles.backButton}
        >
          <Text style={styles.backArrow}>←</Text>
        </Touchable>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Log Field Note</Text>
          <Text style={styles.screenSubtitle}>Add a new cat sighting to your collection</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---------------------------------------------------------------- */}
        {/* Captured photo preview (only when photo came from CameraScreen) */}
        {/* ---------------------------------------------------------------- */}
        {capturedPhotoUri && (
          <View style={[GROUP_CARD, { marginBottom: 16 }]}>
            {capturedPhotoUri.startsWith('file://') ? (
              <Image
                source={{ uri: capturedPhotoUri }}
                style={{ height: 172, borderRadius: 12, backgroundColor: '#1E1208' }}
                resizeMode="cover"
              />
            ) : (
              /* Mock URI placeholder — shown on emulator when no real camera */
              <View style={{ height: 172, borderRadius: 12, backgroundColor: '#1E1208', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ position: 'absolute', top: 14, right: 20, width: 80, height: 80, borderRadius: 40, backgroundColor: '#FF8E53', opacity: 0.13 }} />
                <View style={{ position: 'absolute', bottom: 8, left: 12, width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFE8DC', opacity: 0.07 }} />
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', backgroundColor: 'rgba(44,30,16,0.5)' }} />
                <Text style={{ fontSize: 54 }}>🐱</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#2C2A29' }}>📸 Photo captured</Text>
              {onRetakePhoto && (
                <Pressable onPress={onRetakePhoto} hitSlop={HIT_SLOP_MD}>
                  <Text style={{ fontSize: 12, color: '#E67035', fontWeight: '700' }}>Retake →</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Cat Name                                                         */}
        {/* ---------------------------------------------------------------- */}
        <View style={GROUP_CARD}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            ref={catNameRef}
            placeholder="e.g. Mochi, Socks…"
            value={catName}
            onChangeText={setCatName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => hoodNameRef.current?.focus()}
            blurOnSubmit={false}
            placeholderTextColor="#706B67"
            style={{
              backgroundColor: '#FAF6F0',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
              minHeight: 44,
            }}
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Gender                                                           */}
        {/* ---------------------------------------------------------------- */}
        <View style={GROUP_CARD}>
          <Text style={[styles.fieldLabel, { marginBottom: space.sm }]}>Gender</Text>
          <View style={styles.genderRow}>
            {(['male', 'female', 'unknown'] as CatGender[]).map((opt) => {
              const isSelected = gender === opt;
              const label = opt === 'male' ? 'Male ♂' : opt === 'female' ? 'Female ♀' : 'Unknown';

              return (
                <Touchable
                  key={opt}
                  onPress={() => setGender(opt)}
                  scaleTo={0.96}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={[styles.genderOption, isSelected ? styles.genderOptionActive : null]}
                >
                  <Text style={[styles.genderText, isSelected ? styles.genderTextActive : null]}>
                    {label}
                  </Text>
                </Touchable>
              );
            })}
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Sprite — auto-matched card or manual picker                      */}
        {/* ---------------------------------------------------------------- */}
        {matchedSpriteId && !overridePicker ? (
          // Auto-matched result from SpriteRevealScreen
          <View style={[GROUP_CARD, { paddingBottom: 14 }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#706B67', marginBottom: 10 }}>
              Sprite Signature Look
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* Colour circle */}
              <View
                style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: extractedColors?.[0] ?? getSpriteById(spriteTemplateId).palette[0],
                  borderWidth: 3, borderColor: '#FFE8DC',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 24 }}>🐱</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#2C2A29' }}>
                  {getSpriteById(spriteTemplateId).label}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <Text style={{ fontSize: 11 }}>{RARITY_STARS[getSpriteById(spriteTemplateId).rarity]}</Text>
                  {/* Palette swatches */}
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {(extractedColors ?? getSpriteById(spriteTemplateId).palette).slice(0, 3).map((c, i) => (
                      <View
                        key={i}
                        style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c, borderWidth: 1.5, borderColor: '#EAE3DA' }}
                      />
                    ))}
                  </View>
                </View>
              </View>
              {/* Auto-detected badge */}
              <View style={{ backgroundColor: '#FFE8DC', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#E67035', letterSpacing: 1 }}>AUTO</Text>
              </View>
            </View>
            <Pressable onPress={() => setOverridePicker(true)} style={{ marginTop: 12, alignSelf: 'flex-end' }}>
              <Text style={{ fontSize: 11, color: '#B0ABA6' }}>Not right? Change ›</Text>
            </Pressable>
          </View>
        ) : (
          // Manual picker — full 20-sprite horizontal scroll
          <View style={GROUP_CARD}>
            {matchedSpriteId && (
              <Pressable onPress={() => { setSpriteTemplate(matchedSpriteId); setOverridePicker(false); }} style={{ marginBottom: 8, alignSelf: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: '#FF8E53' }}>← Back to detected sprite</Text>
              </Pressable>
            )}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#706B67', marginBottom: 8 }}>
              Sprite Signature Look
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {SPRITE_LIBRARY.map((opt) => {
                const isSelected = spriteTemplateId === opt.id;
                return (
                  <Touchable
                    key={opt.id}
                    onPress={() => setSpriteTemplate(opt.id)}
                    scaleTo={0.95}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    style={[styles.spriteChip, isSelected ? styles.spriteChipActive : null]}
                  >
                    <Text
                      style={{
                        fontSize: 11, fontWeight: '600',
                        color: isSelected ? '#E67035' : '#706B67',
                        marginBottom: 5,
                      }}
                    >
                      {opt.label}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {opt.palette.slice(0, 3).map((c, pi) => (
                        <View
                          key={pi}
                          style={{
                            width: 10, height: 10, borderRadius: 5,
                            backgroundColor: c,
                            borderWidth: 1, borderColor: isSelected ? '#FFE8DC' : '#EAE3DA',
                          }}
                        />
                      ))}
                    </View>
                  </Touchable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Hood Location                                                    */}
        {/* ---------------------------------------------------------------- */}
        <View style={GROUP_CARD}>
          <Text style={styles.fieldLabel}>Hood / Location</Text>
          <TextInput
            ref={hoodNameRef}
            placeholder="e.g. Backyard Deck, Parking Lot…"
            value={hoodName}
            onChangeText={setHoodName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => notesRef.current?.focus()}
            blurOnSubmit={false}
            placeholderTextColor="#706B67"
            style={{
              backgroundColor: '#FAF6F0',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
              minHeight: 44,
            }}
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Field Notes                                                      */}
        {/* ---------------------------------------------------------------- */}
        <View style={GROUP_CARD}>
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            ref={notesRef}
            placeholder="Describe what the cat is doing, its personality, colors…"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            returnKeyType="done"
            blurOnSubmit
            placeholderTextColor="#706B67"
            textAlignVertical="top"
            style={{
              backgroundColor: '#FAF6F0',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
              minHeight: 108,
            }}
          />
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Camera / Snapshot Zone (hidden when a photo arrived from camera) */}
        {/* ---------------------------------------------------------------- */}
        {!capturedPhotoUri && <Touchable
          onPress={handleTakePhoto}
          scaleTo={0.97}
          accessibilityRole="button"
          style={[styles.photoCta, hasPhoto ? styles.photoCtaActive : null]}
        >
          <Text style={{ fontSize: 22 }}>📸</Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: hasPhoto ? '#E67035' : '#706B67',
            }}
          >
            {hasPhoto
              ? 'Photo Captured (Color Extract Active)'
              : 'Take Photo (Extract Signature Colors)'}
          </Text>
        </Touchable>}

      </ScrollView>

      {/* ------------------------------------------------------------------ */}
      {/* Sticky footer — always visible above keyboard                       */}
      {/* ------------------------------------------------------------------ */}
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 16,
          borderTopWidth: 1,
          borderTopColor: 'rgba(234,227,218,0.6)',
          backgroundColor: '#FAF6F0',
        }}
      >
        <Touchable
          onPress={onBack}
          accessibilityRole="button"
          style={styles.footerSecondary}
        >
          <Text style={styles.footerSecondaryText}>Cancel</Text>
        </Touchable>

        <Touchable
          onPress={handleSubmit}
          scaleTo={0.96}
          accessibilityRole="button"
          style={styles.footerPrimary}
        >
          <Text style={styles.footerPrimaryText}>Log Spotting</Text>
        </Touchable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.background },

  header: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    backgroundColor: color.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  backButton: {
    minWidth: TAP_MIN,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -space.sm - space.xs,
  },
  backArrow: { color: color.ginger, fontWeight: weight.bold, fontSize: fontSize.lg },
  screenTitle: { fontSize: fontSize.xl, fontWeight: weight.heavy, color: color.textPrimary },
  screenSubtitle: { fontSize: fontSize.xs, color: color.textSecondary, marginTop: 2 },

  fieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: weight.bold,
    color: color.textSecondary,
    marginBottom: space.xs,
  },

  genderRow: { flexDirection: 'row', gap: space.sm },
  genderOption: {
    flex: 1,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm + 4,
    backgroundColor: color.surfaceSunken,
    borderWidth: 1.5,
    borderColor: color.border,
  },
  genderOptionActive: {
    backgroundColor: color.ginger,
    borderColor: color.ginger,
    ...shadow.button,
  },
  genderText: { fontWeight: weight.semibold, fontSize: fontSize.sm, color: color.textSecondary },
  genderTextActive: { color: color.milk },

  spriteChip: {
    paddingHorizontal: space.sm + 4,
    paddingVertical: space.sm,
    borderRadius: radius.sm + 4,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.surfaceSunken,
    borderWidth: 1.5,
    borderColor: color.borderSoft,
  },
  spriteChipActive: {
    backgroundColor: color.gingerLight,
    borderColor: color.ginger,
    shadowColor: color.ginger,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },

  photoCta: {
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm + 4,
    minHeight: 64,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm + 2,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.borderSoft,
    ...shadow.card,
  },
  photoCtaActive: { backgroundColor: color.gingerLight, borderColor: color.ginger },

  footerSecondary: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm + 6,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderSoft,
    ...shadow.card,
  },
  footerSecondaryText: {
    color: color.textSecondary,
    fontWeight: weight.bold,
    fontSize: fontSize.base,
  },
  footerPrimary: {
    flex: 1,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm + 6,
    backgroundColor: color.ginger,
    ...shadow.button,
  },
  footerPrimaryText: { color: color.milk, fontWeight: weight.bold, fontSize: fontSize.base },
});
