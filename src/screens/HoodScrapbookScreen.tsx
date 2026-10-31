/**
 * A Hood's scrapbook — the page where a neighbourhood accumulates a character.
 *
 * WHAT IT IS FOR
 *
 * The Cat-a-log answers "which cats exist and have I met them", which makes it
 * an index: a Pokédex, and useful as one. What it cannot hold is anything
 * about a PLACE. Every note in the app hung off a cat, so there was nowhere to
 * record that the tabby by the bins only turns up when it rains, or to keep a
 * photo of the car park itself rather than of something sitting in it.
 *
 * So this is the other half: one scrapbook per Hood, with two kinds of page.
 * Sightings logged in this Hood arrive on their own — they are already written
 * down, and a scrapbook that ignored them would be asking the player to keep
 * the same diary twice. Notes are written here by hand, and can carry a photo.
 *
 * WHY IT LOOKS LIKE PAPER
 *
 * The rest of the app is a clean card UI, which is right for a shop and a
 * collection grid and wrong for a diary. Scrapbooks are physical: ruled paper,
 * things taped down slightly crooked, a date in the corner. The crookedness is
 * doing real work — a column of perfectly aligned cards reads as a feed, and a
 * feed is something you scroll past rather than something you keep.
 *
 * The rotation here is a view transform on a text card. It is not the pixel
 * art, which still must never be rotated.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Timestamp } from '@react-native-firebase/firestore';
import { Touchable } from '../components/Touchable';
import { font, color, space, radius, fontSize, TAP_MIN } from '../theme';
import { HIT_SLOP_MD } from '../utils/styles';
import { getCats } from '../services/dbService';
import type { Cat, Hood, HoodNote, ScrapbookEntry } from '../types';

const PAPER = '#F6EFE2';
const RULE = 'rgba(44,42,41,0.055)';
const INK = '#3F3A35';
const TAPE = 'rgba(214,198,166,0.55)';

export interface HoodScrapbookScreenProps {
  hood: Hood;
  hoodId: string;
  /** Sightings are pulled out of this user's cats, loaded here. */
  userId: string;
  /** A photo captured on the way here, to pin to the note being written. */
  pendingPhotoUri?: string;
  onUpdateHood: (hoodId: string, updated: Hood) => void;
  /** Opens the camera and comes back here with a photo. */
  onTakePhoto: () => void;
  onBack: () => void;
}

/** One page: either a sighting the app recorded, or a note the player wrote. */
type Page =
  | { kind: 'sighting'; at: number; entry: ScrapbookEntry; catName: string }
  | { kind: 'note'; at: number; note: HoodNote };

function formatDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

/** The strip of tape holding a page down. Two torn ends, one flat colour. */
function Tape({ tilt }: { tilt: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: -9,
        alignSelf: 'center',
        width: 74,
        height: 20,
        backgroundColor: TAPE,
        transform: [{ rotate: `${tilt}deg` }],
      }}
    />
  );
}

function PageCard({
  tilt,
  children,
}: {
  tilt: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: space.lg + 6, paddingTop: 10 }}>
      <View
        style={{
          backgroundColor: color.surface,
          borderRadius: 4,
          padding: space.md,
          transform: [{ rotate: `${tilt}deg` }],
          shadowColor: '#2C2A29',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.1,
          shadowRadius: 7,
          elevation: 3,
        }}
      >
        <Tape tilt={-tilt * 2.4} />
        {children}
      </View>
    </View>
  );
}

