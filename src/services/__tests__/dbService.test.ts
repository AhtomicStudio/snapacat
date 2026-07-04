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

import { Timestamp } from '@react-native-firebase/firestore';
import {
  getCats,
  getCat,
  createCat,
  addScrapbookEntry,
  getUser,
  updateHoodItems,
  resetMockDb,
  setMockMode,
  mockCats,
} from '../dbService';
import { BRAND_COLORS, getSpriteTemplateColors } from '../../utils/colorExtractor';

describe('Database Service Layer (dbService)', () => {
  beforeEach(() => {
    // Ensure we are in mock mode and reset the collections
    setMockMode(true);
    resetMockDb();
  });

  describe('getCats', () => {
    it('should retrieve all cats with proper structure', async () => {
      const cats = await getCats();
      expect(cats.length).toBeGreaterThan(0);

      // Verify structure of a cat document
      const cat = cats[0];
      expect(cat).toBeDefined();
      expect(cat?.cat_id).toBeDefined();
      expect(cat?.owner_uid).toBeDefined();
      expect(cat?.name).toBeDefined();
      expect(cat?.gender).toBeDefined();
      expect(cat?.sprite_template_id).toBeDefined();
      expect(Array.isArray(cat?.scrapbook)).toBe(true);
    });

    it('should scope to a single owner when ownerUid is provided', async () => {
      const aliceCats = await getCats('user_alice');
      const bobCats = await getCats('user_bob');
      const allCats = await getCats();

      expect(aliceCats.length).toBeGreaterThan(0);
      expect(bobCats.length).toBeGreaterThan(0);
      expect(aliceCats.every((c) => c.owner_uid === 'user_alice')).toBe(true);
      expect(bobCats.every((c) => c.owner_uid === 'user_bob')).toBe(true);
      // Personal collections don't overlap and don't exceed the full set
      expect(aliceCats.length + bobCats.length).toBeLessThanOrEqual(allCats.length);
    });
  });

  describe('getCat', () => {
    it('should fetch a single cat by ID', async () => {
      const cat = await getCat('cat_ginger_tabby');
      expect(cat).toBeDefined();
      expect(cat?.name).toBe('Mochi');
      expect(cat?.sprite_template_id).toBe('orange_mackerel_tabby');
    });

    it('should return null for non-existent cat IDs', async () => {
      const cat = await getCat('invalid_cat_id');
      expect(cat).toBeNull();
    });
  });

  describe('addScrapbookEntry', () => {
    it('should append a new scrapbook entry (Field Note) with auto-extracted colors and unique ID', async () => {
      const entry = await addScrapbookEntry('cat_siamese', {
        user_id: 'user_alice',
        hood_name: 'Backyard Deck',
        note_text: 'Coco visited today and drank water.',
      });

      expect(entry).not.toBeNull();
      expect(entry?.sighting_id).toBeDefined();
      expect(entry?.cat_id).toBe('cat_siamese');
      expect(entry?.user_id).toBe('user_alice');
      expect(entry?.hood_name).toBe('Backyard Deck');
      expect(entry?.note_text).toBe('Coco visited today and drank water.');
      expect(entry?.timestamp).toBeInstanceOf(Timestamp);

      // Colors fall back to the cat's sprite template palette (Coco = seal_point)
      expect(entry?.extracted_colors).toEqual(getSpriteTemplateColors('seal_point'));

      // Verify that the entry was appended to the cat document
      const updatedCat = await getCat('cat_siamese');
      expect(updatedCat?.scrapbook.length).toBe(1);
      expect(updatedCat?.scrapbook[0]?.sighting_id).toBe(entry?.sighting_id);
    });

    it('should extract dominant colors from custom pixel list if template is unrecognized', async () => {
      const cat = mockCats.find(c => c.cat_id === 'cat_siamese');
      if (cat) {
        cat.sprite_template_id = 'custom_unrecognized_template';
      }

      const entry = await addScrapbookEntry('cat_siamese', {
        user_id: 'user_alice',
        hood_name: 'Alleyway',
        note_text: 'Spotted a custom colored siamese.',
        photoPixels: [
          { r: 255, g: 255, b: 255 }, // white
          { r: 255, g: 142, b: 83 },  // ginger
        ],
      });

      expect(entry?.extracted_colors).toContain(BRAND_COLORS.milk);
      expect(entry?.extracted_colors).toContain(BRAND_COLORS.ginger);
    });

    it('should return null if the target cat ID does not exist', async () => {
      const entry = await addScrapbookEntry('non_existent_cat', {
        user_id: 'user_alice',
        hood_name: 'Work Parking Lot',
        note_text: 'Nothing here.',
      });
      expect(entry).toBeNull();
    });
  });

  describe('createCat', () => {
    it('stamps the owner and lands in that owner\'s scoped collection', async () => {
      const newCat = await createCat('Biscuit', 'female', 'calico', 'user_bob');
      expect(newCat.owner_uid).toBe('user_bob');

      const bobCats = await getCats('user_bob');
      expect(bobCats.some((c) => c.cat_id === newCat.cat_id)).toBe(true);

      const aliceCats = await getCats('user_alice');
      expect(aliceCats.some((c) => c.cat_id === newCat.cat_id)).toBe(false);
    });
  });

  describe('getUser', () => {
    it('should fetch user document with Hood spaces configurations', async () => {
      const user = await getUser('user_alice');
      expect(user).not.toBeNull();
      expect(user?.username).toBe('AliceSnaps');
      expect(user?.friends).toContain('user_bob');

      // Verify the Hood configs
      expect(user?.hoods['hood_parking_lot']).toBeDefined();
      expect(user?.hoods['hood_parking_lot']?.name).toBe('Work Parking Lot');
      expect(user?.hoods['hood_parking_lot']?.placed_items).toContain('item_toy_mouse');
    });

    it('should return null for non-existent user UIDs', async () => {
      const user = await getUser('non_existent_user');
      expect(user).toBeNull();
    });
  });

  describe('updateHoodItems', () => {
    it('should update placed items in the target Hood for a user', async () => {
      const success = await updateHoodItems(
        'user_alice',
        'hood_parking_lot',
        ['item_premium_kibble']
      );

      expect(success).toBe(true);

      const user = await getUser('user_alice');
      expect(user?.hoods['hood_parking_lot']?.placed_items).toEqual(['item_premium_kibble']);
    });

    it('should return false if updating non-existent user or hood', async () => {
      const success1 = await updateHoodItems('invalid_user', 'hood_parking_lot', []);
      const success2 = await updateHoodItems('user_alice', 'invalid_hood', []);

      expect(success1).toBe(false);
      expect(success2).toBe(false);
    });
  });
});
