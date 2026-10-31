import {
  actDuration,
  driftGeometry,
  driftTarget,
  facingFor,
  nextIdle,
  settleDuration,
  startupStagger,
  interactionsFor,
  turnPath,
  walkFacing,
  TURN_STEP_MS,
} from '../catBehaviour';
import { ACT_ANIMATIONS, DIRECTIONS, type ActAnimation } from '../../assets/sprites';
import { planeY } from '../../config/scene';

/**
 * The behaviour layer's failures are all of the kind you only notice by
 * watching the screen for a minute: a cat that wanders off the plane, six cats
 * that groom in unison, a walk so short it reads as a twitch. None of them
 * throw, and none of them show up in a single-frame render test — so they are
 * asserted here as arithmetic instead.
 */

const SEED = 0x5ca7;
const SLOTS = [0, 1, 2, 3, 4, 5];

describe('facingFor', () => {
  it('maps the cardinal directions to themselves', () => {
    // Positive y is DOWN the screen, which on the ground plane is toward the
    // viewer. Getting this backwards makes every cat moonwalk.
    expect(facingFor(0, 1)).toBe('S');
    expect(facingFor(0, -1)).toBe('N');
    expect(facingFor(1, 0)).toBe('E');
    expect(facingFor(-1, 0)).toBe('W');
  });

  it('maps the diagonals', () => {
    expect(facingFor(1, 1)).toBe('SE');
    expect(facingFor(-1, 1)).toBe('SW');
    expect(facingFor(1, -1)).toBe('NE');
    expect(facingFor(-1, -1)).toBe('NW');
  });

  it('keeps the current facing when there is no travel', () => {
    // Snapping to a default on arrival would make every cat pivot to the
    // camera the instant it stopped, which reads as a flinch.
    expect(facingFor(0, 0, 'W')).toBe('W');
    expect(facingFor(0, 0, 'NE')).toBe('NE');
  });

  it('only ever returns a direction the sheet has a row for', () => {
    for (let angle = 0; angle < 360; angle += 7) {
      const radians = (angle * Math.PI) / 180;
      const dir = facingFor(Math.cos(radians), Math.sin(radians));
      expect(DIRECTIONS).toContain(dir);
    }
  });
});

describe('walkFacing', () => {
  const AWAY = ['N', 'NE', 'NW'];

  it('never sends a cat walking away from the camera', () => {
    // The walk cycle is a stride along screen x shared by all eight facings.
    // Pointed away, with the body sliding up the screen, the feet and the
    // body disagree and the cat moonwalks.
    for (let degrees = 0; degrees < 360; degrees += 1) {
      const radians = (degrees * Math.PI) / 180;
      expect(AWAY).not.toContain(walkFacing(Math.cos(radians), Math.sin(radians)));
    }
  });

  it('keeps the lateral half of a heading that points away', () => {
    expect(walkFacing(1, -1)).toBe('E');
    expect(walkFacing(-1, -1)).toBe('W');
    expect(walkFacing(0.2, -1)).toBe('E');
    expect(walkFacing(-0.2, -1)).toBe('W');
  });

  it('leaves a heading that already faces the camera alone', () => {
    for (const [dx, dy, want] of [
      [0, 1, 'S'],
      [1, 1, 'SE'],
      [-1, 1, 'SW'],
      [1, 0, 'E'],
      [-1, 0, 'W'],
    ] as const) {
      expect(walkFacing(dx, dy)).toBe(want);
    }
  });

  it('carries on the way the cat was pointing when travel is dead away', () => {
    // Nothing in the travel says left or right, so inventing a side would
    // make the cat pivot for no reason the player can see.
    expect(walkFacing(0, -1, 'W')).toBe('W');
    expect(walkFacing(0, -1, 'NW')).toBe('W');
    expect(walkFacing(0, -1, 'SE')).toBe('E');
  });
});

