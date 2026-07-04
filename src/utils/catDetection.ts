import ImageLabeling from '@react-native-ml-kit/image-labeling';

export type CatDetectionResult =
  | { detected: true; confidence: number }
  | { detected: false };

// Labels the ML Kit image labeler returns for cats and close relatives
const CAT_KEYWORDS = ['cat', 'felidae', 'kitten', 'tabby', 'calico', 'siamese', 'tomcat', 'feline'];
const MIN_CONFIDENCE = 0.5;

// Mock fallback constants — used when no real image is available (emulator / tests)
const MOCK_HIT_RATE = 0.72;

function isMockUri(uri: string): boolean {
  return uri.startsWith('mock://');
}

/**
 * Detects whether a photo contains a cat using ML Kit Image Labeling (on-device).
 *
 * Falls back to a probabilistic mock when given a mock:// URI so that the UX
 * flow can be exercised without a real camera (emulator, unit tests).
 *
 * On error the function fails open (returns detected=true, confidence=0) so
 * a temporary ML Kit failure never silently blocks the user from logging a sighting.
 */
export async function detectCatInPhoto(photoUri: string): Promise<CatDetectionResult> {
  if (isMockUri(photoUri)) {
    await new Promise<void>((r) => setTimeout(r, 900));
    const roll = Math.random();
    if (roll < MOCK_HIT_RATE) {
      return { detected: true, confidence: Math.round((0.68 + roll * 0.32) * 100) / 100 };
    }
    return { detected: false };
  }

  try {
    const labels = await ImageLabeling.label(photoUri);
    const catLabel = labels.find((l) =>
      l.confidence >= MIN_CONFIDENCE && CAT_KEYWORDS.some((kw) => l.text.toLowerCase().includes(kw)),
    );
    if (catLabel) {
      return { detected: true, confidence: Math.round(catLabel.confidence * 100) / 100 };
    }
    return { detected: false };
  } catch (err) {
    console.warn('[catDetection] ML Kit labeling failed, failing open:', err);
    return { detected: true, confidence: 0 };
  }
}
