/**
 * EnvironmentCard — Shop card for a single Environment preset.
 * Shows icon, name, spawn bonus tag, description, and cost/owned badge.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { EnvironmentPreset } from '../types';
import { pressScale, CARD_SHADOW } from '../utils/styles';

interface EnvironmentCardProps {
  env: EnvironmentPreset;
  isOwned: boolean;
  isActive: boolean;
  canAfford: boolean;
  onPress: () => void;
}

export function EnvironmentCard({
  env,
  isOwned,
  isActive,
  canAfford,
  onPress,
}: EnvironmentCardProps) {
  const isFree = env.cost === 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        pressScale(pressed, 0.96),
        CARD_SHADOW,
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? '#FF8E53' : 'rgba(234,227,218,0.7)',
        },
      ]}
    >
      {/* Icon bubble */}
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: '#FFE8DC',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text style={{ fontSize: 26 }}>{env.icon}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: '#2C2A29' }}
            numberOfLines={1}
          >
            {env.name}
          </Text>

          {/* Bonus tag */}
          <View
            style={{
              backgroundColor: '#F8D49B',
              borderRadius: 99,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400E' }}>
              {env.bonus_tag}
            </Text>
          </View>

          {/* Time-of-day pill */}
          {env.forced_time_of_day && (
            <View
              style={{
                backgroundColor: env.forced_time_of_day === 'night' ? '#1A1C29' : '#E0F6FF',
                borderRadius: 99,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: env.forced_time_of_day === 'night' ? '#FFFFFF' : '#0369A1',
                }}
              >
                {env.forced_time_of_day === 'night' ? '🌙 Night' : '☀️ Day'}
              </Text>
            </View>
          )}
        </View>

        <Text
          style={{ fontSize: 12, color: '#706B67', marginTop: 3 }}
          numberOfLines={2}
        >
          {env.description}
        </Text>
      </View>

      {/* Cost / status column */}
      <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {isActive ? (
          <View
            style={{
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
        ) : isOwned ? (
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
              backgroundColor: canAfford ? '#EDE9FE' : '#FAF6F0',
              borderRadius: 99,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: canAfford ? '#6D4FC2' : '#706B67',
              }}
            >
              🐾 {env.cost}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
