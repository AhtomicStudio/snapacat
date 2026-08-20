/**
 * A Pressable that never hands React Native a function-form `style`.
 *
 * WHY THIS EXISTS
 *
 * NativeWind v4 routes every core component through react-native-css-interop,
 * which rebuilds the `style` prop from the rules it collects off the original.
 * `collectInlineRules` understands objects and arrays; anything else falls
 * through to `normal.push(style)` and is later merged as though it were a style
 * object. A function has no enumerable style keys, so the merge contributes
 * nothing — and because the interop *replaces* the prop with what it built, the
 * original callback is discarded. No warning, no error.
 *
 * The result is that `style={({ pressed }) => …}` silently renders unstyled.
 * That is the idiomatic Pressable API, so the failure was everywhere at once:
 * buttons lost their backgrounds, absolutely-positioned actors lost `position`,
 * `left` and `width` and collapsed into flow layout.
 *
 * The fix is to track `pressed` ourselves and pass a plain array, which the
 * interop handles correctly.
 *
 * If NativeWind is ever removed, or fixes this, `Touchable` can collapse back
 * into `Pressable` — but the API here is a superset, so nothing needs to change
 * at the call sites.
 */

import React, { useState } from 'react';
import { Pressable, type PressableProps, type ViewStyle } from 'react-native';

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Base style. Objects and arrays only — a function would be dropped. */
  style?: ViewStyle | (ViewStyle | false | null | undefined)[];
  /** Applied on top while held. Defaults to a scale + opacity nudge. */
  pressedStyle?: ViewStyle;
  /** Scale target while held. Ignored when `pressedStyle` is given. */
  scaleTo?: number;
  children?: React.ReactNode;
}

export function Touchable({
  style,
  pressedStyle,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: TouchableProps) {
  const [pressed, setPressed] = useState(false);

  const feedback: ViewStyle =
    pressedStyle ?? { transform: [{ scale: scaleTo }], opacity: 0.88 };

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[...(Array.isArray(style) ? style : [style]), pressed ? feedback : null]}
    >
      {children}
    </Pressable>
  );
}
