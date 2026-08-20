import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  Animated,
  BackHandler,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { CatalogScreen } from './src/screens/CatalogScreen';
import { FieldNotesScreen } from './src/screens/FieldNotesScreen';
import { HoodHomeScreen } from './src/screens/HoodHomeScreen';
import { FriendHoodScreen } from './src/screens/FriendHoodScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { ScrapbookScreen } from './src/screens/ScrapbookScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { SpriteRevealScreen } from './src/screens/SpriteRevealScreen';
import type { HexColor } from './src/utils/colorExtractor';
import {
  getUser,
  updateHoodLayout,
  getUserProgression,
  saveUserProgression,
  createHood,
} from './src/services/dbService';
import { checkAndAwardDailyStreak } from './src/utils/progressionEngine';
import { Touchable } from './src/components/Touchable';
import {
  ERROR_CODES,
  SnapError,
  describeError,
  type SnapErrorCode,
} from './src/utils/errorCodes';
import type { User, Cat, Hood, UserProgression } from './src/types';
import { font } from './src/theme';

// ──────────────────────────────────────────────────────────────────────────────
// Screen state machine
// ──────────────────────────────────────────────────────────────────────────────

/**
 * The Hood is the root, and everything else is pushed over it.
 *
 * This used to be a bottom-tab shell with Home as the landing tab and the Hood
 * three taps deep behind a "My Hoods" list. That structure is what made the app
 * feel like a dashboard with a game attached rather than a game: the loop is
 * "open the app, see who turned up", and every screen between launch and the
 * scene was taxing the only moment that matters.
 *
 * There is no longer a tab bar. Catalog, Friends and Camera are reached from
 * floating buttons on the scene and return to it.
 */
type ScreenState =
  | { type: 'hood' }
  | { type: 'catalog' }
  | { type: 'friends' }
  | { type: 'camera' }
  | { type: 'sprite_reveal'; capturedPhotoUri: string }
  | { type: 'field_notes'; capturedPhotoUri?: string; spriteTemplateId?: string; extractedColors?: HexColor[] }
  | { type: 'friend_hood'; friendUid: string }
  | { type: 'scrapbook'; cat: Cat };

/** Swap for the authenticated UID once auth is wired up. */
const CURRENT_UID = 'user_alice';

