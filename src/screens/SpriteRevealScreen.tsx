import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HexColor } from '../utils/colorExtractor';
import { extractPaletteFromPhoto } from '../utils/photoColorExtractor';
import {
  matchSpriteToColors,
  getSpriteById,
  RARITY_STARS,
  PATTERN_LABELS,
  SPRITE_LIBRARY,
} from '../utils/spriteLibrary';
import { Touchable } from '../components/Touchable';
import { font, color, radius, shadow } from '../theme';

type RevealPhase = 'analyzing' | 'revealed';

export interface SpriteRevealScreenProps {
  capturedPhotoUri: string;
  onContinue: (spriteTemplateId: string, extractedColors: HexColor[]) => void;
  onBack: () => void;
}

// Eight sparkle dot positions relative to the card centre
const SPARKLES = [
  { top: -24, left: 40 },   { top: -16, right: 55 },
  { top: 60,  right: -18 }, { top: 140, right: -22 },
  { bottom: 60, right: -16 }, { bottom: 20, left: -20 },
  { top: 80,  left: -22 },  { top: 200, left: 30 },
];

export function SpriteRevealScreen({ capturedPhotoUri, onContinue, onBack }: SpriteRevealScreenProps) {
  const [phase, setPhase]     = useState<RevealPhase>('analyzing');
  const [spriteId, setSpriteId] = useState(SPRITE_LIBRARY[0]!.id);
  const [palette, setPalette]  = useState<HexColor[]>([]);

  // ── Analyzing phase ────────────────────────────────────────────────────────
  const scanRotate   = useRef(new Animated.Value(0)).current;
  const scanPulse    = useRef(new Animated.Value(0)).current;
  const analyzerAlpha = useRef(new Animated.Value(1)).current;

  // ── Reveal phase ───────────────────────────────────────────────────────────
  const glowAlpha    = useRef(new Animated.Value(0)).current;
  const burstScale   = useRef(new Animated.Value(1)).current;
  const burstAlpha   = useRef(new Animated.Value(0)).current;
  const cardScale    = useRef(new Animated.Value(0.55)).current;
  const cardAlpha    = useRef(new Animated.Value(0)).current;
  const headerGlow   = useRef(new Animated.Value(0)).current;
  const badgeSlide   = useRef(new Animated.Value(-24)).current;
  const badgeAlpha   = useRef(new Animated.Value(0)).current;
  const swatch0      = useRef(new Animated.Value(0)).current;
  const swatch1      = useRef(new Animated.Value(0)).current;
  const swatch2      = useRef(new Animated.Value(0)).current;
  const btnSlide     = useRef(new Animated.Value(28)).current;
  const btnAlpha     = useRef(new Animated.Value(0)).current;
  const sparkleAnims = useRef(SPARKLES.map(() => new Animated.Value(0))).current;

  // Start scanning loop immediately
  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(scanRotate, { toValue: 1, duration: 1300, useNativeDriver: true }),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scanPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(scanPulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    spin.start();
    pulse.start();
    return () => { spin.stop(); pulse.stop(); };
  }, [scanRotate, scanPulse]);

  // Run extraction on mount. Extraction itself is near-instant, so we hold the
  // "Cataloguing..." phase for a minimum beat — the reveal needs its drum roll.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [extracted] = await Promise.all([
        extractPaletteFromPhoto(capturedPhotoUri),
        new Promise<void>((r) => setTimeout(r, 1400)),
      ]);
      if (cancelled) return;
      const matched = matchSpriteToColors(extracted);
      setSpriteId(matched);
      setPalette(extracted);
      setPhase('revealed');
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire reveal animations when phase flips
  useEffect(() => {
    if (phase !== 'revealed') return;

    // 1. Fade out the analyzer overlay
    Animated.timing(analyzerAlpha, { toValue: 0, duration: 250, useNativeDriver: true }).start();

    // 2. Glow materialises behind card
    Animated.timing(glowAlpha, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    // 3. Burst ring expands and fades — set start values first
    burstScale.setValue(0.8);
    burstAlpha.setValue(0.7);
    Animated.parallel([
      Animated.timing(burstScale, { toValue: 2.8, duration: 500, useNativeDriver: true }),
      Animated.timing(burstAlpha, { toValue: 0,   duration: 500, useNativeDriver: true }),
    ]).start();

    // 4. Card springs in
    Animated.parallel([
      Animated.spring(cardScale, { toValue: 1, tension: 75, friction: 8, useNativeDriver: true }),
      Animated.timing(cardAlpha,  { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();

    // 5. Header breathing glow (loop)
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerGlow, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(headerGlow, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();

    // 6. "IDENTIFIED" badge slides down
    Animated.sequence([
      Animated.delay(240),
      Animated.parallel([
        Animated.spring(badgeSlide, { toValue: 0, tension: 90, friction: 9, useNativeDriver: true }),
        Animated.timing(badgeAlpha, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();

    // 7. Colour swatches pop in (staggered)
    [swatch0, swatch1, swatch2].forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(520 + i * 130),
        Animated.spring(anim, { toValue: 1, tension: 110, friction: 7, useNativeDriver: true }),
      ]).start();
    });

    // 8. CTA button slides up
    Animated.sequence([
      Animated.delay(940),
      Animated.parallel([
        Animated.spring(btnSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.timing(btnAlpha,  { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();

    // 9. Sparkles pop
    sparkleAnims.forEach((anim, i) => {
      Animated.sequence([
        Animated.delay(180 + i * 70),
        Animated.spring(anim, { toValue: 1, tension: 130, friction: 6, useNativeDriver: true }),
        Animated.delay(600),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const sprite       = getSpriteById(spriteId);
  const displayPalette = palette.length > 0 ? palette.slice(0, 3) : sprite.palette.slice(0, 3);
  const primaryColor = displayPalette[0] ?? '#FF8E53';
  const swatchAnims  = [swatch0, swatch1, swatch2];

  const spin = scanRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const handleContinue = useCallback(() => {
    onContinue(spriteId, displayPalette as HexColor[]);
  }, [onContinue, spriteId, displayPalette]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0E0A06' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0E0A06" />

      {/* ── Coloured radial glow ─────────────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: primaryColor, opacity: Animated.multiply(glowAlpha, new Animated.Value(0.22)) },
        ]}
      />

      <SafeAreaView style={{ flex: 1 }}>

        {/* Close button */}
        <Touchable
          onPress={onBack}
          scaleTo={0.88}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{
            position: 'absolute', top: 12, left: 16, zIndex: 20,
            width: 38, height: 38, borderRadius: 19,
            backgroundColor: 'rgba(255,255,255,0.10)',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15 }}>✕</Text>
        </Touchable>

        {/* ── Analyzing overlay ─────────────────────────────────────────── */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#0E0A06', opacity: analyzerAlpha,
              alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <Animated.Text style={{ fontSize: 60, transform: [{ rotate: spin }] }}>🐾</Animated.Text>
          <Animated.Text
            style={{ color: '#FFFFFF', fontSize: 19, fontFamily: font.bold, marginTop: 28, opacity: scanPulse }}
          >
            Cataloguing your cat...
          </Animated.Text>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 10, letterSpacing: 1.5 }}>
            EXTRACTING COLOUR SIGNATURE
          </Text>
        </Animated.View>

        {/* ── Reveal content ────────────────────────────────────────────── */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>

          {/* Burst ring */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 220, height: 220, borderRadius: 110,
              borderWidth: 2.5, borderColor: primaryColor,
              opacity: burstAlpha,
              transform: [{ scale: burstScale }],
            }}
          />

          {/* Rarity-scaled badge — rare finds get the gold treatment */}
          <Animated.View
            style={{
              opacity: badgeAlpha,
              transform: [{ translateY: badgeSlide }],
              marginBottom: 18,
            }}
          >
            <View
              style={{
                backgroundColor:
                  sprite.rarity === 'rare' ? '#E8B54A'
                  : sprite.rarity === 'uncommon' ? '#B08BD4'
                  : '#FF8E53',
                borderRadius: 99,
                paddingHorizontal: 18, paddingVertical: 7,
                ...(sprite.rarity === 'rare' && {
                  shadowColor: '#E8B54A',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.8,
                  shadowRadius: 12,
                  elevation: 8,
                }),
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontFamily: font.bold, letterSpacing: 3 }}>
                {sprite.rarity === 'rare' ? '★ RARE FIND ★'
                  : sprite.rarity === 'uncommon' ? 'UNCOMMON SPOTTING'
                  : 'CAT TYPE IDENTIFIED'}
              </Text>
            </View>
          </Animated.View>

          {/* ── The Card ──────────────────────────────────────────────── */}
          <Animated.View
            style={{
              opacity: cardAlpha,
              transform: [{ scale: cardScale }],
              width: 288,
              borderRadius: 26,
              overflow: 'hidden',
              shadowColor: primaryColor,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.55,
              shadowRadius: 24,
              elevation: 24,
            }}
          >
            {/* Sparkle dots — positioned relative to card */}
            {SPARKLES.map((pos, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute', ...pos,
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: primaryColor,
                  opacity: sparkleAnims[i],
                  transform: [{ scale: sparkleAnims[i] ?? new Animated.Value(0) }],
                  zIndex: 10,
                }}
              />
            ))}

            {/* Card header */}
            <View style={{ backgroundColor: primaryColor, height: 172, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 76 }}>🐱</Text>

              {/* Breathing white glow */}
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: '#FFFFFF',
                    opacity: headerGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.14] }),
                  },
                ]}
              />

              {/* Pattern chip top-right */}
              <View
                style={{
                  position: 'absolute', top: 12, right: 12,
                  backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 99,
                  paddingHorizontal: 10, paddingVertical: 4,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: font.bold, letterSpacing: 1.2 }}>
                  {PATTERN_LABELS[sprite.pattern].toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Card body */}
            <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22 }}>
              <Text style={{ fontSize: 23, fontFamily: font.bold, color: '#2C2A29', textAlign: 'center' }}>
                {sprite.label}
              </Text>

              <Text style={{ fontSize: 15, textAlign: 'center', marginTop: 2, letterSpacing: 1 }}>
                {RARITY_STARS[sprite.rarity]}
              </Text>

              <Text
                style={{
                  fontSize: 12, color: '#706B67', textAlign: 'center',
                  marginTop: 10, fontStyle: 'italic', lineHeight: 19,
                }}
              >
                "{sprite.description}"
              </Text>

              {/* Colour swatches */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 18 }}>
                {displayPalette.map((color, i) => (
                  <Animated.View
                    key={i}
                    style={{
                      width: 30, height: 30, borderRadius: 15,
                      backgroundColor: color,
                      borderWidth: 2.5, borderColor: '#EAE3DA',
                      transform: [{ scale: swatchAnims[i] ?? new Animated.Value(1) }],
                    }}
                  />
                ))}
              </View>

              <Text style={{ fontSize: 9, color: '#C0B8B0', textAlign: 'center', marginTop: 7, letterSpacing: 2 }}>
                SIGNATURE COLOURS
              </Text>
            </View>
          </Animated.View>

          {/* ── CTA button ─────────────────────────────────────────────── */}
          <Animated.View
            style={{
              opacity: btnAlpha,
              transform: [{ translateY: btnSlide }],
              width: 288, marginTop: 26,
            }}
          >
            <Touchable
              onPress={handleContinue}
              accessibilityRole="button"
              style={{
                backgroundColor: color.ginger,
                borderRadius: radius.lg - 4,
                paddingVertical: 18,
                alignItems: 'center',
                ...shadow.button,
              }}
            >
              <Text style={{ color: color.milk, fontFamily: font.bold, fontSize: 17, letterSpacing: 0.3 }}>
                Log This Sighting →
              </Text>
            </Touchable>
          </Animated.View>

        </View>
      </SafeAreaView>
    </View>
  );
}
