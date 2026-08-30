import { createClient } from './supabase/server';
import { toProfile, type Profile, type NoteEntry, type ProfileRow } from '@archive/shared';

/**
 * PostgREST filter strings are not parameterised, so characters that carry
 * meaning there (or in LIKE) are stripped rather than escaped. Two trusted
 * members use this, but an unsanitised value could still rewrite the filter.
 */
const sanitise = (q: string) => q.replace(/[,()\\%_*:"']/g, ' ').replace(/\s+/g, ' ').trim();

export async function isMember(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_member');
  return data === true;
}

export async function currentEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

export const PER_PAGE = 10;

export async function listProfiles(
  query: string,
  tags: string[],
  page = 1,
): Promise<{ profiles: Profile[]; total: number }> {
  const supabase = await createClient();
  const term = sanitise(query);

  let request = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('saved_at', { ascending: false });

  if (term) {
    const like = `%${term}%`;
    const clauses = [
      `name.ilike.${like}`,
      `headline.ilike.${like}`,
      `company.ilike.${like}`,
      `location.ilike.${like}`,
    ];

    // The local version searched note text too; notes now live in their own
    // table, so match them separately and fold the slugs into the same filter.
    const { data: hits } = await supabase.from('notes').select('slug').ilike('body', like);
    const slugs = [...new Set((hits ?? []).map((h) => h.slug))].filter((s) => /^[\w.-]+$/.test(s));
    if (slugs.length) clauses.push(`slug.in.(${slugs.join(',')})`);

    request = request.or(clauses.join(','));
  }

  if (tags.length) request = request.contains('tags', tags);

  const from = (Math.max(1, page) - 1) * PER_PAGE;
  request = request.range(from, from + PER_PAGE - 1);

  const { data, error, count } = await request;
  if (error) throw error;
  return { profiles: (data as ProfileRow[]).map(toProfile), total: count ?? 0 };
}

export async function allTags(): Promise<{ tag: string; count: number }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select('tags');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { tags: string[] }[]) {
    for (const t of row.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
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

export async function getProfile(
  slug: string,
): Promise<{ profile: Profile; notes: NoteEntry[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*, notes(*)')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as ProfileRow & { notes: NoteRow[] };
  const notes = [...(row.notes ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((n) => ({
      id: n.id,
      slug: n.slug,
      author: n.author,
      authorEmail: n.author_email,
      body: n.body,
      createdAt: n.created_at,
      editedAt: n.edited_at,
    }));

  return { profile: toProfile(row), notes };
}
