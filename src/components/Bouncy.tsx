import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export interface BouncyProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Scale target while pressed (default 0.95). Lower = springier. */
  scaleTo?: number;
  /** Style applied to the animated inner view (the visible "box"). */
  style?: StyleProp<ViewStyle>;
  /** Style applied to the outer Pressable — use for layout (width/flex/margin). */
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Pressable with a tactile spring on press — the "warm rounded mobile-game"
 * touch feel. Uses RN's built-in Animated (native driver) rather than
 * Reanimated, since the Reanimated babel plugin is not configured in this app.
 */
export function Bouncy({
  scaleTo = 0.95,
  style,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: BouncyProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const springTo = (toValue: number) =>
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 40,
      bounciness: 14,
    }).start();

  return (
    <Pressable
      style={containerStyle}
      onPressIn={(e) => {
        springTo(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        onPressOut?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
