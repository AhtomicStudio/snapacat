import React from 'react';
import { View, type DimensionValue } from 'react-native';

/**
 * A soft radial patch, for the low-frequency mottling that stops a large flat
 * surface reading as a slab.
 *
 * WHY IT IS BUILT THIS WAY
 *
 * There is no gradient primitive in this app and no blur without pulling in a
 * dependency, so the obvious move is a big rounded View at low opacity. That
 * does not work, and it took shipping it twice to see why: a View with a
 * border radius is a FLAT FILL with a HARD EDGE. There is no falloff inside
 * it. Make it small and you get a visible disc; make it enormous so the edge
 * leaves the viewport and you get a uniform tint over everything, which is
 * not variation at all — it is just a different flat colour.
 *
 * The edge is the whole problem, and it cannot be softened. So the falloff is
 * built instead: concentric rounded Views, each inset a little further, each
 * at a fraction of the target opacity. Alpha accumulates toward the middle,
 * and the outermost ring is faint enough that its edge is below the threshold
 * where the eye finds a contour. Seven rings is the point where the steps stop
 * being visible against these palettes; below five you can count them.
 *
 * Cost is `rings` views per patch, all static, no layout work.
 */
export function SoftBlob({
  left, top, width, height, colour, peak, rings = 7,
}: {
  left: DimensionValue;
  top: DimensionValue;
  /** Patch size in points. Needs to be numeric — the insets are computed. */
  width: number;
  height: number;
  colour: string;
  /** Opacity at the centre, once all the rings have stacked up. */
  peak: number;
  rings?: number;
}) {
  const each = peak / rings;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top, width, height }}>
      {Array.from({ length: rings }, (_, i) => {
        const f = i / rings;
        const insetX = (width * f) / 2;
        const insetY = (height * f) / 2;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: insetX,
              top: insetY,
              width: width - insetX * 2,
              height: height - insetY * 2,
              borderRadius: 999,
              backgroundColor: colour,
              opacity: each,
            }}
          />
        );
      })}
    </View>
  );
}
