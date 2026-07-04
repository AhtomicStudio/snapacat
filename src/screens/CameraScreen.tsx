import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Linking,
  StatusBar,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { detectCatInPhoto } from '../utils/catDetection';
import { BUTTON_SHADOW } from '../utils/styles';

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraPhase = 'viewfinder' | 'capturing' | 'detecting' | 'cat_found' | 'no_cat';
type ZoomLevel = 1 | 2 | 5;

const ZOOM_LEVELS: ZoomLevel[] = [1, 2, 5];
// Scale applied to the mock cat subject per zoom level
const ZOOM_SCALE: Record<ZoomLevel, number> = { 1: 1.0, 2: 1.45, 5: 2.1 };

export interface CameraScreenProps {
  onBack: () => void;
  /** Called with the captured photo URI, or undefined when user skips the photo. */
  onProceedToFieldNotes: (capturedPhotoUri?: string) => void;
  onOpenCatalog: () => void;
}

// Stable mock URI — in production, Vision Camera returns a real file:// path
const MOCK_PHOTO_URI = `mock://snapacat-photo-${Date.now()}`;

// ─── MockViewfinder ──────────────────────────────────────────────────────────

function MockViewfinder({ bobAnim, zoomScaleAnim }: { bobAnim: Animated.Value; zoomScaleAnim: Animated.Value }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1E1208' }]}>
      {/* Atmospheric bokeh blobs */}
      <View style={{ position: 'absolute', top: 72, right: 32, width: 180, height: 180, borderRadius: 90, backgroundColor: '#FF8E53', opacity: 0.10 }} />
      <View style={{ position: 'absolute', top: 200, left: -48, width: 220, height: 220, borderRadius: 110, backgroundColor: '#FFE8DC', opacity: 0.06 }} />
      <View style={{ position: 'absolute', bottom: 160, right: -24, width: 160, height: 160, borderRadius: 80, backgroundColor: '#FF8E53', opacity: 0.08 }} />
      <View style={{ position: 'absolute', bottom: 40, left: 48, width: 140, height: 140, borderRadius: 70, backgroundColor: '#FFAAA6', opacity: 0.06 }} />
      {/* Ground strip */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%', backgroundColor: 'rgba(44,30,16,0.55)' }} />
      {/* Animated cat subject — scale driven by zoom level */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Text style={{ fontSize: 88, transform: [{ translateY: bobAnim }, { scale: zoomScaleAnim }] }}>
          🐱
        </Animated.Text>
        <Text style={{ color: 'rgba(255,255,255,0.28)', fontSize: 11, marginTop: 14, letterSpacing: 2.5, fontWeight: '700' }}>
          POINT AT A CAT
        </Text>
      </View>
    </View>
  );
}

// ─── ZoomControls ─────────────────────────────────────────────────────────────

function ZoomControls({ activeZoom, onZoom }: { activeZoom: ZoomLevel; onZoom: (z: ZoomLevel) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingVertical: 10 }}>
      {ZOOM_LEVELS.map((z) => {
        const isActive = z === activeZoom;
        return (
          <Pressable
            key={z}
            onPress={() => onZoom(z)}
            style={{
              width: isActive ? 44 : 38,
              height: isActive ? 44 : 38,
              borderRadius: isActive ? 22 : 19,
              backgroundColor: isActive ? '#FF8E53' : 'rgba(0,0,0,0.52)',
              borderWidth: isActive ? 0 : 1.5,
              borderColor: 'rgba(255,255,255,0.45)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: isActive ? 13 : 11, fontWeight: '800', letterSpacing: -0.3 }}>
              {z}×
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── PermissionGate ──────────────────────────────────────────────────────────
// Shown when camera permission is missing. `denied` = a request already failed,
// so the OS won't re-prompt — send the user to Settings instead.

function PermissionGate({
  denied,
  onRequest,
  onClose,
}: {
  denied: boolean;
  onRequest: () => void;
  onClose: () => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1E1208', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }]}>
      <Text style={{ fontSize: 52 }}>📷</Text>
      <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 18, textAlign: 'center' }}>
        SnapaCat needs your camera
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
        Snapping real neighborhood cats is how you fill your Cat-a-log. Photos stay on your device.
      </Text>

      <Pressable
        onPress={denied ? () => Linking.openSettings() : onRequest}
        style={[
          BUTTON_SHADOW,
          {
            marginTop: 28, backgroundColor: '#FF8E53', borderRadius: 16,
            paddingVertical: 16, paddingHorizontal: 36, alignItems: 'center', alignSelf: 'stretch',
          },
        ]}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
          {denied ? 'Open Settings' : 'Allow Camera Access'}
        </Text>
      </Pressable>

      <Pressable onPress={onClose} style={{ marginTop: 18, paddingVertical: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Not now</Text>
      </Pressable>
    </View>
  );
}

// ─── DetectingOverlay ─────────────────────────────────────────────────────────

function DetectingOverlay() {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
    );
    anim.start();
    return () => anim.stop();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(26,18,8,0.78)', alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.Text style={{ fontSize: 56, transform: [{ rotate: spin }] }}>🐾</Animated.Text>
      <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginTop: 20 }}>
        Sniffing for cats...
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, marginTop: 6 }}>
        Analyzing your photo
      </Text>
    </View>
  );
}

// ─── CatFoundSheet ───────────────────────────────────────────────────────────

function CatFoundSheet({ onProceed, onRetake }: { onProceed: () => void; onRetake: () => void }) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }).start();
  }, [slideAnim]);

  return (
    <Animated.View
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        transform: [{ translateY: slideAnim }],
        backgroundColor: '#FF8E53',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 28, paddingBottom: 40,
      }}
    >
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.36)', alignSelf: 'center', marginBottom: 22 }} />
      <Text style={{ fontSize: 48 }}>🐱</Text>
      <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '800', marginTop: 8 }}>
        Cat spotted!
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 14, marginTop: 6, lineHeight: 22 }}>
        Looking good! Ready to add this furball to your Cat-a-log?
      </Text>

      <Pressable
        onPress={onProceed}
        style={[
          BUTTON_SHADOW,
          { marginTop: 24, backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 17, alignItems: 'center' },
        ]}
      >
        <Text style={{ color: '#E67035', fontWeight: '800', fontSize: 16 }}>
          Log This Sighting →
        </Text>
      </Pressable>

      <Pressable onPress={onRetake} style={{ marginTop: 16, alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 13 }}>Retake photo</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── NoCatSheet ──────────────────────────────────────────────────────────────

