import { describeActivity, describeAttraction, describeVisitReason, EMPTY_HOOD_HINT } from '../hoodMood';
import { getAttractionProfile, MAX_HOOD_CATS } from '../spawnCalculator';
import { resolveTimeOfDay, isDark, skyPalette, timeLabel } from '../timeOfDay';

describe('hoodMood', () => {
  /**
   * The whole point of this module is that the Hood stopped quoting odds. A
   * numeral creeping back into any of these strings would undo it silently, so
   * the ban is a test rather than a comment.
   */
  it('never puts a number in front of the player', () => {
    const lines = [
      EMPTY_HOOD_HINT,
      describeVisitReason(null),
      describeVisitReason('Kibble Bowl'),
      ...Array.from({ length: MAX_HOOD_CATS + 1 }, (_, n) => describeActivity(n)),
      describeAttraction(getAttractionProfile(['item_kibble_bowl'])) ?? '',
      describeAttraction(getAttractionProfile(['item_kibble_bowl', 'item_toy_mouse'])) ?? '',
      describeAttraction(
        getAttractionProfile(['item_kibble_bowl', 'item_toy_mouse', 'item_old_blanket']),
      ) ?? '',
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toContain('%');
    }
  });

  it('describes a busier Hood differently from an empty one', () => {
    expect(describeActivity(0)).not.toBe(describeActivity(MAX_HOOD_CATS));
  });

  it('covers every cat count without falling through', () => {
    for (let n = 0; n <= MAX_HOOD_CATS; n++) {
      expect(describeActivity(n).length).toBeGreaterThan(0);
    }
  });

  it('has nothing to say about a Hood with no items', () => {
    expect(describeAttraction([])).toBeNull();
  });

  it('leads with the strongest category', () => {
    // Two toys, one food — the toy blurb should come first.
    const line = describeAttraction(
      getAttractionProfile(['item_kibble_bowl', 'item_toy_mouse', 'item_yarn_ball']),
    );
    expect(line).toMatch(/^Playful prowlers stop by/);
  });

  it('names the item a cat came for', () => {
    expect(describeVisitReason('Kibble Bowl')).toBe('Came for the kibble bowl.');
    expect(describeVisitReason(null)).toBe('Just passing through.');
  });
});

describe('timeOfDay', () => {
  const at = (hour: number) => new Date(2026, 7, 18, hour, 0, 0);

  it('reads the clock rather than asking the player', () => {
    expect(resolveTimeOfDay(at(6))).toBe('dawn');
    expect(resolveTimeOfDay(at(12))).toBe('day');
    expect(resolveTimeOfDay(at(18))).toBe('dusk');
    expect(resolveTimeOfDay(at(23))).toBe('night');
    expect(resolveTimeOfDay(at(3))).toBe('night');
  });

  it('covers all 24 hours with no gap', () => {
    for (let h = 0; h < 24; h++) {
      expect(['dawn', 'day', 'dusk', 'night']).toContain(resolveTimeOfDay(at(h)));
    }
  });

  it('only treats night as dark', () => {
    expect(isDark('night')).toBe(true);
    expect(isDark('dusk')).toBe(false);
    expect(isDark('day')).toBe(false);
    expect(isDark('dawn')).toBe(false);
  });

  /**
   * Every colour is fed straight to a style prop. One typo'd hex renders as a
   * transparent or black band across the whole scene.
   */
  it('gives every band a complete, well-formed palette', () => {
    for (const time of ['dawn', 'day', 'dusk', 'night'] as const) {
      const p = skyPalette(time);
      for (const key of ['top', 'mid', 'low', 'backdrop', 'ground', 'wash'] as const) {
        expect(p[key]).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
      expect(p.washOpacity).toBeGreaterThan(0);
      expect(p.washOpacity).toBeLessThan(1);
      expect(timeLabel(time).label.length).toBeGreaterThan(0);
    }
  });
});
