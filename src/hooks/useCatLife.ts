/**
 * One cat's life in the Hood: what it is doing, and where it has got to.
 *
 * A cat alternates between two states.
 *
 *   SETTLED  front-facing, drawn from the action sheet, cycling flavour idles
 *   WALKING  drawn from the directional sheet, facing its direction of travel
 *
 * The state machine is a chain of timeouts rather than a per-frame update. At
 * six cats a requestAnimationFrame loop would be six JS callbacks every frame
 * for state that changes every few seconds — the same arithmetic that moved the
 * frame loop in CatSprite onto the native driver applies here, one level up.
 * Movement is a single native-driven Animated.Value per cat, so a cat crossing
 * its zone costs no JS at all between the two timeouts that start and end the
 * walk.
 *
 * WHY THE TWO SHEETS ARE NOT BOTH MOUNTED
 *
 * It is tempting to render both sprites and toggle opacity, which would make
 * the settled/walking switch seamless. It would also hold the directional
 * texture open for every cat on screen forever, which is the one thing the
 * two-sheet split exists to avoid. The switch happens at a standstill, between
 * a walk ending and an idle beginning, where a single frame of substitution is
 * invisible — so the cheap option is also the correct one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import type { ActAnimation, SpriteDirection } from '../assets/sprites';
import {
  actDuration,
  driftGeometry,
  driftTarget,
  facingFor,
  nextIdle,
  settleDuration,
  startupStagger,
  turnPath,
  TURN_STEP_MS,
} from '../utils/catBehaviour';

/** Where a cat is standing, relative to the placement the scene gave it. */
interface Spot {
  dx: number;
  dy: number;
  depth: number;
}

export type CatActivity =
  | { kind: 'settled'; animation: ActAnimation }
  /**
   * On the directional sheet. `animation` is 'walk' while travelling and
   * 'idle' while pivoting on the spot — a turning cat that plays a walk cycle
   * skates, because its feet are striding and its body is not moving.
   */
  | { kind: 'walking'; direction: SpriteDirection; animation: 'walk' | 'idle' };

export interface CatLifeInput {
  /** Seeds the whole schedule. Use the Hood's seed so a Hood replays. */
  seed: number;
  /** Which cat this is — the perch index. Staggers it against its neighbours. */
  slot: number;
  /** The cat's resting depth on the plane, 0 (far) … 1 (near). */
  baseDepth: number;
  /** Scene box, for converting plane fractions to points. */
  worldWidth: number;
  sceneHeight: number;
  /** Dozing cats do not wander. */
  asleep: boolean;
  /** Friend Hoods and unmeasured scenes hold still. */
  enabled: boolean;
}

/** One entry of a transform array, either a plain number or a driven value. */
type Translate =
  | { translateX: number | Animated.AnimatedInterpolation<number> }
  | { translateY: number | Animated.AnimatedInterpolation<number> };

export interface CatLife {
  activity: CatActivity;
  /** Transform for the actor box. Translation only — see the note on scale. */
  transform: Translate[];
  /** Paint order, which changes as a cat walks toward or away from the camera. */
  depth: number;
}

/**
 * Respects the OS "reduce motion" setting.
 *
 * A Hood is six independently animating sprites over a parallax backdrop, which
 * is a lot of simultaneous movement for anyone who has asked their device for
 * less of it. Reduced motion keeps the cats breathing — stillness would read as
 * a frozen app rather than as a considerate one — but stops them wandering and
 * stops the flourishes.
 */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value);
      })
      .catch(() => {
        // Not supported on every platform; assume full motion.
      });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}

const AT_REST: Spot = { dx: 0, dy: 0, depth: 0 };

