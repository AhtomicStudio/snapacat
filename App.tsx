import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Animated,
  BackHandler,
  Modal,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { CatalogScreen } from './src/screens/CatalogScreen';
import { FieldNotesScreen } from './src/screens/FieldNotesScreen';
import { HoodScreen } from './src/screens/HoodScreen';
import { FriendHoodScreen } from './src/screens/FriendHoodScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { ScrapbookScreen } from './src/screens/ScrapbookScreen';
import { CameraScreen } from './src/screens/CameraScreen';
import { SpriteRevealScreen } from './src/screens/SpriteRevealScreen';
import { Bouncy } from './src/components/Bouncy';
import type { HexColor } from './src/utils/colorExtractor';
import {
  getUser,
  updateHoodLayout,
  getUserProgression,
  saveUserProgression,
  createHood,
} from './src/services/dbService';
import { checkAndAwardDailyStreak } from './src/utils/progressionEngine';
import { calculateSpawnChances, MAX_HOOD_CATS } from './src/utils/spawnCalculator';
import { getEnvironmentById, DEFAULT_ENVIRONMENT } from './src/config/environments';
import { CARD_SHADOW, pressScale } from './src/utils/styles';
import {
  ERROR_CODES,
  SnapError,
  describeError,
  type SnapErrorCode,
} from './src/utils/errorCodes';
import type { User, Cat, Hood, UserProgression } from './src/types';

// ──────────────────────────────────────────────────────────────────────────────
// Screen state machine
// ──────────────────────────────────────────────────────────────────────────────

type ActiveTab = 'home' | 'catalog' | 'hoods' | 'friends';

type ScreenState =
  | { type: 'tabs'; tab: ActiveTab }
  | { type: 'camera' }
  | { type: 'sprite_reveal'; capturedPhotoUri: string }
  | { type: 'field_notes'; capturedPhotoUri?: string; spriteTemplateId?: string; extractedColors?: HexColor[] }
  | { type: 'friend_hood'; friendUid: string }
  | { type: 'scrapbook'; cat: Cat }
  | { type: 'hood_detail'; hoodId: string; hood: Hood };

/** Swap for the authenticated UID once auth is wired up. */
const CURRENT_UID = 'user_alice';

