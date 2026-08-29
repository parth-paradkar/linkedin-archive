import type { Profile, ScrapedProfile } from './types';

const PREFIX = 'profile:';
const key = (slug: string) => `${PREFIX}${slug}`;

/** Prefer the fresh value, but never let an empty re-scrape wipe good data. */
const keep = (fresh: string, old: string | undefined): string => fresh || old || '';

export function mergeProfile(
  existing: Profile | undefined,
  s: ScrapedProfile,
  now: string,
): Profile {
  return {
    slug: s.slug,
    url: keep(s.url, existing?.url),
    name: keep(s.name, existing?.name),
    headline: keep(s.headline, existing?.headline),
    company: keep(s.company, existing?.company),
    role: keep(s.role, existing?.role),
    location: keep(s.location, existing?.location),
    about: keep(s.about, existing?.about),
    photoUrl: keep(s.photoUrl, existing?.photoUrl),
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
    tags: existing?.tags ?? [],
    note: existing?.note ?? '',
  };
}

export function pickNewer(a: Profile | undefined, b: Profile): Profile {
  if (!a) return b;
  return b.updatedAt > a.updatedAt ? b : a;
}

export async function getProfile(slug: string): Promise<Profile | undefined> {
  const k = key(slug);
  const got = await chrome.storage.local.get(k);
  return got[k] as Profile | undefined;
}

export async function allProfiles(): Promise<Profile[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([, v]) => v as Profile)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function putProfile(p: Profile): Promise<void> {
  await chrome.storage.local.set({ [key(p.slug)]: p });
}

export async function saveScraped(s: ScrapedProfile): Promise<Profile> {
  const merged = mergeProfile(await getProfile(s.slug), s, new Date().toISOString());
  await putProfile(merged);
  return merged;
}

export async function deleteProfile(slug: string): Promise<void> {
  await chrome.storage.local.remove(key(slug));
}

export async function importProfiles(
  incoming: Profile[],
): Promise<{ added: number; updated: number; skipped: number }> {
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of incoming) {
    // Import data is a file the user picked. Validate before it reaches storage.
    if (!raw || typeof raw.slug !== 'string' || !raw.slug || typeof raw.updatedAt !== 'string') {
      skipped++;
      continue;
    }
    const existing = await getProfile(raw.slug);
    const winner = pickNewer(existing, raw);
    if (winner === existing) continue;
    await putProfile(winner);
    if (existing) updated++;
    else added++;
  }
  return { added, updated, skipped };
}
