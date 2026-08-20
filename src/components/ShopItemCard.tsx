/**
 * ShopItemCard — Shop card for a single placeable Hood item.
 * Shows emoji, tier badge, name, spawn bonus, cost, and CTA.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Touchable } from './Touchable';
import { font, color, radius, shadow, space } from '../theme';
import type { ItemTier } from '../types';
import type { PlaceableItemDef } from '../utils/spawnCalculator';
import { pressScale, CARD_SHADOW } from '../utils/styles';

interface ShopItemCardProps {
  item: PlaceableItemDef;
  isOwned: boolean;
  canAfford: boolean;
  onPress: () => void;
}

const TIER_CONFIG: Record<ItemTier, { bg: string; text: string; label: string; ring: string }> = {
  common: {
    bg: '#FAF6F0',
    text: '#706B67',
    label: 'Common',
    ring: 'rgba(234,227,218,0.8)',
  },
  rare: {
    bg: '#EFF6FF',
    text: '#1D4ED8',
    label: 'Rare',
    ring: '#BFDBFE',
  },
  legendary: {
    bg: '#FEF9C3',
    text: '#92400E',
    label: 'Legendary ✦',
    ring: '#FDE68A',
  },
};

export function ShopItemCard({
  item,
  isOwned,
  canAfford,
  onPress,
}: ShopItemCardProps) {
  const tier = TIER_CONFIG[item.tier];
  const isFree = item.cost === 0;

  return (
    <Touchable
      onPress={onPress}
      disabled={isOwned}
      scaleTo={0.96}
      accessibilityRole="button"
      style={{
        backgroundColor: color.surface,
        borderRadius: radius.md + 2,
        padding: 14,
        marginBottom: space.sm + 2,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm + 4,
        borderWidth: 1,
        borderColor: tier.ring,
        ...shadow.card,
      }}
    >
      {/* Emoji bubble */}
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: tier.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 14, fontFamily: font.bold, color: '#2C2A29' }}>
            {item.label}
          </Text>
          {/* Tier badge */}
          <View
            style={{
              backgroundColor: tier.bg,
              borderRadius: 99,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: tier.ring,
            }}
          >
            <Text style={{ fontSize: 9, fontFamily: font.bold, color: tier.text }}>
              {tier.label.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Spawn bonus */}
        <Text style={{ fontSize: 12, color: '#FF8E53', fontFamily: font.medium, marginTop: 3 }}>
          +{item.spawn_bonus}% spawn chance
        </Text>
        <Text style={{ fontSize: 11, color: '#706B67', marginTop: 1 }}>
          Stack up to {item.max_stack}×
        </Text>
      </View>

      {/* Cost / status */}
      <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {isOwned ? (
          <View
            style={{
              backgroundColor: '#F0FDF4',
              borderRadius: 99,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: font.bold, color: '#16A34A' }}>
              {isFree ? 'Free' : '✓ Owned'}
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: canAfford ? '#FF8E53' : '#EAE3DA',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontFamily: font.bold,
                color: canAfford ? '#FFFFFF' : '#706B67',
              }}
            >
              {canAfford ? `🐾 ${item.cost}` : '🔒 ' + item.cost}
            </Text>
          </View>
        )}
      </View>
    </Touchable>
  );
}