// ──────────────────────────────────────────────────────────────────────────────
// App
// ──────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [progression, setProgression] = useState<UserProgression | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>({ type: 'tabs', tab: 'home' });
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
      if (screenState.type !== 'tabs') {
        // sprite_reveal ✕ goes back to camera so the user can retake, not to home
        if (screenState.type === 'sprite_reveal') {
          setScreenState({ type: 'camera' });
          return true;
        }
        const returnTab: ActiveTab =
          screenState.type === 'camera'       ? 'home'
          : screenState.type === 'field_notes' ? 'home'
          : screenState.type === 'friend_hood' ? 'friends'
          : screenState.type === 'hood_detail' ? 'hoods'
          : 'catalog'; // scrapbook
        setScreenState({ type: 'tabs', tab: returnTab });
        return true;
      }
      if (screenState.tab !== 'home') {
        setScreenState({ type: 'tabs', tab: 'home' });
        return true;
      }
      return false; // exit app from Home
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
    setUser((u) => (u ? { ...u, hoods: { ...u.hoods, [hoodId]: updated } } : u));
    // Keep hood_detail state in sync if the user is currently viewing it
    setScreenState((s) =>
      s.type === 'hood_detail' && s.hoodId === hoodId ? { ...s, hood: updated } : s,
    );
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
  const goToCamera = useCallback(
    () => setScreenState({ type: 'camera' }),
    [],
  );

  const handleCreateHood = useCallback(async (name: string) => {
    const created = await createHood(CURRENT_UID, name);
    if (created) {
      setUser((u) =>
        u ? { ...u, hoods: { ...u.hoods, [created.hoodId]: created.hood } } : u,
      );
      // Jump straight into the new Hood so the user can start placing items
      setScreenState({ type: 'hood_detail', hoodId: created.hoodId, hood: created.hood });
    }
  }, []);

  // ── Boot error ─────────────────────────────────────────────────────────────
  if (bootError) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#FAF6F0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}
      >
        <Text style={{ fontSize: 46, marginBottom: 16 }}>🙀</Text>
        <Text style={{ fontSize: 18, fontWeight: '800', color: '#2C2A29', textAlign: 'center' }}>
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
        <Pressable
          onPress={boot}
          style={({ pressed }) => [
            pressScale(pressed, 0.95),
            {
              marginTop: 24,
              backgroundColor: pressed ? '#E67035' : '#FF8E53',
              borderRadius: 14,
              paddingHorizontal: 32,
              paddingVertical: 14,
              minHeight: 44,
              justifyContent: 'center',
            },
          ]}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Try Again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!user || !progression) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: '#FAF6F0', alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontSize: 42, marginBottom: 18 }}>🐾</Text>
        <ActivityIndicator size="large" color="#FF8E53" />
        <Text style={{ marginTop: 14, fontSize: 13, color: '#706B67' }}>
          Loading SnapaCat…
        </Text>
      </SafeAreaView>
    );
  }

  // ── Full-screen sub-states (no bottom tab bar) ─────────────────────────────
  if (screenState.type === 'camera') {
    return (
      <SafeAreaProvider>
        <CameraScreen
          onBack={() => setScreenState({ type: 'tabs', tab: 'home' })}
          onProceedToFieldNotes={(capturedPhotoUri) =>
            // If a photo was taken → go through sprite reveal; otherwise straight to field notes
            capturedPhotoUri
              ? setScreenState({ type: 'sprite_reveal', capturedPhotoUri })
              : setScreenState({ type: 'field_notes' })
          }
          onOpenCatalog={() => setScreenState({ type: 'tabs', tab: 'catalog' })}
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
      <FieldNotesScreen
        userId={CURRENT_UID}
        progression={progression}
        onUpdateProgression={handleUpdateProgression}
        capturedPhotoUri={screenState.capturedPhotoUri}
        spriteTemplateId={screenState.spriteTemplateId}
        extractedColors={screenState.extractedColors}
        onRetakePhoto={goToCamera}
        onBack={() => setScreenState({ type: 'tabs', tab: 'home' })}
        onSubmitSuccess={() => setScreenState({ type: 'tabs', tab: 'catalog' })}
      />
    );
  }

  if (screenState.type === 'scrapbook') {
    return (
      <ScrapbookScreen
        cat={screenState.cat}
        onBack={() => setScreenState({ type: 'tabs', tab: 'catalog' })}
      />
    );
  }

  if (screenState.type === 'hood_detail') {
    return (
      <HoodScreen
        hoodId={screenState.hoodId}
        hood={screenState.hood}
        onUpdateHood={handleUpdateHood}
        onBack={() => setScreenState({ type: 'tabs', tab: 'hoods' })}
        progression={progression}
        onUpdateProgression={handleUpdateProgression}
        userId={CURRENT_UID}
      />
    );
  }

  if (screenState.type === 'friend_hood') {
    return (
      <FriendHoodScreen
        friendUid={screenState.friendUid}
        onBack={() => setScreenState({ type: 'tabs', tab: 'friends' })}
      />
    );
  }

  // ── Bottom-tab layout ──────────────────────────────────────────────────────
  const { tab } = screenState;

  return (
    <SafeAreaProvider>
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF6F0' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF6F0" />
      <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeScreen
            user={user}
            progression={progression}
            onOpenCatalog={() => setScreenState({ type: 'tabs', tab: 'catalog' })}
            onLogSpotting={goToCamera}
            onOpenHoods={() => setScreenState({ type: 'tabs', tab: 'hoods' })}
            onOpenFriends={() => setScreenState({ type: 'tabs', tab: 'friends' })}
            onViewScrapbook={goToScrapbook}
          />
        )}

        {tab === 'catalog' && (
          <CatalogScreen
            userId={CURRENT_UID}
            onLogSpotting={goToCamera}
            onViewScrapbook={goToScrapbook}
          />
        )}

        {tab === 'hoods' && (
          <HoodsTab
            user={user}
            onOpenHood={(hoodId, hood) =>
              setScreenState({ type: 'hood_detail', hoodId, hood })
            }
            onCreateHood={handleCreateHood}
          />
        )}

        {tab === 'friends' && (
          <FriendsScreen
            currentUid={CURRENT_UID}
            currentUser={user}
            onBack={() => setScreenState({ type: 'tabs', tab: 'home' })}
            onViewFriendHood={(friendUid) =>
              setScreenState({ type: 'friend_hood', friendUid })
            }
          />
        )}
      </View>

      <BottomTabBar
        activeTab={tab}
        onSelectTab={(t) => setScreenState({ type: 'tabs', tab: t })}
        onOpenCamera={goToCamera}
      />

      {streakToast != null && (
        <StreakToast count={streakToast} onDone={() => setStreakToast(null)} />
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// StreakToast — brief banner acknowledging the daily streak bonus
// ──────────────────────────────────────────────────────────────────────────────

function StreakToast({ count, onDone }: { count: number; onDone: () => void }) {
  const slide = useRef(new Animated.Value(-72)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(slide, { toValue: 0, tension: 70, friction: 10, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.timing(slide, { toValue: -72, duration: 260, useNativeDriver: true }),
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
        top: 10,
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
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#2C2A29' }}>
          {count > 1 ? `Day ${count} streak!` : 'Welcome back!'}
        </Text>
        <Text style={{ fontSize: 12, color: '#706B67', marginTop: 1 }}>
          +25 🐾 PawPoints daily bonus
        </Text>
      </View>
    </Animated.View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// HoodsTab — Hood picker shown in the hoods bottom tab
// ──────────────────────────────────────────────────────────────────────────────

function HoodsTab({
  user,
  onOpenHood,
  onCreateHood,
}: {
  user: User;
  onOpenHood: (hoodId: string, hood: Hood) => void;
  onCreateHood: (name: string) => Promise<void>;
}) {
  const hoodEntries = Object.entries(user.hoods);
  const [showCreate, setShowCreate] = useState(false);
  const [newHoodName, setNewHoodName] = useState('');
  const [creating, setCreating] = useState(false);

  const submitCreate = async () => {
    const name = newHoodName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await onCreateHood(name);
      setShowCreate(false);
      setNewHoodName('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF6F0' }}>
      {/* Create Hood modal */}
      <Modal
        visible={showCreate}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreate(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(20,14,8,0.45)',
            justifyContent: 'center',
            paddingHorizontal: 28,
          }}
        >
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: '#2C2A29' }}>
              New Hood 🏡
            </Text>
            <Text style={{ fontSize: 12, color: '#706B67', marginTop: 4, lineHeight: 18 }}>
              Name a spot where you see cats — no GPS, just a label you'll recognise.
            </Text>
            <TextInput
              value={newHoodName}
              onChangeText={setNewHoodName}
              placeholder="e.g. Backyard Deck, Corner Store…"
              placeholderTextColor="#B0ABA6"
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={submitCreate}
              maxLength={40}
              style={{
                marginTop: 14,
                backgroundColor: '#FAF6F0',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 15,
                color: '#2C2A29',
                borderWidth: 1,
                borderColor: '#EAE3DA',
                minHeight: 44,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => { setShowCreate(false); setNewHoodName(''); }}
                style={({ pressed }) => [
                  pressScale(pressed),
                  {
                    flex: 1, minHeight: 46, borderRadius: 13,
                    justifyContent: 'center', alignItems: 'center',
                    backgroundColor: '#FAF6F0', borderWidth: 1, borderColor: '#EAE3DA',
                  },
                ]}
              >
                <Text style={{ fontWeight: '700', color: '#706B67', fontSize: 14 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submitCreate}
                disabled={!newHoodName.trim() || creating}
                style={({ pressed }) => [
                  pressScale(pressed, 0.96),
                  {
                    flex: 1, minHeight: 46, borderRadius: 13,
                    justifyContent: 'center', alignItems: 'center',
                    backgroundColor: pressed ? '#E67035' : '#FF8E53',
                    opacity: !newHoodName.trim() || creating ? 0.45 : 1,
                  },
                ]}
              >
                <Text style={{ fontWeight: '800', color: '#FFFFFF', fontSize: 14 }}>
                  {creating ? 'Creating…' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(234,227,218,0.6)',
          backgroundColor: '#FFFFFF',
        }}
      >
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#2C2A29' }}>My Hoods</Text>
          <Text style={{ fontSize: 12, color: '#706B67', marginTop: 2 }}>
            Manage items in your customised locations
          </Text>
        </View>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={({ pressed }) => [
            pressScale(pressed, 0.94),
            {
              backgroundColor: pressed ? '#E67035' : '#FF8E53',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 10,
              minHeight: 44,
              justifyContent: 'center',
            },
          ]}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>+ New Hood</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {hoodEntries.map(([hoodId, hood]) => {
          const env = getEnvironmentById(hood.active_environment_id ?? '') ?? DEFAULT_ENVIRONMENT;
          const spawn = calculateSpawnChances(hood.placed_items, env.spawn_multiplier);
          return (
            <Pressable
              key={hoodId}
              onPress={() => onOpenHood(hoodId, hood)}
              style={({ pressed }) => [
                CARD_SHADOW,
                pressScale(pressed, 0.98),
                {
                  backgroundColor: '#FFFFFF',
                  borderRadius: 20,
                  padding: 20,
                  marginBottom: 14,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View
                  style={{
                    width: 44, height: 44, borderRadius: 14,
                    backgroundColor: '#FAF6F0', borderWidth: 1, borderColor: '#EAE3DA',
                    alignItems: 'center', justifyContent: 'center', marginRight: 14,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{env.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: '#2C2A29' }}>
                    {hood.name}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#706B67', marginTop: 3 }}>
                    {env.name} · {hood.placed_items.length} item{hood.placed_items.length !== 1 ? 's' : ''} · 🐱 ~{spawn.expectedCats}/{MAX_HOOD_CATS}
                  </Text>
                </View>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#FFE8DC',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#E67035', fontWeight: '700', fontSize: 20 }}>›</Text>
                </View>
              </View>
            </Pressable>
          );
        })}

        {hoodEntries.length === 0 && (
          <View
            style={[
              CARD_SHADOW,
              {
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 32,
                alignItems: 'center',
                borderWidth: 1.5,
                borderColor: 'rgba(255,142,83,0.3)',
                borderStyle: 'dashed',
              },
            ]}
          >
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🏡</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#2C2A29' }}>No Hoods yet</Text>
            <Text
              style={{ fontSize: 12, color: '#706B67', marginTop: 6, textAlign: 'center', lineHeight: 18 }}
            >
              A Hood is a spot where you see cats. Create one and start placing items to attract them.
            </Text>
            <Pressable
              onPress={() => setShowCreate(true)}
              style={({ pressed }) => [
                pressScale(pressed, 0.95),
                {
                  marginTop: 18,
                  backgroundColor: pressed ? '#E67035' : '#FF8E53',
                  borderRadius: 13,
                  paddingHorizontal: 24,
                  paddingVertical: 13,
                  minHeight: 44,
                  justifyContent: 'center',
                },
              ]}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                + Create Your First Hood
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// BottomTabBar — 4 tabs flanking a centre camera FAB
// ──────────────────────────────────────────────────────────────────────────────

const LEFT_TABS:  { id: ActiveTab; icon: string; label: string }[] = [
  { id: 'home',    icon: '🏠', label: 'Home' },
  { id: 'catalog', icon: '🐱', label: 'Cat-a-log' },
];
const RIGHT_TABS: { id: ActiveTab; icon: string; label: string }[] = [
  { id: 'hoods',   icon: '📍', label: 'Hoods' },
  { id: 'friends', icon: '👥', label: 'Friends' },
];

function BottomTabBar({
  activeTab,
  onSelectTab,
  onOpenCamera,
}: {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenCamera: () => void;
}) {
  function TabItem({ id, icon, label }: { id: ActiveTab; icon: string; label: string }) {
    const isActive = id === activeTab;
    return (
      <Bouncy
        onPress={() => onSelectTab(id)}
        scaleTo={0.88}
        containerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 6,
          paddingVertical: 5,
          borderRadius: 12,
          backgroundColor: isActive ? '#FFE8DC' : 'transparent',
        }}
      >
        <Text style={{ fontSize: 18, opacity: isActive ? 1 : 0.5 }}>{icon}</Text>
        <Text
          style={{
            fontSize: 9,
            fontWeight: '700',
            marginTop: 2,
            color: isActive ? '#E67035' : '#706B67',
            opacity: isActive ? 1 : 0.65,
          }}
        >
          {label}
        </Text>
      </Bouncy>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: 'rgba(234,227,218,0.6)',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        minHeight: 70,
        paddingVertical: 6,
      }}
    >
      {LEFT_TABS.map((t) => <TabItem key={t.id} {...t} />)}

      {/* Centre camera FAB */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Bouncy
          onPress={onOpenCamera}
          scaleTo={0.88}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#FF8E53',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: '#FFFFFF',
            shadowColor: '#FF8E53',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.35,
            shadowRadius: 6,
            elevation: 5,
          }}
        >
          <Text style={{ fontSize: 22 }}>📸</Text>
        </Bouncy>
      </View>

      {RIGHT_TABS.map((t) => <TabItem key={t.id} {...t} />)}
    </View>
  );
}
