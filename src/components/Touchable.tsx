/**
 * The app's one pressable. Everything tappable should be this.
 *
 * WHY IT EXISTS
 *
 * Originally, to work around NativeWind: its css-interop rebuilt the `style`
 * prop from the rules it collected, and a function — the idiomatic
 * `style={({ pressed }) => …}` — has no enumerable style keys, so the merge
 * contributed nothing and the interop then *replaced* the prop with what it
 * had built. The callback was silently discarded. Buttons lost their
 * backgrounds; absolutely-positioned actors lost `position`, `left` and
 * `width` and collapsed into flow layout.
 *
 * NativeWind is gone, so that reason has expired. This now exists for a better
 * one: a press should feel like something, and that feel should be the same
 * everywhere. One component means one answer.
 *
 * WHAT A PRESS DOES
 *
 * It springs. The scale is driven by Animated on the native driver rather than
 * by a `pressed` boolean in React state, which matters for more than smoothness
 * — a state-driven press re-renders the subtree on every touch, and in the Hood
 * that subtree can be a cat with a running sprite animation.
 *
 * `scaleTo` is the dial. Below 1 for things that press IN (most buttons); above
 * 1 for things that should jump toward you, like a cat you just tapped. Big
 * targets want a smaller excursion than small ones: 0.98 on a full-width card
 * reads the same as 0.9 on a 44pt icon, because what the eye registers is the
 * distance its edges move, not the ratio.
 *
 * `pressedStyle` is for the non-transform part — opacity, a background shift.
 * Passing `{}` opts out of feedback entirely, which is what a modal scrim
 * wants: a backdrop that flinches when you dismiss it reads as a button you
 * pressed by mistake.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, type PressableProps, type ViewStyle } from 'react-native';

/** Pressable that can take an animated transform. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Base style. Objects and arrays only — a function would be dropped. */
  style?: ViewStyle | (ViewStyle | false | null | undefined)[];
  /**
   * Extra style applied while held, for anything that is not the scale.
   * Pass `{}` to suppress all press feedback.
   */
  pressedStyle?: ViewStyle;
  /** Scale target while held. 1 disables the spring. */
  scaleTo?: number;
  children?: React.ReactNode;
}

export function Touchable({
  style,
  pressedStyle,
  scaleTo = 0.96,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...rest
}: TouchableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  // An explicit empty pressedStyle is the documented way to opt out, so it
  // suppresses the spring too rather than leaving half the feedback behind.
  const silent = pressedStyle !== undefined && Object.keys(pressedStyle).length === 0;
  const springs = !silent && !disabled && scaleTo !== 1;

  /**
   * Tracked only when there is a `pressedStyle` to apply, because that part
   * cannot be done on the native driver and so costs a re-render of the
   * subtree per touch. The scale — which is what nearly every call site
   * actually uses — stays on the driver and re-renders nothing.
   */
  const needsPressedState = !silent && !!pressedStyle && Object.keys(pressedStyle).length > 0;
  const [pressed, setPressed] = useState(false);

  const springTo = (toValue: number) => {
    if (!springs) return;
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      // Quick and only lightly springy. A press needs to answer immediately;
      // the bounce is seasoning, and at higher values it reads as wobble.
      speed: 40,
      bounciness: 14,
    }).start();
  };

  const styles = useMemo(() => {
    const base = Array.isArray(style) ? style : [style];
    // The transform goes last so it wins, and is the only transform any call
    // site sets here — press feedback belongs to this component.
    return [
      ...base,
      springs ? { transform: [{ scale }] } : null,
      pressed && needsPressedState ? pressedStyle : null,
    ];
  }, [style, pressedStyle, needsPressedState, pressed, springs, scale]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        springTo(scaleTo);
        if (needsPressedState) setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        if (needsPressedState) setPressed(false);
        onPressOut?.(e);
      }}
      style={styles as never}
    >
      {children}
    </AnimatedPressable>
  );
}
