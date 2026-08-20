import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { addFriend } from '../services/dbService';
import { Touchable } from './Touchable';
import { color, space, radius, shadow, fontSize, weight, TAP_MIN } from '../theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AddFriendProps {
  currentUid: string;
  onFriendAdded?: (friendUid: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

export function AddFriend({ currentUid, onFriendAdded }: AddFriendProps) {
  const [inputValue, setInputValue] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const trimmedUid = inputValue.trim();
  const canSubmit = trimmedUid.length > 0 && submitState !== 'loading';

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitState('loading');
    setErrorMessage('');

    try {
      await addFriend(currentUid, trimmedUid);
      setSubmitState('success');
      setInputValue('');
      onFriendAdded?.(trimmedUid);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitState('error');
    }
  }

  function handleChangeText(text: string) {
    setInputValue(text);
    if (submitState === 'success' || submitState === 'error') {
      setSubmitState('idle');
      setErrorMessage('');
    }
  }

  return (
    <View style={styles.card}>
      {/*
        The card carried its own "Add a Friend" heading AND the screen printed
        one above it, so the phrase appeared twice in a row. The screen owns the
        section title; this card just does the work.
      */}
      <View style={styles.field}>
        <Text style={styles.label}>Friend's UID</Text>
        <TextInput
          value={inputValue}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          placeholder="e.g. abc123xyz"
          placeholderTextColor={color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          accessibilityLabel="Friend's UID"
          style={[
            styles.input,
            submitState === 'error' ? { borderColor: color.error } : null,
          ]}
        />

        {submitState === 'error' && <Text style={styles.error}>{errorMessage}</Text>}
        {submitState === 'success' && (
          <Text style={styles.success}>Friend added successfully! 🐾</Text>
        )}
      </View>

      <Touchable
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        accessibilityLabel="Add friend"
        style={[styles.submit, canSubmit ? styles.submitEnabled : styles.submitDisabled]}
      >
        {submitState === 'loading' ? (
          <ActivityIndicator size="small" color={color.milk} />
        ) : (
          <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
            Add Friend
          </Text>
        )}
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.md,
    gap: space.md,
    ...shadow.card,
  },
  field: { gap: space.xs },
  label: {
    fontSize: fontSize.sm,
    fontWeight: weight.semibold,
    color: color.textPrimary,
  },
  input: {
    backgroundColor: color.background,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    fontSize: fontSize.sm,
    color: color.textPrimary,
    // Without this the field collapses to the text's own height and reads as
    // a bare line of placeholder copy rather than an input.
    minHeight: TAP_MIN,
  },
  error: { fontSize: fontSize.xs, color: color.error },
  success: { fontSize: fontSize.xs, color: '#16A34A' },

  submit: {
    borderRadius: radius.sm + 4,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    minHeight: TAP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  submitEnabled: { backgroundColor: color.ginger, ...shadow.button },
  submitDisabled: { backgroundColor: color.gingerLight },
  submitText: { color: color.milk, fontWeight: weight.bold, fontSize: fontSize.sm },
  submitTextDisabled: { color: color.gingerDark },
});
