import './viewer.css';
import type { NoteEntry, Profile } from '@archive/shared';
import { allTags, filterProfiles, parseTagInput, splitTagInput } from '../lib/filter';
import { send } from '../lib/messages';
import { renderDetail, renderList, renderNotes, renderTagFilter } from './render';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const els = {
  signin: $('signin'),
  email: $<HTMLInputElement>('email'),
  webLink: $<HTMLAnchorElement>('web-link'),
  code: $<HTMLInputElement>('code'),
  verify: $<HTMLButtonElement>('verify'),
  authStatus: $('auth-status'),
  app: $('app'),
  search: $<HTMLInputElement>('search'),
  tags: $('tags'),
  list: $('list'),
  detail: $('detail'),
  who: $('who'),
  signout: $<HTMLButtonElement>('signout'),
};

const state = {
  email: null as string | null,
  profiles: [] as Profile[],
  notes: [] as NoteEntry[],
  query: '',
  tags: [] as string[],
  selected: null as string | null,
};

function draw(): void {
  els.tags.replaceChildren(renderTagFilter(allTags(state.profiles), state.tags));
  els.list.replaceChildren(
    renderList(filterProfiles(state.profiles, state.query, state.tags), state.selected),
  );
  const current = state.profiles.find((p) => p.slug === state.selected) ?? null;
  const detail = renderDetail(current);
  if (current) detail.append(renderNotes(state.notes, state.email ?? ''));
  els.detail.replaceChildren(detail);
}

async function loadSelected(): Promise<void> {
  if (!state.selected) {
    state.notes = [];
    return;
  }
  const { notes } = await send({ type: 'getProfile', slug: state.selected });
  state.notes = notes;
}

async function reload(): Promise<void> {
  const { profiles } = await send({ type: 'listProfiles' });
  state.profiles = profiles;
  await loadSelected();
  draw();
}

// ---------------------------------------------------------------- auth

function showSignedOut(message = ''): void {
  state.email = null;
  els.app.hidden = true;
  els.signin.hidden = false;
  els.authStatus.textContent = message;
}

async function showSignedIn(email: string): Promise<void> {
  state.email = email;
  els.signin.hidden = true;
  els.app.hidden = false;
  els.who.textContent = email;
  await reload();
}

els.webLink.href = import.meta.env.VITE_WEB_URL ?? '#';
els.webLink.textContent = 'Open the web app';

els.verify.addEventListener('click', async () => {
  const email = els.email.value.trim();
  const code = els.code.value.trim();
  if (!email || !code) return;
  els.verify.disabled = true;
  els.authStatus.textContent = 'Signing in…';
  try {
    const res = await send({ type: 'verifyCode', email, code });
    await showSignedIn(res.email);
  } catch (e) {
    els.authStatus.textContent = e instanceof Error ? e.message : String(e);
  } finally {
    els.verify.disabled = false;
  }
});

els.signout.addEventListener('click', async () => {
  await send({ type: 'signOut' });
  showSignedOut('Signed out.');
});

// ------------------------------------------------------------- browsing

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  draw();
});

els.tags.addEventListener('click', (e) => {
  const tag = (e.target as HTMLElement).closest<HTMLElement>('[data-tag]')?.dataset.tag;
  if (!tag) return;
  state.tags = state.tags.includes(tag)
    ? state.tags.filter((t) => t !== tag)
    : [...state.tags, tag];
  draw();
});

els.list.addEventListener('click', async (e) => {
  const slug = (e.target as HTMLElement).closest<HTMLElement>('[data-slug]')?.dataset.slug;
  if (!slug) return;
  state.selected = slug;
  await loadSelected();
  draw();
});

// ---------------------------------------------------------------- edits

/** See the extension's earlier fix: replacing the input during a redraw fires a
 *  focusout carrying text already committed. Guard so it is not committed twice. */
let committingTags = false;

async function applyTags(next: string[] | null, tag: string, rest: string, refocus: boolean) {
  committingTags = true;
  try {
    const slug = state.selected;
    if (!slug) return;
    const res = next
      ? await send({ type: 'addTag', slug, tag })
      : await send({ type: 'removeTag', slug, tag });
    const p = state.profiles.find((x) => x.slug === slug);
    if (p) p.tags = res.tags;
    draw();
  } catch (e) {
    console.error('[LinkedIn Archive]', e);
  } finally {
    committingTags = false;
  }
  const input = document.getElementById('tag-new') as HTMLInputElement | null;
  if (!input) return;
  input.value = rest;
  if (refocus) input.focus();
}

async function addTags(tags: string[], rest: string, refocus: boolean) {
  for (const tag of tags) await applyTags([tag], tag, rest, refocus);
}

els.detail.addEventListener('input', (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== 'tag-new') return;
  const input = t as HTMLInputElement;
  const { tags, rest } = splitTagInput(input.value);
  if (tags.length) void addTags(tags, rest, true);
  else if (input.value !== rest) input.value = rest;
});

els.detail.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== 'tag-new' || (e as KeyboardEvent).key !== 'Enter') return;
  e.preventDefault();
  const tags = parseTagInput((t as HTMLInputElement).value);
  if (tags.length) void addTags(tags, '', true);
});

els.detail.addEventListener('focusout', (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== 'tag-new' || committingTags) return;
  const tags = parseTagInput((t as HTMLInputElement).value);
  if (tags.length) void addTags(tags, '', false);
});

els.detail.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  const slug = state.selected;
  if (!slug) return;

  const remove = target.closest<HTMLElement>('[data-remove]')?.dataset.remove;
  if (remove !== undefined) {
    const pending = (document.getElementById('tag-new') as HTMLInputElement | null)?.value ?? '';
    await applyTags(null, remove, pending, true);
    return;
  }

  const noteId = target.closest<HTMLElement>('[data-delete-note]')?.dataset.deleteNote;
  if (noteId) {
    if (!confirm('Delete this note?')) return;
    await send({ type: 'deleteNote', id: noteId });
    await loadSelected();
    draw();
    return;
  }

  if (target.id === 'note-add') {
    const box = document.getElementById('note-new') as HTMLTextAreaElement | null;
    const body = box?.value.trim();
    if (!body) return;
    await send({ type: 'addNote', slug, body });
    await loadSelected();
    draw();
  }
});

// The background worker opens the viewer at #<slug> to focus one record.
state.selected = decodeURIComponent(location.hash.slice(1)) || null;

void (async () => {
  const { email } = await send({ type: 'authState' });
  if (email) await showSignedIn(email);
  else showSignedOut();
})();
