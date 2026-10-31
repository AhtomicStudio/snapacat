/**
 * Breed definitions, read straight out of src/utils/spriteLibrary.ts so the
 * palettes stay a single source of truth.
 *
 * Lifted out of build.js because build.js runs main() on require — anything
 * that wanted the breed table had to rebuild all 40 sheets to get it, which
 * made writing inspection tooling absurd.
 */
const fs = require('node:fs');
const path = require('node:path');
const { isNearWhite } = require('./slots');

const LIBRARY_TS = path.resolve(__dirname, '..', '..', 'src', 'utils', 'spriteLibrary.ts');

/**
 * Extracts breed records from the TypeScript source. Field order in
 * SpriteDefinition is stable, so a single ordered regex is enough — and the
 * empty-result assertion turns any future refactor into a loud failure rather
 * than silently missing breeds.
 */
function loadBreeds() {
  const src = fs.readFileSync(LIBRARY_TS, 'utf8');
  const re =
    /id:\s*'([^']+)'[\s\S]*?label:\s*'((?:[^'\\]|\\.)*)'[\s\S]*?palette:\s*\[([^\]]+)\][\s\S]*?pattern:\s*'([^']+)'[\s\S]*?rarity:\s*'([^']+)'[\s\S]*?tier:\s*(\d)/g;

  const breeds = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const palette = m[3]
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    breeds.push({
      id: m[1],
      label: m[2].replace(/\\'/g, "'"),
      palette,
      pattern: m[4],
      rarity: m[5],
      tier: Number(m[6]),
      hasWhite: palette.some(isNearWhite),
      // The palette is ordered by area coverage, so a white first entry means
      // the cat is mostly white and its markings should invert.
      whiteDominant: isNearWhite(palette[0]),
    });
  }

  if (breeds.length === 0) {
    throw new Error(`No breeds parsed from ${LIBRARY_TS} — has SpriteDefinition changed shape?`);
  }
  return breeds;
}

/** One breed by id, falling back to the first so tooling never crashes on a typo. */
function breedById(id) {
  const all = loadBreeds();
  return all.find((b) => b.id === id) ?? all[0];
}

module.exports = { loadBreeds, breedById, LIBRARY_TS };