function NoCatSheet({
  onRetake,
  onLogAnyway,
}: {
  onRetake: () => void;
  onLogAnyway: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 68, friction: 11 }).start();
  }, [slideAnim]);

  return (
    <Animated.View
      style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        transform: [{ translateY: slideAnim }],
        backgroundColor: '#FAF6F0',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 28, paddingBottom: 40,
      }}
    >
      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#EAE3DA', alignSelf: 'center', marginBottom: 22 }} />
      <Text style={{ fontSize: 44 }}>🤔</Text>
      <Text style={{ color: '#2C2A29', fontSize: 23, fontWeight: '800', marginTop: 8 }}>
        No cat spotted
      </Text>
      <Text style={{ color: '#706B67', fontSize: 13, marginTop: 6, lineHeight: 22 }}>
        We couldn't find a cat in that photo. Try getting closer or in better light.
      </Text>

      <Pressable
        onPress={onRetake}
        style={[BUTTON_SHADOW, { marginTop: 24, backgroundColor: '#FF8E53', borderRadius: 16, paddingVertical: 17, alignItems: 'center' }]}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Try Again</Text>
      </Pressable>

      <Pressable onPress={onLogAnyway} style={{ marginTop: 16, alignItems: 'center', paddingVertical: 8 }}>
        <Text style={{ color: '#706B67', fontSize: 12 }}>
          Log anyway without a photo →
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── CameraScreen ─────────────────────────────────────────────────────────────

