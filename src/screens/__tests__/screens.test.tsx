jest.mock('react-native', () => {
  const React = require('react');
  const View = (props: any) => React.createElement('View', props, props.children);
  const Text = (props: any) => React.createElement('Text', props, props.children);
  const TouchableOpacity = (props: any) => React.createElement('TouchableOpacity', props, props.children);
  const Pressable = (props: any) => React.createElement('Pressable', props, typeof props.children === 'function' ? props.children({ pressed: false }) : props.children);
  const TextInput = (props: any) => React.createElement('TextInput', props, props.children);
  const ScrollView = (props: any) => React.createElement('ScrollView', props, props.children);
  const SafeAreaView = (props: any) => React.createElement('SafeAreaView', props, props.children);
  const FlatList = (props: any) => React.createElement('FlatList', props, props.children);
  const ActivityIndicator = (props: any) => React.createElement('ActivityIndicator', props, props.children);
  const Image = (props: any) => React.createElement('Image', props, props.children);
  const Modal = (props: any) => (props.visible ? React.createElement('Modal', props, props.children) : null);
  const Animated = {
    Value: class {
      constructor(v: any) {}
      interpolate() { return '0%'; }
      setValue() {}
      stopAnimation() {}
    },
    timing: () => ({ start: jest.fn() }),
    sequence: () => ({ start: jest.fn() }),
    spring: () => ({ start: jest.fn() }),
    parallel: () => ({ start: jest.fn() }),
    delay: () => ({ start: jest.fn() }),
    loop: () => ({ start: jest.fn(), stop: jest.fn() }),
    multiply: () => 0,
    View: (props: any) => React.createElement('View', props, props.children),
    Text: (props: any) => React.createElement('Text', props, props.children),
  };
  const UIManager = { setLayoutAnimationEnabledExperimental: jest.fn() };
  const LayoutAnimation = { configureNext: jest.fn(), Presets: { easeInEaseOut: {} } };
  const Easing = {
    out: jest.fn(() => jest.fn()),
    inOut: jest.fn(() => jest.fn()),
    cubic: jest.fn(),
    quad: jest.fn(),
    linear: jest.fn(),
  };
  const Platform = { OS: 'android' };
  const Alert = { alert: jest.fn() };
  const Linking = { openSettings: jest.fn() };
  const StyleSheet = { absoluteFill: {}, create: (s: any) => s };
  return {
    View,
    Text,
    TouchableOpacity,
    Pressable,
    TextInput,
    ScrollView,
    SafeAreaView,
    FlatList,
    ActivityIndicator,
    Image,
    Modal,
    Animated,
    UIManager,
    LayoutAnimation,
    Easing,
    Platform,
    Alert,
    Linking,
    StyleSheet,
  };
});

// Screens use SafeAreaView from react-native-safe-area-context, not react-native.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  function SafeAreaView(props: any) {
    return React.createElement('SafeAreaView', props, props.children);
  }
  function SafeAreaProvider(props: any) {
    return React.createElement('SafeAreaProvider', props, props.children);
  }
  return {
    SafeAreaView,
    SafeAreaProvider,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({})),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
}));

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
}));

import React from 'react';
import { CatalogScreen } from '../CatalogScreen';
import { FieldNotesScreen } from '../FieldNotesScreen';
import { HoodScreen } from '../HoodScreen';
import { FriendHoodScreen } from '../FriendHoodScreen';

jest.mock('@react-native-firebase/firestore', () => {
  class MockTimestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    static now() {
      return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
    }
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
  }

  return {
    Timestamp: MockTimestamp,
    initializeFirestore: jest.fn(),
    getFirestore: jest.fn(() => ({})),
    collection: jest.fn(() => ({})),
    doc: jest.fn(() => ({})),
    CACHE_SIZE_UNLIMITED: 0,
    serverTimestamp: jest.fn(() => ({})),
  };
});

describe('Screens Render Tests', () => {
  let useStateSpy: jest.SpyInstance;
  let useEffectSpy: jest.SpyInstance;
  let useCallbackSpy: jest.SpyInstance;
  let useMemoSpy: jest.SpyInstance;
  let useRefSpy: jest.SpyInstance;

  beforeAll(() => {
    // Mock standard hooks to allow calling functional components as plain functions
    useStateSpy = jest.spyOn(React, 'useState').mockImplementation((initialValue?: any) => {
      return [initialValue, jest.fn()] as any;
    });
    useEffectSpy = jest.spyOn(React, 'useEffect').mockImplementation((f) => {
      // Don't execute immediately in test to avoid running db calls inside hooks in this test
    });
    useCallbackSpy = jest.spyOn(React, 'useCallback').mockImplementation((fn: any) => fn);
    useMemoSpy = jest.spyOn(React, 'useMemo').mockImplementation((fn: any) => fn());
    useRefSpy = jest.spyOn(React, 'useRef').mockImplementation((initialValue?: any) => ({
      current: initialValue,
    }));
  });

  afterAll(() => {
    useStateSpy.mockRestore();
    useEffectSpy.mockRestore();
    useCallbackSpy.mockRestore();
    useMemoSpy.mockRestore();
    useRefSpy.mockRestore();
  });

  describe('CatalogScreen', () => {
    it('renders CatalogScreen without crashing', () => {
      const onLogSpotting = jest.fn();
      const onViewScrapbook = jest.fn();

      const element = CatalogScreen({
        userId: 'user_test',
        onLogSpotting,
        onViewScrapbook,
      });

      expect(element).toBeDefined();
      expect(element.type.name).toBe('SafeAreaView');
    });
  });

  describe('FieldNotesScreen', () => {
    it('renders FieldNotesScreen without crashing', () => {
      const onBack = jest.fn();
      const onSubmitSuccess = jest.fn();

      const element = FieldNotesScreen({
        userId: 'user_test',
        onBack,
        onSubmitSuccess,
      });

      expect(element).toBeDefined();
      expect(element.type.name).toBe('SafeAreaView');
    });
  });

  describe('HoodScreen', () => {
    it('renders HoodScreen without crashing', () => {
      const onUpdateHood = jest.fn();
      const onBack = jest.fn();
      const onUpdateProgression = jest.fn();

      const element = HoodScreen({
        hoodId: 'hood_test',
        hood: {
          name: 'Test Backyard',
          custom_bg_url: null,
          placed_items: ['item_toy_mouse'],
        },
        onUpdateHood,
        onBack,
        progression: {
          paw_points: 0,
          unlocked_themes: ['theme_default'],
          unlocked_items: ['item_kibble_bowl', 'item_toy_mouse', 'item_cardboard_box', 'item_catnip_plant'],
          active_theme_id: null,
        },
        onUpdateProgression,
        userId: 'user_test',
      });

      expect(element).toBeDefined();
    });
  });

  describe('FriendHoodScreen', () => {
    it('renders FriendHoodScreen without crashing', () => {
      const onBack = jest.fn();

      const element = FriendHoodScreen({
        friendUid: 'user_bob',
        onBack,
      });

      expect(element).toBeDefined();
      expect(element.type.name).toBe('SafeAreaView');
    });
  });
});
