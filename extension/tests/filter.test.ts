import { describe, it, expect } from 'vitest';
import { filterProfiles, allTags, parseTagInput, splitTagInput } from '../src/lib/filter';
import type { Profile } from '../src/lib/types';

const p = (over: Partial<Profile>): Profile => ({
  slug: 'x',
  url: '',
  name: '',
  headline: '',
  company: '',
  role: '',
  location: '',
  about: '',
  photoUrl: '',
  savedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  note: '',
  ...over,
});

const people = [
  p({ slug: 'jane', name: 'Jane Doe', company: 'Acme', tags: ['founders', 'berlin'] }),
  p({ slug: 'john', name: 'John Smith', headline: 'Designer', tags: ['design'] }),
  p({ slug: 'ada', name: 'Ada L', note: 'met at Acme offsite', tags: ['founders'] }),
];

describe('filterProfiles', () => {
  it('returns everything for an empty query and no tags', () => {
    expect(filterProfiles(people, '', [])).toHaveLength(3);
  });

  it('matches case-insensitively across fields', () => {
    expect(filterProfiles(people, 'acme', []).map((x) => x.slug)).toEqual(['jane', 'ada']);
  });

  it('requires every search term to match', () => {
    expect(filterProfiles(people, 'jane acme', []).map((x) => x.slug)).toEqual(['jane']);
    expect(filterProfiles(people, 'jane designer', [])).toHaveLength(0);
  });

  it('ignores surrounding whitespace', () => {
    expect(filterProfiles(people, '   jane  ', [])).toHaveLength(1);
  });

  it('requires all selected tags', () => {
    expect(filterProfiles(people, '', ['founders']).map((x) => x.slug)).toEqual(['jane', 'ada']);
    expect(filterProfiles(people, '', ['founders', 'berlin']).map((x) => x.slug)).toEqual(['jane']);
  });

  it('combines query and tags', () => {
    expect(filterProfiles(people, 'ada', ['founders']).map((x) => x.slug)).toEqual(['ada']);
    expect(filterProfiles(people, 'ada', ['design'])).toHaveLength(0);
  });

  it('searches tag names too', () => {
    expect(filterProfiles(people, 'design', []).map((x) => x.slug)).toEqual(['john']);
  });
});

describe('allTags', () => {
  it('counts tags alphabetically', () => {
    expect(allTags(people)).toEqual([
      { tag: 'berlin', count: 1 },
      { tag: 'design', count: 1 },
      { tag: 'founders', count: 2 },
    ]);
  });

  it('returns an empty list when nothing is tagged', () => {
    expect(allTags([p({})])).toEqual([]);
  });
});

describe('parseTagInput', () => {
  it('splits on commas and trims', () => {
    expect(parseTagInput(' founders , berlin ')).toEqual(['founders', 'berlin']);
  });

  it('lowercases and de-duplicates', () => {
    expect(parseTagInput('Founders, founders, FOUNDERS')).toEqual(['founders']);
  });

  it('drops empty entries', () => {
    expect(parseTagInput('a,,  ,b,')).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTagInput('   ')).toEqual([]);
  });
});

describe('splitTagInput', () => {
  it('commits nothing while the user is still typing', () => {
    expect(splitTagInput('foun')).toEqual({ tags: [], rest: 'foun' });
  });

  it('commits the part before the comma and keeps the remainder', () => {
    expect(splitTagInput('founders,')).toEqual({ tags: ['founders'], rest: '' });
    expect(splitTagInput('founders, ber')).toEqual({ tags: ['founders'], rest: ' ber' });
  });

  it('commits several tags from a paste', () => {
    expect(splitTagInput('founders, berlin, vc,')).toEqual({
      tags: ['founders', 'berlin', 'vc'],
      rest: '',
    });
  });

  it('normalises case and drops blanks', () => {
    expect(splitTagInput('Founders,, FOUNDERS ,')).toEqual({ tags: ['founders'], rest: '' });
  });

  it('swallows a lone comma', () => {
    expect(splitTagInput(',')).toEqual({ tags: [], rest: '' });
  });
});
