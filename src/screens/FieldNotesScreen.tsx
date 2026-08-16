import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCats, createCat, addScrapbookEntry, saveUserProgression } from '../services/dbService';
import { CARD_SHADOW, BUTTON_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';
import type { CatGender, HexColor, UserProgression } from '../types';
import type { RGB } from '../utils/colorExtractor';
import { awardPawPoints, PAW_POINT_REWARDS } from '../utils/progressionEngine';
import { invalidatePerchSprites } from '../hooks/usePerchSprites';
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
        // logged would not show up there — which is the whole loop. Only the
        // new-cat branch needs it; a scrapbook entry on an existing cat changes
        // no sprite_template_id.
        invalidatePerchSprites(userId);
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
    <SafeAreaView className="flex-1 bg-background">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
      <View className="px-lg py-md border-b border-border bg-card-bg flex-row items-center gap-sm">
        <Pressable
          onPress={onBack}
          hitSlop={HIT_SLOP_MD}
          style={({ pressed }) => [
            pressScale(pressed),
            { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
          ]}
        >
          <Text className="text-ginger font-bold text-lg">←</Text>
        </Pressable>
        <View>
          <Text className="text-xl font-bold text-text-primary font-display">
            Log Field Note
          </Text>
          <Text className="text-xs text-text-secondary font-sans mt-xs">
            Add a new cat sighting to your collection
          </Text>
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
          <Text className="text-sm font-bold text-text-secondary mb-xs font-sans">
            Name
          </Text>
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
            className="text-text-primary font-sans text-base"
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
          <Text className="text-sm font-bold text-text-secondary mb-sm font-sans">
            Gender
          </Text>
          <View className="flex-row gap-sm">
            {(['male', 'female', 'unknown'] as CatGender[]).map((opt) => {
              const isSelected = gender === opt;
              const label = opt === 'male' ? 'Male ♂' : opt === 'female' ? 'Female ♀' : 'Unknown';

              return (
                <Pressable
                  key={opt}
                  onPress={() => setGender(opt)}
                  style={({ pressed }) => [
                    pressScale(pressed, 0.96),
                    {
                      flex: 1,
                      minHeight: 44,
                      justifyContent: 'center',
                      alignItems: 'center',
                      borderRadius: 12,
                      backgroundColor: isSelected ? '#FF8E53' : '#FAF6F0',
                      // Ginger border when selected, invisible when not
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#FF8E53' : '#EAE3DA',
                    },
                    isSelected && BUTTON_SHADOW,
                  ]}
                >
                  <Text
                    className={`font-semibold text-sm font-sans ${
                      isSelected ? 'text-milk' : 'text-text-secondary'
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
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
                  <Pressable
                    key={opt.id}
                    onPress={() => setSpriteTemplate(opt.id)}
                    style={({ pressed }) => [
                      pressScale(pressed, 0.95),
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 12,
                        minHeight: 44,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: isSelected ? '#FFE8DC' : '#FAF6F0',
                        borderWidth: 1.5,
                        borderColor: isSelected ? '#FF8E53' : 'rgba(234,227,218,0.8)',
                      },
                      isSelected && {
                        shadowColor: '#FF8E53',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 2,
                      },
                    ]}
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
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Hood Location                                                    */}
        {/* ---------------------------------------------------------------- */}
        <View style={GROUP_CARD}>
          <Text className="text-sm font-bold text-text-secondary mb-xs font-sans">
            Hood / Location
          </Text>
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
            className="text-text-primary font-sans text-base"
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
          <Text className="text-sm font-bold text-text-secondary mb-xs font-sans">
            Notes
          </Text>
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
            className="text-text-primary font-sans text-base"
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
        {!capturedPhotoUri && <Pressable
          onPress={handleTakePhoto}
          style={({ pressed }) => [
            pressScale(pressed, 0.97),
            CARD_SHADOW,
            {
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              minHeight: 64,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              gap: 10,
              backgroundColor: hasPhoto ? '#FFE8DC' : '#FFFFFF',
              // Dashed border via borderStyle only works on Android; on iOS we
              // approximate it with a ginger border at reduced opacity
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: hasPhoto ? '#FF8E53' : 'rgba(234,227,218,0.9)',
            },
          ]}
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
        </Pressable>}

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
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            pressScale(pressed),
            CARD_SHADOW,
            {
              flex: 1,
              minHeight: 52,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(234,227,218,0.8)',
            },
          ]}
        >
          <Text className="text-text-secondary font-bold text-base font-sans">Cancel</Text>
        </Pressable>

        <Pressable
          onPress={handleSubmit}
          style={({ pressed }) => [
            pressScale(pressed, 0.96),
            BUTTON_SHADOW,
            {
              flex: 1,
              minHeight: 52,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 14,
              backgroundColor: pressed ? '#E67035' : '#FF8E53',
            },
          ]}
        >
          <Text className="text-milk font-bold text-base font-sans">Log Spotting</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
