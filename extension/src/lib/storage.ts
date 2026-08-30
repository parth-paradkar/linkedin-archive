import type { NoteEntry, Profile, ProfileRow, ScrapedProfile } from '@archive/shared';
import { toProfile, toUpsertArgs } from '@archive/shared';
import { supabase } from './supabase';

/**
 * All reads and writes for the extension. Runs only in the service worker.
 *
 * The merge rules that used to live here are now in the database: an empty
 * scraped field never overwrites stored text, and an unchanged scrape does not
 * bump updated_at. See supabase/migrations/0002_functions.sql.
 */

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('saved_at', { ascending: false });
  if (error) throw error;
  return (data as ProfileRow[]).map(toProfile);
}

export async function isSaved(slug: string): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('slug').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data !== null;
}

type NoteRow = {
  id: string;
  slug: string;
  author: string;
  author_email: string;
  body: string;
  created_at: string;
  edited_at: string | null;
};

const toNote = (n: NoteRow): NoteEntry => ({
  id: n.id,
  slug: n.slug,
  author: n.author,
  authorEmail: n.author_email,
  body: n.body,
  createdAt: n.created_at,
  editedAt: n.edited_at,
});

export async function getProfile(
  slug: string,
): Promise<{ profile: Profile | null; notes: NoteEntry[] }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, notes(*)')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { profile: null, notes: [] };

  const row = data as ProfileRow & { notes: NoteRow[] };
  const notes = [...(row.notes ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(toNote);
  return { profile: toProfile(row), notes };
}

/** Returns whether anything actually changed, so a revisit stays silent. */
export async function saveScraped(s: ScrapedProfile): Promise<boolean> {
  const { data, error } = await supabase.rpc('upsert_profile', toUpsertArgs(s));
  if (error) throw error;
  return data === true;
}

export async function deleteProfile(slug: string): Promise<void> {
  const { error } = await supabase.from('profiles').delete().eq('slug', slug);
  if (error) throw error;
}

export async function addNote(slug: string, body: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Signed out.');
  const { error } = await supabase.from('notes').insert({ slug, body: body.trim(), author: user.id });
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

/** Targeted so two members editing the same profile do not clobber each other. */
export async function addTag(slug: string, tag: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('add_tag', { p_slug: slug, p_tag: tag });
  if (error) throw error;
  return (data as string[]) ?? [];
}

export async function removeTag(slug: string, tag: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('remove_tag', { p_slug: slug, p_tag: tag });
  if (error) throw error;
  return (data as string[]) ?? [];
}
