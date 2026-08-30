/**
 * Shapes shared by the extension and the web app.
 *
 * These mirror `supabase/migrations/0001_init.sql` by hand. Once the project
 * exists, regenerate with:
 *   supabase gen types typescript --local > shared/src/database.types.ts
 * and narrow these to views over the generated row types.
 */

/** A row of `public.profiles`. */
export type Profile = {
  slug: string;
  url: string;
  name: string;
  headline: string;
  company: string;
  role: string;
  location: string;
  about: string;
  photoUrl: string;
  tags: string[];
  savedBy: string | null;
  savedAt: string;
  updatedAt: string;
};

/** The subset a page scrape produces. Everything else is server-owned. */
export type ScrapedProfile = Pick<
  Profile,
  'slug' | 'url' | 'name' | 'headline' | 'company' | 'role' | 'location' | 'about' | 'photoUrl'
>;

/** A row of `public.notes`, joined with its author's email for display. */
export type NoteEntry = {
  id: string;
  slug: string;
  author: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
};

/** A profile together with its note thread, oldest first. */
export type ProfileWithNotes = Profile & { notes: NoteEntry[] };

/** Postgres uses snake_case; both clients speak camelCase. */
export type ProfileRow = {
  slug: string;
  url: string;
  name: string;
  headline: string;
  company: string;
  role: string;
  location: string;
  about: string;
  photo_url: string;
  tags: string[];
  saved_by: string | null;
  saved_at: string;
  updated_at: string;
};

export const toProfile = (r: ProfileRow): Profile => ({
  slug: r.slug,
  url: r.url,
  name: r.name,
  headline: r.headline,
  company: r.company,
  role: r.role,
  location: r.location,
  about: r.about,
  photoUrl: r.photo_url,
  tags: r.tags,
  savedBy: r.saved_by,
  savedAt: r.saved_at,
  updatedAt: r.updated_at,
});

/** Argument names match `upsert_profile`'s parameters. */
export const toUpsertArgs = (s: ScrapedProfile) => ({
  p_slug: s.slug,
  p_url: s.url,
  p_name: s.name,
  p_headline: s.headline,
  p_company: s.company,
  p_role: s.role,
  p_location: s.location,
  p_about: s.about,
  p_photo_url: s.photoUrl,
});

/**
 * Tag input helpers. Shared because both surfaces accept tags the same way.
 * (The extension still has its own copy until its storage rewrite; that copy
 * is deleted then.)
 */

/** Normalise a comma-separated list: trimmed, lowercased, de-duplicated. */
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
