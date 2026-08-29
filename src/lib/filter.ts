import type { Profile } from './types';

const haystack = (p: Profile): string =>
  [p.name, p.headline, p.company, p.role, p.location, p.note, p.tags.join(' ')]
    .join(' ')
    .toLowerCase();

export function filterProfiles(profiles: Profile[], query: string, tags: string[]): Profile[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return profiles.filter((p) => {
    if (!tags.every((t) => p.tags.includes(t))) return false;
    if (!terms.length) return true;
    const h = haystack(p);
    return terms.every((t) => h.includes(t));
  });
}

export function allTags(profiles: Profile[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of profiles) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
