/**
 * The Hood's controls, in a sheet that stays out of the way.
 *
 * The old Hood stacked three cards under the scene: a spawn meter, an
 * attraction list, and an item tray. They were permanently on screen, they were
 * taller than the scene, and they turned the game into a form. Everything they
 * did still needs doing — you have to be able to put a bowl down — but it needs
 * to be somewhere you go, not somewhere you are.
 *
 * Two snap points, no in-between:
 *
 *   collapsed — a peek strip with a handle and one line of prose
 *   expanded  — the decorating drawer
 *
 * Deliberately no third "half" detent. Detents are a cost every time you drag,
 * and there is nothing here that wants a middle size.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';
import { Touchable } from './Touchable';

export const SHEET_PEEK_HEIGHT = 96;

export interface HoodSheetProps {
  /** Total height of the sheet when open. */
  height: number;
  /** Height of the strip left visible when closed. */
  peekHeight?: number;
  expanded: boolean;
  onChange: (expanded: boolean) => void;
  /** Always visible. Tapping it toggles the sheet. */
  peek: React.ReactNode;
  /** Revealed when expanded. */
  children: React.ReactNode;
  /** Sheet surface colour. */
  background?: string;
}

export function HoodSheet({
  height,
  peekHeight = SHEET_PEEK_HEIGHT,
  expanded,
  onChange,
  peek,
  children,
  background = '#FAF6F0',
}: HoodSheetProps) {
  const closedOffset = Math.max(0, height - peekHeight);

  const offset = useRef(new Animated.Value(closedOffset)).current;
  /** Where the sheet settled last. Drags are relative to this, not to zero. */
  const settled = useRef(closedOffset);
  /**
   * PanResponder is built once and closes over its initial props. Reading the
   * live values through refs is what keeps dragging correct after a rotation or
   * a content-height change — without this the sheet snaps to a stale offset.
   */
  const closedRef = useRef(closedOffset);
  const onChangeRef = useRef(onChange);
  closedRef.current = closedOffset;
  onChangeRef.current = onChange;

  const settleTo = (target: number) => {
    settled.current = target;
    Animated.spring(offset, {
      toValue: target,
      tension: 68,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  // React to controlled changes (including ones this sheet requested itself —
  // animating to a target we're already heading for is harmless).
  useEffect(() => {
    settleTo(expanded ? 0 : closedOffset);
    // settleTo is stable in behaviour; offset is a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, closedOffset]);

  const pan = useRef(
    PanResponder.create({
      // Only claim the gesture once it is clearly vertical, so horizontal
      // scrolling inside the drawer still works.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.4,
      onPanResponderMove: (_e, g) => {
        const next = Math.min(closedRef.current, Math.max(0, settled.current + g.dy));
        offset.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const closed = closedRef.current;
        // Project the flick forward rather than going on position alone: a
        // short fast swipe should open the sheet even though it barely moved.
        const projected = settled.current + g.dy + g.vy * 120;
        const target = projected > closed / 2 ? closed : 0;
        settleTo(target);
        onChangeRef.current(target === 0);
      },
      onPanResponderTerminate: () => settleTo(settled.current),
    }),
  ).current;

  return (
    <>
      {/*
       * Tap anywhere off the drawer to close it.
       *
       * Without this the only ways out were dragging it back down or finding
       * the peek strip — which is the one part of the drawer the open drawer
       * is sitting on top of. Every other sheet in the app dismisses on a tap
       * outside; this was the exception, and it is the one you open most.
       *
       * The dim rides the same offset the sheet does, so it tracks a drag
       * rather than snapping when the gesture ends. pointerEvents cannot be
       * animated, so it follows the controlled prop instead, which is right in
       * the only case that matters: mid-drag the finger is already on the
       * sheet.
       */}
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: '#2C2A29',
          opacity: offset.interpolate({
            inputRange: [0, Math.max(1, closedOffset)],
            outputRange: [0.38, 0],
            extrapolate: 'clamp',
          }),
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={() => onChange(false)}
          accessibilityRole="button"
          accessibilityLabel="Close the decorating drawer"
        />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height,
          transform: [{ translateY: offset }],
          backgroundColor: background,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          shadowColor: '#2C2A29',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.16,
          shadowRadius: 18,
          elevation: 16,
        }}
      >
        {/* Grab area — drag anywhere on the peek, or tap it to toggle */}
        <View {...pan.panHandlers}>
          <Touchable
            onPress={() => onChange(!expanded)}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Close the decorating drawer' : 'Open the decorating drawer'}
            style={{ paddingTop: 10 }}
          >
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: '#DED6CB',
                alignSelf: 'center',
              }}
            />
            <View style={{ minHeight: peekHeight - 14, justifyContent: 'center' }}>{peek}</View>
          </Touchable>
        </View>

        {children}
      </Animated.View>
    </>
  );
}
