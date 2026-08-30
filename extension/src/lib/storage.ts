import type { ScrapedProfile } from '@archive/shared';
import { toUpsertArgs } from '@archive/shared';
import { supabase } from './supabase';

/**
 * All the extension does with Supabase: check whether a profile is saved and
 * store a scrape. Everything else — browsing, notes, tags — is the web app.
 *
 * The merge rules live in the database: an empty scraped field never
 * overwrites stored text, and an unchanged scrape does not bump updated_at.
 * See supabase/migrations/0002_functions.sql.
 */

export async function isSaved(slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Returns whether anything actually changed, so a revisit stays silent. */
export async function saveScraped(s: ScrapedProfile): Promise<boolean> {
  const { data, error } = await supabase.rpc('upsert_profile', toUpsertArgs(s));
  if (error) throw error;
  return data === true;
}