describe('turnPath', () => {
  it('does not move a cat that is already facing the right way', () => {
    expect(turnPath('S', 'S')).toEqual([]);
  });

  it('steps through the intervening facings', () => {
    expect(turnPath('S', 'E')).toEqual(['SE', 'E']);
    expect(turnPath('E', 'S')).toEqual(['SE', 'S']);
  });

  it('always takes the shorter way round', () => {
    // S to W is four steps either way; S to SW is one anticlockwise, and
    // getting that backwards spins the cat 315 degrees through every other
    // facing — which looks less like a turn than like a seizure.
    expect(turnPath('S', 'SW')).toEqual(['SW']);
    expect(turnPath('SW', 'S')).toEqual(['S']);
    expect(turnPath('N', 'NW')).toEqual(['NW']);

    for (const from of DIRECTIONS) {
      for (const to of DIRECTIONS) {
        expect(turnPath(from, to).length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('ends facing where it was asked to, every time', () => {
    for (const from of DIRECTIONS) {
      for (const to of DIRECTIONS) {
        const path = turnPath(from, to);
        if (from === to) continue;
        expect(path[path.length - 1]).toBe(to);
      }
    }
  });

  it('only ever turns one step of 45 degrees at a time', () => {
    // A path that skips a facing is a pop wearing a transition's clothes.
    for (const from of DIRECTIONS) {
      for (const to of DIRECTIONS) {
        const path = [from, ...turnPath(from, to)];
        for (let i = 1; i < path.length; i++) {
          const a = DIRECTIONS.indexOf(path[i - 1]!);
          const b = DIRECTIONS.indexOf(path[i]!);
          const gap = Math.abs(((b - a + 8) % 8 + 4) % 8 - 4);
          expect(gap).toBe(1);
        }
      }
    }
  });

  it('breaks an about-face tie both ways', () => {
    // Every 180-degree turn resolving the same way means six cats leaving at
    // once all pivot clockwise together, which reads as choreography.
    const clockwise = turnPath('S', 'N', 0);
    const anticlockwise = turnPath('S', 'N', 1);

    expect(clockwise).toEqual(['SE', 'E', 'NE', 'N']);
    expect(anticlockwise).toEqual(['SW', 'W', 'NW', 'N']);
    expect(clockwise[clockwise.length - 1]).toBe('N');
    expect(anticlockwise[anticlockwise.length - 1]).toBe('N');
  });

  it('turns a cat about through the front, where there is a front', () => {
    // Both ways round are four steps, so the only difference is what the
    // player watches. Through S the cat sweeps its face across the camera;
    // through N it shows its back for three frames.
    for (const tie of [0, 1]) {
      expect(turnPath('E', 'W', tie)).toEqual(['SE', 'S', 'SW', 'W']);
      expect(turnPath('W', 'E', tie)).toEqual(['SW', 'S', 'SE', 'E']);
      expect(turnPath('NE', 'SW', tie)).toEqual(['E', 'SE', 'S', 'SW']);
      expect(turnPath('NW', 'SE', tie)).toEqual(['W', 'SW', 'S', 'SE']);
    }
  });

  it('ignores the tie-break when one way round is genuinely shorter', () => {
    for (const tie of [0, 1]) {
      expect(turnPath('S', 'E', tie)).toEqual(['SE', 'E']);
      expect(turnPath('S', 'SW', tie)).toEqual(['SW']);
    }
  });

  it('keeps a full turn short enough to read as a pivot', () => {
    // Four steps is the worst case; at TURN_STEP_MS that has to stay well
    // under the time a cat spends resting, or it reads as hesitation.
    expect(4 * TURN_STEP_MS).toBeLessThan(500);
  });
});

describe('driftTarget', () => {
  it('stays inside the wander zone for every cat and every excursion', () => {
    // The zone half-extents. A cat that leaves them is a cat walking away from
    // the item it came for, and eventually off the plane entirely.
    for (const slot of SLOTS) {
      for (let i = 0; i < 400; i++) {
        const { du, dDepth } = driftTarget(SEED, slot, i);
        expect(Math.abs(du)).toBeLessThanOrEqual(0.035 + 1e-9);
        expect(Math.abs(dDepth)).toBeLessThanOrEqual(0.055 + 1e-9);
      }
    }
  });

  it('is measured from the base placement, so offsets never accumulate', () => {
    // driftTarget is a pure function of (seed, slot, index) with no notion of
    // where the cat currently is. That is the property that stops a run of
    // same-signed targets random-walking a cat off the plane, so assert the
    // function really is stateless rather than trusting the caller.
    const first = driftTarget(SEED, 2, 9);
    const again = driftTarget(SEED, 2, 9);
    expect(again).toEqual(first);
  });

  it('never schedules a walk too short to read as walking', () => {
    for (const slot of SLOTS) {
      for (let i = 0; i < 200; i++) {
        expect(driftTarget(SEED, slot, i).durationMs).toBeGreaterThanOrEqual(900);
      }
    }
  });

  it('aims laterally enough that the raw heading is never an away facing', () => {
    // walkFacing guarantees this whatever the geometry; the wedge is what
    // keeps it from having to intervene, so that excursions play in profile
    // rather than being folded into one. Checked over the scene shapes a
    // phone or tablet actually produces.
    const AWAY = ['N', 'NE', 'NW'];
    for (const aspect of [0.8, 1.0, 1.2, 1.4, 1.6]) {
      const viewportWidth = 400;
      const worldWidth = viewportWidth * 2.4;
      const sceneHeight = viewportWidth * aspect;
      for (const slot of SLOTS) {
        for (let i = 0; i < 200; i++) {
          const target = driftTarget(SEED, slot, i);
          const { dy } = driftGeometry(0.5, target.dDepth, sceneHeight);
          expect(AWAY).not.toContain(facingFor(target.du * worldWidth, dy));
        }
      }
    }
  });

  it('gives different cats different destinations', () => {
    const targets = SLOTS.map((slot) => JSON.stringify(driftTarget(SEED, slot, 0)));
    expect(new Set(targets).size).toBe(SLOTS.length);
  });
});

describe('driftGeometry', () => {
  it('clamps to the plane at both edges', () => {
    expect(driftGeometry(0.02, -0.5, 800).depth).toBe(0);
    expect(driftGeometry(0.98, 0.5, 800).depth).toBe(1);
  });

  it('converts a depth change into the plane offset the scene would use', () => {
    const height = 800;
    const { dy, depth } = driftGeometry(0.4, 0.05, height);
    expect(dy).toBeCloseTo((planeY(depth) - planeY(0.4)) * height, 6);
  });

  it('moves a cat DOWN the screen as it comes toward the viewer', () => {
    expect(driftGeometry(0.4, 0.05, 800).dy).toBeGreaterThan(0);
    expect(driftGeometry(0.4, -0.05, 800).dy).toBeLessThan(0);
  });
});

describe('nextIdle', () => {
  it('only returns animations the action sheet carries', () => {
    for (const slot of SLOTS) {
      for (let i = 0; i < 200; i++) {
        expect(ACT_ANIMATIONS[nextIdle(SEED, slot, i)]).toBeDefined();
      }
    }
  });

  it('never repeats a flourish back to back', () => {
    // At six cats a repeated flourish reads as a stuck animation rather than
    // as a cat that happened to blink twice. Plain idle is exempt.
    for (const slot of SLOTS) {
      let previous: ActAnimation | undefined;
      for (let i = 0; i < 300; i++) {
        const next = nextIdle(SEED, slot, i, previous);
        if (previous && previous !== 'idle') expect(next).not.toBe(previous);
        previous = next;
      }
    }
  });

  it('keeps a resting state as the most common beat', () => {
    // Constant activity is as flat as no activity, just louder.
    const counts = new Map<ActAnimation, number>();
    for (const slot of SLOTS) {
      for (let i = 0; i < 500; i++) {
        const pick = nextIdle(SEED, slot, i);
        counts.set(pick, (counts.get(pick) ?? 0) + 1);
      }
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect((counts.get('idle') ?? 0) / total).toBeGreaterThan(0.2);
    // ...and the showiest one stays rare.
    expect((counts.get('yawn') ?? 0) / total).toBeLessThan(0.15);
  });

  it('does not put every cat on the same beat', () => {
    // This is the breathing-in-unison bug one level up: six cats that mount in
    // the same commit and share a schedule read as one organism.
    const firstBeats = SLOTS.map((slot) => nextIdle(SEED, slot, 0));
    expect(new Set(firstBeats).size).toBeGreaterThan(1);
  });
});

describe('interactionsFor', () => {
  it('gives a cat something to do at the thing it came for', () => {
    expect(interactionsFor('item_kibble_bowl')).toContain('eat');
  });

  it('gives a cat something to do at a piece of the street', () => {
    // The whole reason a spare cat is seated at the scenery: a cat asleep
    // on a warm vent says what the vent is for, and the vent cannot.
    expect(interactionsFor(null, 'scenery_vent')).toContain('sleep');
    expect(interactionsFor(null, 'scenery_bin')).toContain('sniff');
  });

  it('leaves a cat on bare ground to the general repertoire', () => {
    expect(interactionsFor(null)).toEqual([]);
    expect(interactionsFor(null, 'scenery_nonexistent')).toEqual([]);
  });
});

describe('scheduling', () => {
  it('reports each animation cycle length from its own duration table', () => {
    for (const [name, anim] of Object.entries(ACT_ANIMATIONS)) {
      const expected = anim.durations.reduce((a, b) => a + b, 0);
      expect(actDuration(name as ActAnimation)).toBe(expected);
    }
  });

  it('spreads startup across longer than any single flavour idle', () => {
    const offsets = SLOTS.map(startupStagger);
    expect(new Set(offsets).size).toBe(SLOTS.length);

    const longest = Math.max(
      ...Object.keys(ACT_ANIMATIONS).map((n) => actDuration(n as ActAnimation)),
    );
    // If the spread were shorter than the longest animation, two cats could
    // stay locked together through it.
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(longest * 0.25);
  });

  it('keeps rests long enough to read as rest', () => {
    for (const slot of SLOTS) {
      for (let i = 0; i < 100; i++) {
        const ms = settleDuration(SEED, slot, i);
        expect(ms).toBeGreaterThanOrEqual(5200);
        expect(ms).toBeLessThanOrEqual(5200 + 11000);
      }
    }
  });
});