export function CameraScreen({
  onBack,
  onProceedToFieldNotes,
  onOpenCatalog,
}: CameraScreenProps) {
  const [phase, setPhase]       = useState<CameraPhase>('viewfinder');
  const [flashOn, setFlashOn]   = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(1);

  const shutterFlash        = useRef(new Animated.Value(0)).current;
  const shutterScale        = useRef(new Animated.Value(1)).current;
  const catBobAnim          = useRef(new Animated.Value(0)).current;
  const zoomScaleAnim       = useRef(new Animated.Value(1)).current;
  const zoomIndicatorOpacity = useRef(new Animated.Value(0)).current;

  const [capturedPhotoPath, setCapturedPhotoPath] = useState<string | undefined>();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const hasCam = hasPermission && device != null;
  const photoOutput = usePhotoOutput();

  const askPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (!granted) setPermissionDenied(true);
  }, [requestPermission]);

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) askPermission();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gentle idle bob on the cat emoji
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(catBobAnim, { toValue: -12, duration: 1300, useNativeDriver: true }),
        Animated.timing(catBobAnim, { toValue: 6,   duration: 1600, useNativeDriver: true }),
        Animated.timing(catBobAnim, { toValue: 0,   duration: 1000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [catBobAnim]);

  const handleZoomChange = useCallback((z: ZoomLevel) => {
    setZoomLevel(z);
    // Animate the mock subject scale
    Animated.spring(zoomScaleAnim, { toValue: ZOOM_SCALE[z], useNativeDriver: true, tension: 80, friction: 8 }).start();
    // Android-style: brief floating indicator flashes in the viewfinder
    zoomIndicatorOpacity.stopAnimation();
    Animated.sequence([
      Animated.timing(zoomIndicatorOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.delay(600),
      Animated.timing(zoomIndicatorOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [zoomScaleAnim, zoomIndicatorOpacity]);

  const handleCapture = useCallback(() => {
    if (phase !== 'viewfinder') return;

    Animated.sequence([
      Animated.timing(shutterScale, { toValue: 0.84, duration: 80, useNativeDriver: true }),
      Animated.spring(shutterScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    setPhase('capturing');

    // Kick off photo capture immediately while camera is still active ('capturing' keeps isActive true).
    // Flash animation runs concurrently so takePhoto finishes before detection starts.
    const photoCapturePromise: Promise<string> = (async () => {
      if (hasCam) {
        try {
          const photoFile = await photoOutput.capturePhotoToFile({ flashMode: flashOn ? 'on' : 'off' }, {});
          const uri = `file://${photoFile.filePath}`;
          setCapturedPhotoPath(uri);
          return uri;
        } catch (err) {
          console.warn('[CameraScreen] capturePhotoToFile failed, using mock URI:', err);
        }
      }
      return MOCK_PHOTO_URI;
    })();

    Animated.sequence([
      Animated.timing(shutterFlash, { toValue: 0.92, duration: 60,  useNativeDriver: true }),
      Animated.timing(shutterFlash, { toValue: 0,    duration: 380, useNativeDriver: true }),
    ]).start(async () => {
      setPhase('detecting');
      const photoUri = await photoCapturePromise;
      // 10-second failsafe so ML Kit can never leave the user stuck
      const timeout = new Promise<{ detected: boolean; confidence: number }>(
        (resolve) => setTimeout(() => resolve({ detected: false, confidence: 0 }), 10_000),
      );
      const result = await Promise.race([detectCatInPhoto(photoUri), timeout]);
      setPhase(result.detected ? 'cat_found' : 'no_cat');
    });
  }, [phase, shutterFlash, shutterScale, hasCam, flashOn, photoOutput]);

  const handleRetake = useCallback(() => {
    setCapturedPhotoPath(undefined);
    setPhase('viewfinder');
  }, []);

  const showControls = phase === 'viewfinder' || phase === 'capturing';

  // Camera permission missing — show an honest gate instead of a fake viewfinder.
  if (!hasPermission) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1E1208' }}>
        <StatusBar barStyle="light-content" backgroundColor="#1E1208" />
        <PermissionGate denied={permissionDenied} onRequest={askPermission} onClose={onBack} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#1E1208' }}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1208" />
      {/* Full-screen viewfinder: real camera when available, mock fallback for
          emulators that expose no back camera device */}
      {hasCam ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device!}
          isActive={showControls}
          outputs={[photoOutput]}
          zoom={Math.min(zoomLevel, device!.maxZoom)}
        />
      ) : (
        <MockViewfinder bobAnim={catBobAnim} zoomScaleAnim={zoomScaleAnim} />
      )}

      {/* UI layer */}
      <SafeAreaView style={{ flex: 1 }}>
        {/* ── Top bar ───────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'rgba(0,0,0,0.36)' }}>
          <Pressable
            onPress={onBack}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)' }}>✕</Text>
          </Pressable>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>SnapaCat</Text>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, letterSpacing: 2 }}>SNAP MODE</Text>
          </View>

          <Pressable
            onPress={() => setFlashOn((f) => !f)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: flashOn ? 'rgba(255,142,83,0.4)' : 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 18 }}>⚡</Text>
          </Pressable>
        </View>

        {/* ── Viewfinder bracket frame + floating zoom indicator ── */}
        <View style={{ flex: 1 }}>
          <View style={{ position: 'absolute', top: 18, left: 24, width: 28, height: 28, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#FF8E53' }} />
          <View style={{ position: 'absolute', top: 18, right: 24, width: 28, height: 28, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#FF8E53' }} />
          <View style={{ position: 'absolute', bottom: 18, left: 24, width: 28, height: 28, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#FF8E53' }} />
          <View style={{ position: 'absolute', bottom: 18, right: 24, width: 28, height: 28, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#FF8E53' }} />

          {/* Android-style zoom level indicator — briefly visible after zoom change */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', alignSelf: 'center', top: '38%',
              backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 99,
              paddingHorizontal: 18, paddingVertical: 9,
              opacity: zoomIndicatorOpacity,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 }}>
              {zoomLevel}×
            </Text>
          </Animated.View>
        </View>

        {/* ── Bottom controls (hidden during detecting/result phases) ── */}
        {showControls && (
          <>
            {/* Android zoom circle badges */}
            <View style={{ backgroundColor: 'rgba(0,0,0,0.42)', paddingTop: 6, paddingBottom: 2 }}>
              <ZoomControls activeZoom={zoomLevel} onZoom={handleZoomChange} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 28, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.42)' }}>
              {/* Spacer — mirrors the catalog button on the right for visual balance */}
              <View style={{ width: 48 }} />

              {/* Shutter */}
              <Animated.View style={{ transform: [{ scale: shutterScale }] }}>
                <Pressable onPress={handleCapture} style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FF8E53' }} />
                  </View>
                </Pressable>
              </Animated.View>

              {/* Quick Cat-a-log */}
              <Pressable
                onPress={onOpenCatalog}
                style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 22 }}>🐱</Text>
              </Pressable>
            </View>

          </>
        )}
      </SafeAreaView>

      {/* ── Phase overlays ───────────────────────────────── */}
      {phase === 'detecting' && <DetectingOverlay />}
      {phase === 'cat_found' && (
        <CatFoundSheet
          onProceed={() => onProceedToFieldNotes(capturedPhotoPath ?? MOCK_PHOTO_URI)}
          onRetake={handleRetake}
        />
      )}
      {phase === 'no_cat' && (
        <NoCatSheet
          onRetake={handleRetake}
          onLogAnyway={() => onProceedToFieldNotes(capturedPhotoPath)}
        />
      )}

      {/* ── Shutter flash overlay (must be last / topmost) ── */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: shutterFlash }]}
      />
    </View>
  );
}
