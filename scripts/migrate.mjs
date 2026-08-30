#!/usr/bin/env node
/**
 * One-off import of a JSON export from the local-storage version of the
 * extension into Supabase.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/migrate.mjs export.json --author you@example.com
 *
 * Uses the service_role key, which bypasses RLS. Run it locally only; the key
 * must never reach the extension, the web bundle, or this repository.
 *
 * Idempotent: re-running does not duplicate notes.
 */
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const [file, ...rest] = process.argv.slice(2);
const authorFlag = rest.indexOf('--author');
const authorEmail = authorFlag === -1 ? null : rest[authorFlag + 1];

if (!file || !authorEmail) {
  console.error('Usage: node scripts/migrate.mjs <export.json> --author <email>');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

/** The author must already exist as a user, so notes can reference them. */
async function resolveAuthor(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user) return user.id;

  const created = await supabase.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  return created.data.user.id;
}

const records = JSON.parse(await readFile(file, 'utf8'));
if (!Array.isArray(records)) {
  console.error('Expected a JSON array of profiles.');
  process.exit(1);
}

const authorId = await resolveAuthor(authorEmail);
console.log(`Importing ${records.length} profiles as ${authorEmail}`);

let profilesWritten = 0;
let notesWritten = 0;
let notesSkipped = 0;
const problems = [];

for (const r of records) {
  if (!r?.slug) {
    problems.push('record without a slug');
    continue;
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      slug: r.slug,
      url: r.url ?? `https://www.linkedin.com/in/${r.slug}`,
      name: r.name ?? r.slug,
      headline: r.headline ?? '',
      company: r.company ?? '',
      role: r.role ?? '',
      location: r.location ?? '',
      about: r.about ?? '',
      photo_url: r.photoUrl ?? '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      saved_by: authorId,
      // Preserve the original timestamps rather than stamping today.
      saved_at: r.savedAt ?? new Date().toISOString(),
      updated_at: r.updatedAt ?? new Date().toISOString(),
    },
    { onConflict: 'slug' },
  );

  if (error) {
    problems.push(`${r.slug}: ${error.message}`);
    continue;
  }
  profilesWritten++;

  const body = (r.note ?? '').trim();
  if (!body) continue;

  // Idempotency: the same body from the same author is treated as already
  // imported, so a second run adds nothing.
  const { data: existing } = await supabase
    .from('notes')
    .select('id')
    .eq('slug', r.slug)
    .eq('author', authorId)
    .eq('body', body)
    .maybeSingle();

  if (existing) {
    notesSkipped++;
    continue;
  }

  const { error: noteError } = await supabase.from('notes').insert({
    slug: r.slug,
    author: authorId,
    author_email: authorEmail,
    body,
    created_at: r.updatedAt ?? r.savedAt ?? new Date().toISOString(),
  });

  if (noteError) problems.push(`${r.slug} note: ${noteError.message}`);
  else notesWritten++;
}

console.log(`profiles: ${profilesWritten}`);
console.log(`notes: ${notesWritten} written, ${notesSkipped} already present`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error('  -', p);
  process.exit(1);
}
