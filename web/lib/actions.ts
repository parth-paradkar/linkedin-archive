'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from './supabase/server';

/** Server actions run with the caller's session, so RLS still governs them. */

async function client() {
  return createClient();
}

function refresh(slug: string) {
  revalidatePath('/');
  revalidatePath(`/p/${slug}`);
}

export async function addNote(slug: string, body: string) {
  const text = body.trim();
  if (!text) return { error: 'A note needs some text.' };
  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Signed out.' };

  const { error } = await supabase.from('notes').insert({ slug, body: text, author: user.id });
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

export async function editNote(id: string, slug: string, body: string) {
  const text = body.trim();
  if (!text) return { error: 'A note needs some text.' };
  const supabase = await client();
  // RLS restricts this to the note's author; no ownership check is needed here,
  // and one here would not be a security control anyway.
  const { error } = await supabase
    .from('notes')
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

export async function deleteNote(id: string, slug: string) {
  const supabase = await client();
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

export async function addTag(slug: string, tag: string) {
  const supabase = await client();
  const { error } = await supabase.rpc('add_tag', { p_slug: slug, p_tag: tag });
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

export async function removeTag(slug: string, tag: string) {
  const supabase = await client();
  const { error } = await supabase.rpc('remove_tag', { p_slug: slug, p_tag: tag });
  if (error) return { error: error.message };
  refresh(slug);
  return {};
}

export async function deleteProfile(slug: string) {
  const supabase = await client();
  const { error } = await supabase.from('profiles').delete().eq('slug', slug);
  if (error) return { error: error.message };
  revalidatePath('/');
  return {};
}