export function useCatLife({
  seed,
  slot,
  baseDepth,
  worldWidth,
  sceneHeight,
  asleep,
  enabled,
}: CatLifeInput): CatLife {
  const reduceMotion = useReduceMotion();
  const canWander = enabled && !asleep && !reduceMotion && worldWidth > 0 && sceneHeight > 0;

  /**
   * Walk progress, 0 at the start of an excursion and 1 at the end. One value
   * drives both axes, so they cannot drift apart under load.
   */
  const progress = useRef(new Animated.Value(0)).current;

  const [activity, setActivity] = useState<CatActivity>({ kind: 'settled', animation: 'idle' });
  /** The excursion currently animating, or null while standing still. */
  const [leg, setLeg] = useState<{ from: Spot; to: Spot } | null>(null);
  const [depth, setDepth] = useState(baseDepth);

  /** Where the cat is standing right now. Survives effect restarts. */
  const spot = useRef<Spot>({ ...AT_REST, depth: baseDepth });
  /**
   * The same leg the state holds, readable from the effect's cleanup.
   *
   * The effect restarts whenever the scene is remeasured — a rotation, a
   * keyboard, a split-screen resize — and that can land in the middle of a
   * walk. Without this the animation stops where it is, the cleanup has no way
   * to know a walk was in flight, and the cat ends up drawn at a position the
   * logic believes it never reached: the next excursion then snaps it back.
   */
  const legRef = useRef<{ from: Spot; to: Spot } | null>(null);

  useEffect(() => {
    if (asleep) setActivity({ kind: 'settled', animation: 'sleep' });
  }, [asleep]);

  useEffect(() => {
    if (!enabled || asleep) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;
    let previousIdle: ActAnimation | undefined;
    /** Which way the cat is pointing. Only the turn routine writes this. */
    let facing: SpriteDirection = 'S';
    /** Milliseconds of idling since the last excursion. */
    let rested = 0;
    /** How long this cat is content to stay put before wandering again. */
    let patience = settleDuration(seed, slot, 0);

    const after = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    /** Play one flavour idle, then decide whether to stay or move. */
    const beat = () => {
      /**
       * Reduced motion means reduced motion. A cat still breathes — stillness
       * reads as a frozen app rather than a considerate one — but it does not
       * groom, yawn, flick or glance, and it does not go anywhere.
       */
      const animation = reduceMotion ? 'idle' : nextIdle(seed, slot, index, previousIdle);
      previousIdle = animation;
      index += 1;
      setActivity({ kind: 'settled', animation });

      const hold = actDuration(animation);
      rested += hold;

      after(hold, () => {
        // Wander only once the cat has genuinely settled for a while, so an
        // excursion reads as a decision rather than as restlessness. Measuring
        // it in time rather than in beats keeps the rest the same length
        // whether the cat filled it with one yawn or four blinks.
        if (canWander && rested >= patience) startWalk();
        else beat();
      });
    };

    const startWalk = () => {
      const target = driftTarget(seed, slot, index);
      const from = spot.current;

      /**
       * The destination is measured from the cat's ORIGINAL placement, never
       * from where it currently stands. Chaining offsets turns the schedule
       * into a random walk, and a run of same-signed targets will carry a cat
       * clean off the plane over a few minutes.
       */
      const geometry = driftGeometry(baseDepth, target.dDepth, sceneHeight);
      const to: Spot = {
        dx: target.du * worldWidth,
        dy: geometry.dy,
        depth: geometry.depth,
      };

      const travelX = to.dx - from.dx;
      const travelY = to.dy - from.dy;

      // A cat that has barely moved has no direction of travel worth facing,
      // and a two-pixel walk cycle reads as a twitch.
      if (Math.hypot(travelX, travelY) < 3) {
        rested = 0;
        patience = settleDuration(seed, slot, index);
        index += 1;
        beat();
        return;
      }

      legRef.current = { from, to };
      const heading = facingFor(travelX, travelY, facing);

      setLeg({ from, to });
      // Take the nearer of the two depths for the whole walk. Paint order
      // cannot be animated, so it has to be wrong for half the journey either
      // way; a cat passing IN FRONT of something reads as a cat, while one
      // clipped through a flower pot reads as a bug.
      setDepth(Math.max(from.depth, to.depth));

      // Pivot to face the way it is about to go, THEN set off.
      turn(heading, () => travel(target.durationMs, to));
    };

    /**
     * Steps the cat through the intervening facings, then runs `done`.
     *
     * Each step is a frame of art that already exists on the directional
     * sheet, so a turn costs nothing but the timer. The cat plays idle
     * throughout — it is pivoting, not travelling.
     */
    const turn = (to: SpriteDirection, done: () => void) => {
      // slot + index so neighbours break an about-face tie differently, and
      // the same cat does not always spin the same way.
      const path = turnPath(facing, to, slot + index);

      const stepThrough = (i: number) => {
        if (i >= path.length) {
          facing = to;
          done();
          return;
        }
        facing = path[i]!;
        setActivity({ kind: 'walking', direction: facing, animation: 'idle' });
        after(TURN_STEP_MS, () => stepThrough(i + 1));
      };

      stepThrough(0);
    };

    const travel = (durationMs: number, to: Spot) => {
      setActivity({ kind: 'walking', direction: facing, animation: 'walk' });

      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        // Linear on purpose. The walk cycle carries its own weight in its frame
        // timings; easing the translation on top makes the feet skate at both
        // ends, which is the classic tell of motion bolted onto an animation
        // rather than derived from it.
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (cancelled || !finished) return;
        spot.current = to;
        legRef.current = null;
        setLeg(null);
        setDepth(to.depth);
        rested = 0;
        patience = settleDuration(seed, slot, index);
        index += 1;

        /**
         * Turn back to face the player before settling.
         *
         * Not decoration: the flavour idles live on the front-facing action
         * sheet, so a cat that arrived facing east has nothing to groom with
         * until it turns round. Settling without the pivot would snap it to
         * front on the same frame it swaps texture, which is the exact pop
         * this turn exists to remove — just at the other end of the journey.
         */
        turn('S', beat);
      });
    };

    after(startupStagger(slot), beat);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      progress.stopAnimation();

      // Finish any walk in flight on paper, so the cat's recorded position
      // matches where it is actually drawn. Leaving a half-finished leg behind
      // means the next excursion starts by teleporting it back to where this
      // one began.
      if (legRef.current) {
        spot.current = legRef.current.to;
        legRef.current = null;
        setLeg(null);
      }
    };
  }, [
    seed,
    slot,
    baseDepth,
    worldWidth,
    sceneHeight,
    asleep,
    enabled,
    canWander,
    reduceMotion,
    progress,
  ]);

  /**
   * Translation only — scale is deliberately absent.
   *
   * Depth ought to drive scale as well as position, and over the full plane it
   * does: the scene sizes each actor box from its placement. But a wander zone
   * spans 0.055 of the plane's depth, which is 2.6% of sprite size — under
   * three pixels on a 104pt cat, and below the threshold where anyone reads it
   * as perspective. Animating it would cost a second interpolation plus a
   * compensating offset on every frame, because a transform scales about the
   * box centre and would otherwise lift the cat's feet off the ground. Paying
   * that for an invisible 3px is the wrong trade; the vertical travel, which is
   * perfectly visible, is what sells the depth change.
   */
  const transform = useMemo<Translate[]>(() => {
    if (!leg) {
      const rest = spot.current;
      return [{ translateX: rest.dx }, { translateY: rest.dy }];
    }

    const inputRange = [0, 1];
    return [
      {
        translateX: progress.interpolate({
          inputRange,
          outputRange: [leg.from.dx, leg.to.dx],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange,
          outputRange: [leg.from.dy, leg.to.dy],
        }),
      },
    ];
  }, [leg, progress]);

  return { activity, transform, depth };
}
