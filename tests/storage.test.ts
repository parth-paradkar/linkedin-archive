import { describe, it, expect, beforeEach } from 'vitest';
import type { Profile, ScrapedProfile } from '../src/lib/types';

function fakeChrome() {
  let store: Record<string, unknown> = {};
  return {
    reset: () => {
      store = {};
    },
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          if (keys === null) return { ...store };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
        async remove(key: string) {
          delete store[key];
        },
      },
    },
  };
}

const chromeStub = fakeChrome();
(globalThis as unknown as { chrome: unknown }).chrome = chromeStub;

const {
  mergeProfile,
  pickNewer,
  putProfile,
  getProfile,
  allProfiles,
  saveScraped,
  deleteProfile,
  importProfiles,
} = await import('../src/lib/storage');

const scraped = (over: Partial<ScrapedProfile> = {}): ScrapedProfile => ({
  slug: 'jane',
  url: 'https://www.linkedin.com/in/jane',
  name: 'Jane Doe',
  headline: 'Staff Engineer',
  company: 'Acme',
  role: 'Staff Engineer',
  location: 'Berlin',
  about: 'Systems.',
  photoUrl: 'https://media.licdn.com/jane.jpg',
  ...over,
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  ...scraped(),
  savedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  note: '',
  ...over,
});

beforeEach(() => chromeStub.reset());

describe('mergeProfile', () => {
  it('creates a new record with empty user data', () => {
    const p = mergeProfile(undefined, scraped(), '2026-05-05T00:00:00.000Z');
    expect(p.savedAt).toBe('2026-05-05T00:00:00.000Z');
    expect(p.updatedAt).toBe('2026-05-05T00:00:00.000Z');
    expect(p.tags).toEqual([]);
    expect(p.note).toBe('');
  });

  it('preserves notes, tags, and savedAt on re-scrape', () => {
    const existing = profile({ note: 'met at conf', tags: ['founders'] });
    const p = mergeProfile(existing, scraped({ company: 'NewCo' }), '2026-06-06T00:00:00.000Z');
    expect(p.note).toBe('met at conf');
    expect(p.tags).toEqual(['founders']);
    expect(p.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(p.updatedAt).toBe('2026-06-06T00:00:00.000Z');
    expect(p.company).toBe('NewCo');
  });

  it('keeps the old value when a re-scrape returns an empty field', () => {
    const existing = profile({ headline: 'Staff Engineer' });
    const p = mergeProfile(existing, scraped({ headline: '' }), '2026-06-06T00:00:00.000Z');
    expect(p.headline).toBe('Staff Engineer');
  });
});

describe('pickNewer', () => {
  it('takes the incoming record when it is newer', () => {
    const a = profile({ note: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const b = profile({ note: 'new', updatedAt: '2026-02-02T00:00:00.000Z' });
    expect(pickNewer(a, b).note).toBe('new');
  });

  it('keeps the existing record when the incoming one is older', () => {
    const a = profile({ note: 'keep', updatedAt: '2026-03-03T00:00:00.000Z' });
    const b = profile({ note: 'stale', updatedAt: '2026-02-02T00:00:00.000Z' });
    expect(pickNewer(a, b).note).toBe('keep');
  });
});

describe('storage round trip', () => {
  it('stores and reads back a profile', async () => {
    await putProfile(profile());
    expect((await getProfile('jane'))?.name).toBe('Jane Doe');
  });

  it('returns undefined for an unknown slug', async () => {
    expect(await getProfile('nobody')).toBeUndefined();
  });

  it('lists newest first and ignores non-profile keys', async () => {
    await chromeStub.storage.local.set({ 'settings:theme': 'dark' });
    await putProfile(profile({ slug: 'a', savedAt: '2026-01-01T00:00:00.000Z' }));
    await putProfile(profile({ slug: 'b', savedAt: '2026-03-03T00:00:00.000Z' }));
    expect((await allProfiles()).map((p) => p.slug)).toEqual(['b', 'a']);
  });

  it('saveScraped merges over an existing record', async () => {
    await putProfile(profile({ note: 'keep me' }));
    const saved = await saveScraped(scraped({ company: 'NewCo' }));
    expect(saved.note).toBe('keep me');
    expect(saved.company).toBe('NewCo');
  });

  it('deletes', async () => {
    await putProfile(profile());
    await deleteProfile('jane');
    expect(await getProfile('jane')).toBeUndefined();
  });

  it('imports by newest updatedAt', async () => {
    await putProfile(
      profile({ slug: 'jane', note: 'local', updatedAt: '2026-05-05T00:00:00.000Z' }),
    );
    const result = await importProfiles([
      profile({ slug: 'jane', note: 'newer', updatedAt: '2026-07-07T00:00:00.000Z' }),
      profile({ slug: 'bob', note: 'fresh' }),
      profile({ slug: 'jane2', note: 'older', updatedAt: '2020-01-01T00:00:00.000Z' }),
    ]);
    expect((await getProfile('jane'))?.note).toBe('newer');
    expect((await getProfile('bob'))?.note).toBe('fresh');
    expect(result).toEqual({ added: 2, updated: 1, skipped: 0 });
  });

  it('skips import entries that are not profiles', async () => {
    const result = await importProfiles([{ note: 'no slug' } as unknown as Profile]);
    expect(result.skipped).toBe(1);
  });
});
