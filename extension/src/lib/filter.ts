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

export function parseTagInput(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}

/**
 * Split what the user has typed at the last comma: everything before it is
 * ready to become tags, everything after is still being typed.
 */
export function splitTagInput(raw: string): { tags: string[]; rest: string } {
  const at = raw.lastIndexOf(',');
  if (at < 0) return { tags: [], rest: raw };
  return { tags: parseTagInput(raw.slice(0, at)), rest: raw.slice(at + 1) };
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