function DateStamp({ seconds }: { seconds: number }) {
  return (
    <Text
      style={{
        fontSize: fontSize.xs - 1,
        fontFamily: font.medium,
        color: color.textMuted,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
      }}
    >
      {formatDate(seconds)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// HoodScrapbookScreen
// ---------------------------------------------------------------------------

export function HoodScrapbookScreen({
  hood,
  hoodId,
  userId,
  pendingPhotoUri,
  onUpdateHood,
  onTakePhoto,
  onBack,
}: HoodScrapbookScreenProps) {
  const [cats, setCats] = useState<Cat[]>([]);

  // Loaded here rather than passed in, the same way the Cat-a-log does it:
  // App has no reason to hold a cat list, and threading one through it would
  // make every screen that does not care about cats carry them.
  useEffect(() => {
    let alive = true;
    getCats(userId)
      .then((list) => { if (alive) setCats(list); })
      .catch(console.error);
    return () => { alive = false; };
  }, [userId]);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const notes = useMemo(() => hood.scrapbook ?? [], [hood.scrapbook]);

  /**
   * A photo arriving from the camera means the player was part-way through
   * writing a note, so the composer reopens rather than making them start
   * again. Derived rather than stored, because the only way to be holding a
   * photo is to have come back from the camera.
   */
  const composerOpen = composing || pendingPhotoUri != null;

  const pages = useMemo<Page[]>(() => {
    const out: Page[] = [];

    for (const cat of cats) {
      for (const entry of cat.scrapbook ?? []) {
        // Hoods are matched by NAME because that is what a sighting records —
        // there is no hood id on a ScrapbookEntry, and inventing one now would
        // orphan every sighting already logged.
        if (entry.hood_name !== hood.name) continue;
        out.push({
          kind: 'sighting',
          at: entry.timestamp?.seconds ?? 0,
          entry,
          catName: cat.name,
        });
      }
    }

    for (const note of notes) {
      out.push({ kind: 'note', at: note.created_at?.seconds ?? 0, note });
    }

    return out.sort((a, b) => b.at - a.at);
  }, [cats, hood.name, notes]);

  const save = useCallback(() => {
    const text = draft.trim();
    if (!text && !pendingPhotoUri) return;

    const note: HoodNote = {
      note_id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: Timestamp.now(),
      text,
      photo_uri: pendingPhotoUri ?? null,
    };

    onUpdateHood(hoodId, { ...hood, scrapbook: [...notes, note] });
    setDraft('');
    setComposing(false);
    Keyboard.dismiss();
  }, [draft, pendingPhotoUri, onUpdateHood, hoodId, hood, notes]);

  const discard = useCallback(() => {
    setDraft('');
    setComposing(false);
    Keyboard.dismiss();
  }, []);

  const removeNote = useCallback(
    (noteId: string) => {
      onUpdateHood(hoodId, { ...hood, scrapbook: notes.filter((n) => n.note_id !== noteId) });
    },
    [onUpdateHood, hoodId, hood, notes],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: PAPER }}>
      {/* Ruled paper. Drawn behind everything and ignoring touches, so it is
          texture rather than a list of empty rows. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        {Array.from({ length: 48 }, (_, i) => (
          <View
            key={i}
            style={{ position: 'absolute', left: 0, right: 0, top: 54 + i * 28, height: 1, backgroundColor: RULE }}
          />
        ))}
        {/* The margin every exercise book has. */}
        <View style={{ position: 'absolute', left: 34, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(214,122,106,0.22)' }} />
      </View>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
        }}
      >
        <Touchable
          onPress={onBack}
          hitSlop={HIT_SLOP_MD}
          accessibilityRole="button"
          accessibilityLabel="Back to the Hood"
          scaleTo={0.9}
          style={{ width: TAP_MIN, height: TAP_MIN, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 22, color: color.ginger }}>←</Text>
        </Touchable>

        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: fontSize.xl, fontFamily: font.bold, color: INK }}>
            {hood.name}
          </Text>
          <Text style={{ fontSize: fontSize.xs, fontFamily: font.regular, color: color.textSecondary }}>
            {pages.length === 0
              ? 'Nothing written down yet'
              : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Composer ──────────────────────────────────────────────────── */}
        {composerOpen ? (
          <PageCard tilt={0}>
            <DateStamp seconds={Math.floor(Date.now() / 1000)} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="What did you notice?"
              placeholderTextColor={color.textMuted}
              multiline
              autoFocus
              style={{
                marginTop: space.sm,
                minHeight: 74,
                fontSize: fontSize.base,
                lineHeight: 23,
                fontFamily: font.regular,
                color: INK,
                textAlignVertical: 'top',
              }}
            />

            {pendingPhotoUri != null && (
              <View style={{ marginTop: space.sm }}>
                {pendingPhotoUri.startsWith('file://') ? (
                  <Image
                    source={{ uri: pendingPhotoUri }}
                    style={{ width: '100%', height: 170, borderRadius: 3 }}
                    resizeMode="cover"
                  />
                ) : (
                  // The camera is mocked on a simulator, which hands back a
                  // mock:// URI that no Image can load. Saying so is better
                  // than a broken frame.
                  <View
                    style={{
                      height: 96,
                      borderRadius: 3,
                      backgroundColor: color.surfaceSunken,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: color.border,
                      borderStyle: 'dashed',
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>📷</Text>
                    <Text style={{ marginTop: 4, fontSize: fontSize.xs, color: color.textMuted, fontFamily: font.medium }}>
                      Photo attached
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
              {pendingPhotoUri == null && (
                <Touchable
                  onPress={onTakePhoto}
                  scaleTo={0.95}
                  accessibilityRole="button"
                  accessibilityLabel="Add a photo to this note"
                  style={{
                    paddingHorizontal: space.md,
                    minHeight: TAP_MIN - 6,
                    justifyContent: 'center',
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: color.border,
                  }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontFamily: font.medium, color: color.textSecondary }}>
                    📷  Photo
                  </Text>
                </Touchable>
              )}

              <View style={{ flex: 1 }} />

              <Touchable
                onPress={discard}
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel="Discard this note"
                style={{ paddingHorizontal: space.md, minHeight: TAP_MIN - 6, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: fontSize.sm, fontFamily: font.medium, color: color.textSecondary }}>
                  Cancel
                </Text>
              </Touchable>

              <Touchable
                onPress={save}
                disabled={!draft.trim() && pendingPhotoUri == null}
                scaleTo={0.95}
                accessibilityRole="button"
                accessibilityLabel="Keep this note"
                disabledStyle={{ opacity: 0.45 }}
                style={{
                  paddingHorizontal: space.lg,
                  minHeight: TAP_MIN - 6,
                  justifyContent: 'center',
                  borderRadius: radius.sm,
                  backgroundColor: color.ginger,
                }}
              >
                <Text style={{ fontSize: fontSize.sm, fontFamily: font.bold, color: color.milk }}>
                  Keep
                </Text>
              </Touchable>
            </View>
          </PageCard>
        ) : (
          <Touchable
            onPress={() => setComposing(true)}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityLabel="Write a note about this Hood"
            style={{
              marginBottom: space.lg,
              paddingVertical: space.md,
              borderRadius: radius.md,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: 'rgba(230,112,53,0.45)',
              alignItems: 'center',
              backgroundColor: 'rgba(255,232,220,0.4)',
            }}
          >
            <Text style={{ fontSize: fontSize.sm, fontFamily: font.bold, color: color.gingerDark }}>
              ✎  Write something down
            </Text>
          </Touchable>
        )}

        {/* ── Pages ─────────────────────────────────────────────────────── */}
        {pages.length === 0 && !composerOpen && (
          <View style={{ alignItems: 'center', paddingVertical: space.xxl }}>
            <Text style={{ fontSize: 34 }}>📖</Text>
            <Text
              style={{
                marginTop: space.sm,
                fontSize: fontSize.sm,
                fontFamily: font.medium,
                color: color.textSecondary,
                textAlign: 'center',
                maxWidth: 260,
                lineHeight: 20,
              }}
            >
              Sightings you log here turn up on these pages. Anything else worth
              remembering about the place, write it yourself.
            </Text>
          </View>
        )}

        {pages.map((page, i) => {
          // Alternating, not random: a shuffle re-tilts every page on each
          // render and the whole book twitches as you scroll.
          const tilt = i % 2 === 0 ? -0.7 : 0.8;

          if (page.kind === 'sighting') {
            const { entry, catName } = page;
            return (
              <PageCard key={entry.sighting_id} tilt={tilt}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text style={{ flex: 1, fontSize: fontSize.base, fontFamily: font.bold, color: INK }}>
                    {catName}
                  </Text>
                  <DateStamp seconds={page.at} />
                </View>

                {entry.note_text ? (
                  <Text
                    style={{
                      marginTop: space.xs + 2,
                      fontSize: fontSize.sm,
                      lineHeight: 21,
                      fontFamily: font.regular,
                      color: color.textSecondary,
                    }}
                  >
                    {entry.note_text}
                  </Text>
                ) : null}

                {entry.extracted_colors?.length ? (
                  <View style={{ flexDirection: 'row', gap: 5, marginTop: space.sm }}>
                    {entry.extracted_colors.slice(0, 5).map((hex, k) => (
                      <View
                        key={k}
                        style={{
                          width: 17,
                          height: 17,
                          borderRadius: 3,
                          backgroundColor: hex,
                          borderWidth: 1,
                          borderColor: 'rgba(44,42,41,0.12)',
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </PageCard>
            );
          }

          const { note } = page;
          return (
            <PageCard key={note.note_id} tilt={tilt}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <DateStamp seconds={page.at} />
                <View style={{ flex: 1 }} />
                <Touchable
                  onPress={() => removeNote(note.note_id)}
                  hitSlop={HIT_SLOP_MD}
                  scaleTo={0.9}
                  accessibilityRole="button"
                  accessibilityLabel="Remove this note"
                  style={{ paddingHorizontal: 4 }}
                >
                  <Text style={{ fontSize: fontSize.sm, color: color.textMuted }}>✕</Text>
                </Touchable>
              </View>

              {note.text ? (
                <Text
                  style={{
                    marginTop: space.xs + 2,
                    fontSize: fontSize.base,
                    lineHeight: 23,
                    fontFamily: font.regular,
                    color: INK,
                  }}
                >
                  {note.text}
                </Text>
              ) : null}

              {note.photo_uri ? (
                note.photo_uri.startsWith('file://') ? (
                  <Image
                    source={{ uri: note.photo_uri }}
                    style={{ width: '100%', height: 170, borderRadius: 3, marginTop: space.sm }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      marginTop: space.sm,
                      height: 86,
                      borderRadius: 3,
                      backgroundColor: color.surfaceSunken,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: color.border,
                      borderStyle: 'dashed',
                    }}
                  >
                    <Text style={{ fontSize: fontSize.xs, color: color.textMuted, fontFamily: font.medium }}>
                      📷  Photo
                    </Text>
                  </View>
                )
              ) : null}
            </PageCard>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