// ──────────────────────────────────────────────────────────────────────────────
// App
// ──────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [progression, setProgression] = useState<UserProgression | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ type: 'hood' });
  /** Which Hood the scene is showing. Null until the user document lands. */
  const [selectedHoodId, setSelectedHoodId] = useState<string | null>(null);
  // Holds the CODE, not a boolean — the error screen shows it so a user can
  // report exactly which failure path they hit.
  const [bootError, setBootError] = useState<SnapErrorCode | null>(null);
  const [streakToast, setStreakToast] = useState<number | null>(null);

  // ── Boot (retryable) ────────────────────────────────────────────────────────
  const boot = useCallback(async () => {
    setBootError(null);
    try {
      const [userData, prog] = await Promise.all([
        getUser(CURRENT_UID),
        getUserProgression(CURRENT_UID),
      ]);
      // Distinct from a fetch failure: the read succeeded and the document is
      // simply not there. That is the first-launch case against real Firestore,
      // and it needs its own code because the fix is completely different.
      if (!userData) throw new SnapError('SNAP-BOOT-02');
      setUser(userData);
      // Award daily streak on first open of the day
      const streaked = checkAndAwardDailyStreak(prog);
      setProgression(streaked);
      if (streaked !== prog) {
        saveUserProgression(CURRENT_UID, streaked).catch(console.error);
        setStreakToast(streaked.streak_count ?? 1);
      }
    } catch (err) {
      const info = describeError(err, 'SNAP-BOOT-01');
      // Log the code, not the caught object — exception text is written for
      // developers and routinely carries internals.
      console.warn(`[${info.code}] boot failed`);
      setBootError(info.code);
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  // ── Android hardware back ──────────────────────────────────────────────────
  useEffect(() => {
    const onBack = () => {
      switch (screenState.type) {
        case 'hood':
          return false; // exit the app from the scene
        // The ✕ on sprite reveal goes back to the camera so the user can
        // retake, not out to the scene.
        case 'sprite_reveal':
          setScreenState({ type: 'camera' });
          return true;
        case 'friend_hood':
          setScreenState({ type: 'friends' });
          return true;
        case 'scrapbook':
          setScreenState({ type: 'catalog' });
          return true;
        default:
          setScreenState({ type: 'hood' });
          return true;
      }
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [screenState]);

  // ── Shared callbacks ───────────────────────────────────────────────────────
  const handleUpdateProgression = useCallback((updated: UserProgression) => {
    setProgression(updated);
    saveUserProgression(CURRENT_UID, updated).catch(console.error);
  }, []);

  const handleUpdateHood = useCallback((hoodId: string, updated: Hood) => {
    // The scene reads its Hood straight out of `user.hoods`, so there is no
    // second copy in screen state to keep in sync any more.
    setUser((u) => (u ? { ...u, hoods: { ...u.hoods, [hoodId]: updated } } : u));
    updateHoodLayout(
      CURRENT_UID,
      hoodId,
      updated.placed_items,
      updated.item_placements ?? null,
    ).catch(console.error);
  }, []);

  const goToScrapbook = useCallback(
    (cat: Cat) => setScreenState({ type: 'scrapbook', cat }),
    [],
  );
  const goToCamera = useCallback(() => setScreenState({ type: 'camera' }), []);
  const goHome = useCallback(() => setScreenState({ type: 'hood' }), []);

  const handleCreateHood = useCallback(async (name: string) => {
    const created = await createHood(CURRENT_UID, name);
    if (!created) return;
    setUser((u) =>
      u ? { ...u, hoods: { ...u.hoods, [created.hoodId]: created.hood } } : u,
    );
    // Land in the new Hood so the user can start putting things out.
    setSelectedHoodId(created.hoodId);
    setScreenState({ type: 'hood' });
  }, []);

  // ── Boot error ─────────────────────────────────────────────────────────────
  if (bootError) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#FAF6F0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}
        >
          <Text style={{ fontSize: 46, marginBottom: 16 }}>🙀</Text>
          <Text style={{ fontSize: 18, fontFamily: font.bold, color: '#2C2A29', textAlign: 'center' }}>
            {ERROR_CODES[bootError].title}
          </Text>
          <Text style={{ marginTop: 8, fontSize: 13, color: '#706B67', textAlign: 'center', lineHeight: 20 }}>
            {ERROR_CODES[bootError].message}
          </Text>
          {ERROR_CODES[bootError].hint && (
            <Text style={{ marginTop: 6, fontSize: 13, color: '#706B67', textAlign: 'center', lineHeight: 20 }}>
              {ERROR_CODES[bootError].hint}
            </Text>
          )}
          {/* The code is the point: it makes a screenshot from a user actionable
              instead of "it said something went wrong". Muted so it reads as a
              reference, not as blame. */}
          <Text
            selectable
            style={{ marginTop: 14, fontSize: 11, color: '#A49E98', letterSpacing: 0.5 }}
          >
            {bootError}
          </Text>
          <Touchable
            onPress={boot}
            scaleTo={0.95}
            style={{
              marginTop: 24,
              backgroundColor: '#FF8E53',
              borderRadius: 14,
              paddingHorizontal: 32,
              paddingVertical: 14,
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: font.bold, fontSize: 15 }}>Try Again</Text>
          </Touchable>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!user || !progression) {
    return (
      <SafeAreaProvider>
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#FAF6F0', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 42, marginBottom: 18 }}>🐾</Text>
          <ActivityIndicator size="large" color="#FF8E53" />
          <Text style={{ marginTop: 14, fontSize: 13, color: '#706B67' }}>
            Loading SnapaCat…
          </Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // ── Full-screen sub-states ─────────────────────────────────────────────────
  if (screenState.type === 'camera') {
    return (
      <SafeAreaProvider>
        <CameraScreen
          onBack={goHome}
          onProceedToFieldNotes={(capturedPhotoUri) =>
            // If a photo was taken → go through sprite reveal; otherwise straight to field notes
            capturedPhotoUri
              ? setScreenState({ type: 'sprite_reveal', capturedPhotoUri })
              : setScreenState({ type: 'field_notes' })
          }
          onOpenCatalog={() => setScreenState({ type: 'catalog' })}
        />
      </SafeAreaProvider>
    );
  }

  if (screenState.type === 'sprite_reveal') {
    return (
      <SafeAreaProvider>
        <SpriteRevealScreen
          capturedPhotoUri={screenState.capturedPhotoUri}
          onBack={() => setScreenState({ type: 'camera' })}
          onContinue={(spriteTemplateId, extractedColors) =>
            setScreenState({
              type: 'field_notes',
              capturedPhotoUri: screenState.capturedPhotoUri,
              spriteTemplateId,
              extractedColors,
            })
          }
        />
      </SafeAreaProvider>
    );
  }

  if (screenState.type === 'field_notes') {
    return (
      <SafeAreaProvider>
        <FieldNotesScreen
          userId={CURRENT_UID}
          progression={progression}
          onUpdateProgression={handleUpdateProgression}
          capturedPhotoUri={screenState.capturedPhotoUri}
          spriteTemplateId={screenState.spriteTemplateId}
          extractedColors={screenState.extractedColors}
          onRetakePhoto={goToCamera}
          onBack={goHome}
          // Land back in the Hood rather than the Cat-a-log: the payoff for
          // logging a cat is seeing it turn up in your scene.
          onSubmitSuccess={goHome}
        />
      </SafeAreaProvider>
    );
  }

  if (screenState.type === 'catalog') {
    return (
      <SafeAreaProvider>
        <CatalogScreen
          userId={CURRENT_UID}
          onLogSpotting={goToCamera}
          onViewScrapbook={goToScrapbook}
          onBack={goHome}
        />
      </SafeAreaProvider>
    );
  }

  if (screenState.type === 'friends') {
    return (
      <SafeAreaProvider>
        <FriendsScreen
          currentUid={CURRENT_UID}
          currentUser={user}
          onBack={goHome}
          onViewFriendHood={(friendUid) => setScreenState({ type: 'friend_hood', friendUid })}
        />
      </SafeAreaProvider>
    );
  }

  if (screenState.type === 'scrapbook') {
    return (
      <SafeAreaProvider>
        <ScrapbookScreen
          cat={screenState.cat}
          onBack={() => setScreenState({ type: 'catalog' })}
        />
      </SafeAreaProvider>
    );
  }

  if (screenState.type === 'friend_hood') {
    return (
      <SafeAreaProvider>
        <FriendHoodScreen
          friendUid={screenState.friendUid}
          onBack={() => setScreenState({ type: 'friends' })}
        />
      </SafeAreaProvider>
    );
  }

  // ── The Hood ───────────────────────────────────────────────────────────────

  /**
   * Resolved rather than stored, so a Hood that disappears (deleted elsewhere,
   * or a stale id from a previous session) falls back instead of rendering a
   * blank scene.
   */
  const hoodIds = Object.keys(user.hoods);
  const activeHoodId =
    selectedHoodId && user.hoods[selectedHoodId] ? selectedHoodId : hoodIds[0] ?? null;
  const activeHood = activeHoodId ? user.hoods[activeHoodId] : undefined;

  if (!activeHoodId || !activeHood) {
    return (
      <SafeAreaProvider>
        <FirstHoodScreen onCreate={handleCreateHood} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        <HoodHomeScreen
          userId={CURRENT_UID}
          username={user.username}
          hoods={user.hoods}
          hoodId={activeHoodId}
          hood={activeHood}
          onSwitchHood={setSelectedHoodId}
          onCreateHood={handleCreateHood}
          onUpdateHood={handleUpdateHood}
          progression={progression}
          onUpdateProgression={handleUpdateProgression}
          onOpenCamera={goToCamera}
          onOpenCatalog={() => setScreenState({ type: 'catalog' })}
          onOpenFriends={() => setScreenState({ type: 'friends' })}
        />

        {streakToast != null && (
          <StreakToast count={streakToast} onDone={() => setStreakToast(null)} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// FirstHoodScreen — the only thing that stands between launch and the scene
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Shown when a user has no Hoods at all.
 *
 * The alternative was silently creating a default Hood during boot, which would
 * write to the user's document before they had asked for anything. Naming the
 * place yourself is also a better first beat: the Hood is supposed to be a real
 * spot you walk past, and the app never learns that any other way — there is no
 * geolocation by design.
 */
function FirstHoodScreen({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF6F0', justifyContent: 'center', paddingHorizontal: 32 }}>
      <Text style={{ fontSize: 52, textAlign: 'center' }}>🏡</Text>
      <Text style={{ fontSize: 24, fontFamily: font.bold, color: '#2C2A29', textAlign: 'center', marginTop: 14 }}>
        Where do you see cats?
      </Text>
      <Text style={{ fontSize: 13, color: '#706B67', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
        Name the spot — a car park, a back alley, your own step. Put something
        out and see who turns up.
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Back Alley, Corner Store…"
        placeholderTextColor="#B0ABA6"
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={submit}
        maxLength={40}
        style={{
          marginTop: 24,
          backgroundColor: '#FFFFFF',
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 16,
          color: '#2C2A29',
          borderWidth: 1,
          borderColor: '#EAE3DA',
          minHeight: 50,
        }}
      />
      <Touchable
        onPress={submit}
        disabled={!name.trim() || busy}
        style={{
          marginTop: 14,
          backgroundColor: '#FF8E53',
          borderRadius: 14,
          minHeight: 50,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !name.trim() || busy ? 0.45 : 1,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontFamily: font.bold, fontSize: 15 }}>
          {busy ? 'Setting up…' : 'Open the gate'}
        </Text>
      </Touchable>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// StreakToast — brief banner acknowledging the daily streak bonus
// ──────────────────────────────────────────────────────────────────────────────

function StreakToast({ count, onDone }: { count: number; onDone: () => void }) {
  const slide = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(slide, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(slide, { toValue: -120, duration: 260, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
    // Mount-only: re-running would restart the toast animation on parent re-renders
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        // Sits below the scene's own top chrome rather than over it.
        top: 108,
        left: 20,
        right: 20,
        transform: [{ translateY: slide }],
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,142,83,0.35)',
        shadowColor: '#FF8E53',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <Text style={{ fontSize: 22 }}>{count > 1 ? '🔥' : '🐾'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: font.bold, color: '#2C2A29' }}>
          {count > 1 ? `Day ${count} streak!` : 'Welcome back!'}
        </Text>
        <Text style={{ fontSize: 12, color: '#706B67', marginTop: 1 }}>
          +25 🐾 PawPoints daily bonus
        </Text>
      </View>
    </Animated.View>
  );
}
