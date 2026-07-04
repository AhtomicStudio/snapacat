jest.mock('@react-native-firebase/app', () => ({
  getApp: jest.fn(() => ({})),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
}));

jest.mock('@react-native-firebase/storage', () => ({
  getStorage: jest.fn(() => ({})),
}));

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

import {
  isValidUid,
  generateHandshakeToken,
  parseHandshakeToken,
  addFriend,
} from '../socialHandler';
import { getUser, resetMockDb, setMockMode, mockCats } from '../../services/dbService';

describe('Social Handshake Helper (socialHandler)', () => {
  beforeEach(() => {
    setMockMode(true);
    resetMockDb();
  });

  describe('isValidUid', () => {
    it('returns true for valid alphanumeric UIDs', () => {
      expect(isValidUid('user_alice')).toBe(true);
      expect(isValidUid('A1b2C3d4_E5f6')).toBe(true);
    });

    it('returns false for invalid inputs', () => {
      expect(isValidUid('')).toBe(false);
      expect(isValidUid('   ')).toBe(false);
      expect(isValidUid('ab')).toBe(false); // too short
      expect(isValidUid('invalid!chars')).toBe(false);
    });
  });

  describe('generateHandshakeToken', () => {
    it('generates correct snapacat://friend/ token', () => {
      expect(generateHandshakeToken('user_alice')).toBe('snapacat://friend/user_alice');
    });

    it('throws error for invalid UIDs', () => {
      expect(() => generateHandshakeToken('ab')).toThrow();
    });
  });

  describe('parseHandshakeToken', () => {
    it('parses scheme tokens correctly', () => {
      expect(parseHandshakeToken('snapacat://friend/user_bob')).toBe('user_bob');
    });

    it('accepts direct valid UIDs as fallbacks', () => {
      expect(parseHandshakeToken('user_bob')).toBe('user_bob');
    });

    it('returns null for invalid tokens', () => {
      expect(parseHandshakeToken('invalid_scheme://user_bob')).toBeNull();
      expect(parseHandshakeToken('')).toBeNull();
      expect(parseHandshakeToken('ab')).toBeNull();
    });
  });

  describe('addFriend Handshake', () => {
    it('registers bi-directional friendship if both users exist', async () => {
      // Alice and Bob exist in mock database
      const success = await addFriend('user_alice', 'user_bob');
      expect(success).toBe(true);

      const alice = await getUser('user_alice');
      const bob = await getUser('user_bob');

      expect(alice?.friends).toContain('user_bob');
      expect(bob?.friends).toContain('user_alice');
    });

    it('returns false if friend does not exist', async () => {
      const success = await addFriend('user_alice', 'user_nonexistent');
      expect(success).toBe(false);
    });

    it('returns false if currentUid and friendUid are identical', async () => {
      const success = await addFriend('user_alice', 'user_alice');
      expect(success).toBe(false);
    });
  });
});
