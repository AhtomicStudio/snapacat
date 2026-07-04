import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { addFriend } from '../services/dbService';

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
    <View className="bg-card-bg rounded-2xl border border-border p-md shadow-card gap-md">
      {/* Card heading */}
      <View>
        <Text className="text-base font-bold text-text-primary font-display">
          Add a Friend
        </Text>
        <Text className="text-xs text-text-secondary font-sans mt-xs">
          Enter their UID to connect and view their Hoods
        </Text>
      </View>

      {/* Input group */}
      <View className="gap-xs">
        <Text className="text-sm font-semibold text-text-primary font-sans">
          Friend's UID
        </Text>
        <TextInput
          value={inputValue}
          onChangeText={handleChangeText}
          onSubmitEditing={handleSubmit}
          placeholder="e.g. abc123xyz"
          placeholderTextColor="#706B67"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          className="bg-background border border-border rounded-lg px-md py-sm text-sm text-text-primary font-sans"
          style={{ borderColor: submitState === 'error' ? '#F79E89' : undefined }}
        />

        {/* Inline feedback */}
        {submitState === 'error' && (
          <Text className="text-xs text-error font-sans">{errorMessage}</Text>
        )}
        {submitState === 'success' && (
          <Text className="text-xs text-success font-sans">
            Friend added successfully! 🐾
          </Text>
        )}
      </View>

      {/* Submit button */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit}
        activeOpacity={0.75}
        className={`rounded-xl py-sm px-md items-center justify-center flex-row gap-sm ${
          canSubmit ? 'bg-ginger shadow-button' : 'bg-ginger-light opacity-60'
        }`}
      >
        {submitState === 'loading' ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text className="text-milk font-bold text-sm font-display">
            Add Friend
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
