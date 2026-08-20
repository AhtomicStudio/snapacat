import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Touchable } from '../components/Touchable';
import { color, space, fontSize, weight, TAP_MIN } from '../theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Cat, ScrapbookEntry } from '../types';
import { getSpriteTemplateColors } from '../utils/colorExtractor';
import { getTimeSince } from '../utils/socialUtils';
import { CARD_SHADOW, HIT_SLOP_MD, pressScale } from '../utils/styles';

export interface ScrapbookScreenProps {
  cat: Cat;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Gender config
// ---------------------------------------------------------------------------

const GENDER_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  male:    { label: '♂ Male',    bg: '#DBEAFE', text: '#1D4ED8' },
  female:  { label: '♀ Female',  bg: '#FCE7F3', text: '#9D174D' },
  unknown: { label: '🐾 Unknown', bg: '#FAF6F0', text: '#706B67' },
};

// ---------------------------------------------------------------------------
// ScrapbookScreen
// ---------------------------------------------------------------------------

export function ScrapbookScreen({ cat, onBack }: ScrapbookScreenProps) {
  const palette = useMemo(() => {
    const lastEntry = cat.scrapbook[cat.scrapbook.length - 1];
    if (lastEntry?.extracted_colors?.length) return lastEntry.extracted_colors;
    return getSpriteTemplateColors(cat.sprite_template_id);
  }, [cat]);

  const entries = useMemo(
    () =>
      [...cat.scrapbook].sort(
        (a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0),
      ),
    [cat.scrapbook],
  );

  const genderCfg = GENDER_CONFIG[cat.gender] ?? GENDER_CONFIG.unknown!;

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
        <Touchable
          onPress={onBack}
          hitSlop={HIT_SLOP_MD}
          accessibilityRole="button"
          accessibilityLabel="Back to the Cat-a-log"
          style={{
            padding: space.sm,
            minWidth: TAP_MIN,
            minHeight: TAP_MIN,
            justifyContent: 'center',
            alignItems: 'center',
            marginLeft: -space.sm,
          }}
        >
          <Text style={{ color: color.ginger, fontWeight: weight.bold, fontSize: fontSize.lg }}>←</Text>
        </Touchable>
        <View>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#2C2A29' }}>{cat.name}</Text>
          <Text style={{ fontSize: 12, color: '#706B67', marginTop: 1 }}>Scrapbook</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      >
        {/* Cat hero card */}
        <View
          style={[
            CARD_SHADOW,
            {
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 24,
              marginBottom: 24,
              alignItems: 'center',
            },
          ]}
        >
          {/* Avatar bubble */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: '#FFE8DC',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <Text style={{ fontSize: 44 }}>🐱</Text>
          </View>

          <Text style={{ fontSize: 24, fontWeight: '800', color: '#2C2A29', marginBottom: 8 }}>
            {cat.name}
          </Text>

          {/* Gender badge */}
          <View
            style={{
              backgroundColor: genderCfg.bg,
              borderRadius: 99,
              paddingHorizontal: 14,
              paddingVertical: 5,
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: genderCfg.text }}>
              {genderCfg.label}
            </Text>
          </View>

          {/* Signature colour palette */}
          <Text style={{ fontSize: 11, color: '#706B67', marginBottom: 10 }}>
            Signature colours
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {palette.map((color, i) => (
              <View
                key={`${cat.cat_id}-pal-${i}`}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: color,
                  shadowColor: color,
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.35,
                  shadowRadius: 6,
                  elevation: 3,
                }}
              />
            ))}
          </View>

          {/* Note count pill */}
          <View
            style={{
              marginTop: 18,
              backgroundColor: '#FAF6F0',
              borderRadius: 99,
              paddingHorizontal: 16,
              paddingVertical: 7,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2A29' }}>
              {entries.length === 0
                ? 'No Field Notes yet'
                : `${entries.length} Field Note${entries.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        </View>

        {/* Field notes timeline */}
        {entries.length > 0 ? (
          <>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C2A29', marginBottom: 14 }}>
              Field Notes
            </Text>
            {entries.map((entry) => (
              <FieldNoteCard key={entry.sighting_id} entry={entry} />
            ))}
          </>
        ) : (
          <View
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 32,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(255,142,83,0.3)',
                borderStyle: 'dashed',
              },
            ]}
          >
            <Text style={{ fontSize: 38, marginBottom: 12 }}>📓</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2A29' }}>
              Nothing written yet
            </Text>
            <Text
              style={{ fontSize: 12, color: '#706B67', marginTop: 6, textAlign: 'center', lineHeight: 18 }}
            >
              Log your first Field Note for {cat.name} to start this scrapbook.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// FieldNoteCard
// ---------------------------------------------------------------------------

function FieldNoteCard({ entry }: { entry: ScrapbookEntry }) {
  const timeStr = entry.timestamp?.seconds ? getTimeSince(entry.timestamp.seconds) : '—';

  return (
    <View
      style={[
        CARD_SHADOW,
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          padding: 16,
          marginBottom: 12,
          borderLeftWidth: 3,
          borderLeftColor: '#FF8E53',
        },
      ]}
    >
      {/* Meta row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ fontSize: 13 }}>📍</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#2C2A29' }}>
            {entry.hood_name || 'Unknown location'}
          </Text>
        </View>
        <Text style={{ fontSize: 11, color: '#706B67' }}>{timeStr}</Text>
      </View>

      {/* Note text */}
      <Text
        style={{
          fontSize: 13,
          color: '#2C2A29',
          lineHeight: 20,
          marginBottom: entry.extracted_colors?.length ? 12 : 0,
        }}
      >
        "{entry.note_text || 'A quiet little sighting.'}"
      </Text>

      {/* Colour swatches */}
      {entry.extracted_colors?.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {entry.extracted_colors.map((color, i) => (
            <View
              key={`${entry.sighting_id}-c-${i}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: color,
                borderWidth: 1,
                borderColor: 'rgba(234,227,218,0.8)',
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
