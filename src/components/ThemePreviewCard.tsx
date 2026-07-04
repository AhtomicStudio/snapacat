/**
 * ThemePreviewCard — Shop card for a single cosmetic Theme.
 * Shows gradient swatch, name, description, cost/owned badge, and unlock CTA.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Theme } from '../types';
import { pressScale, CARD_SHADOW } from '../utils/styles';

interface ThemePreviewCardProps {
  theme: Theme;
  isOwned: boolean;
  isActive: boolean;
  canAfford: boolean;
  onPress: () => void;
}

/** Tier-colour map for the cost badge — themes use a purple/gold accent. */
const COST_BADGE_BG = '#EDE9FE'; // soft lavender
const COST_BADGE_TEXT = '#6D4FC2';

export function ThemePreviewCard({
  theme,
  isOwned,
  isActive,
  canAfford,
  onPress,
}: ThemePreviewCardProps) {
  const isFree = theme.cost === 0;

  return (
    <Pressable
      onPress={onPress}
      disabled={isActive}
      style={({ pressed }) => [
        pressScale(pressed, 0.96),
        CARD_SHADOW,
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 12,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? '#FF8E53' : 'rgba(234,227,218,0.7)',
        },
      ]}
    >
      {/* Gradient swatch — two-tone approximation via layered Views */}
      <View
        style={{
          height: 88,
          backgroundColor: theme.preview_gradient[0],
          overflow: 'hidden',
        }}
      >
        {/* Bottom half tint */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '50%',
            backgroundColor: theme.preview_gradient[1],
            opacity: 0.75,
          }}
        />
        {/* Icon */}
        <Text
          style={{
            position: 'absolute',
            bottom: 10,
            left: 14,
            fontSize: 28,
          }}
        >
          {theme.icon}
        </Text>

        {/* Active check ring */}
        {isActive && (
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: '#FF8E53',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>✓</Text>
          </View>
        )}
      </View>

      {/* Body */}
      <View style={{ padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: '#2C2A29', flex: 1 }}
            numberOfLines={1}
          >
            {theme.name}
          </Text>

          {/* Cost / owned badge */}
          {isOwned ? (
            <View
              style={{
                backgroundColor: '#F0FDF4',
                borderRadius: 99,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#16A34A' }}>
                {isFree ? 'Free' : 'Owned'}
              </Text>
            </View>
          ) : (
            <View
              style={{
                backgroundColor: canAfford ? COST_BADGE_BG : '#FAF6F0',
                borderRadius: 99,
                paddingHorizontal: 10,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: canAfford ? COST_BADGE_TEXT : '#706B67',
                }}
              >
                🐾 {theme.cost}
              </Text>
            </View>
          )}
        </View>

        <Text
          style={{ fontSize: 12, color: '#706B67', marginTop: 4 }}
          numberOfLines={2}
        >
          {theme.description}
        </Text>

        {/* CTA */}
        {!isOwned && (
          <View
            style={{
              marginTop: 10,
              backgroundColor: canAfford ? '#FF8E53' : '#EAE3DA',
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: canAfford ? '#FFFFFF' : '#706B67',
              }}
            >
              {canAfford ? 'Unlock Theme' : 'Not enough 🐾'}
            </Text>
          </View>
        )}

        {isOwned && !isActive && (
          <View
            style={{
              marginTop: 10,
              backgroundColor: '#FFE8DC',
              borderRadius: 10,
              paddingVertical: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#E67035' }}>
              Apply Theme
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
