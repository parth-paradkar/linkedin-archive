import './viewer.css';
import type { Profile } from '../lib/types';
import { allProfiles, deleteProfile, importProfiles, putProfile } from '../lib/storage';
import { allTags, filterProfiles, parseTagInput, splitTagInput } from '../lib/filter';
import { renderDetail, renderList, renderTagFilter } from './render';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
};

const els = {
  search: $<HTMLInputElement>('search'),
  tags: $('tags'),
  list: $('list'),
  detail: $('detail'),
};

const state = {
  profiles: [] as Profile[],
  query: '',
  tags: [] as string[],
  selected: null as string | null,
};

export function visible(): Profile[] {
  return filterProfiles(state.profiles, state.query, state.tags);
}

export function draw(): void {
  const shown = visible();
  els.tags.replaceChildren(renderTagFilter(allTags(state.profiles), state.tags));
  els.list.replaceChildren(renderList(shown, state.selected));
  els.detail.replaceChildren(
    renderDetail(state.profiles.find((p) => p.slug === state.selected) ?? null),
  );
}

export async function reload(): Promise<void> {
  state.profiles = await allProfiles();
  draw();
}

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

els.list.addEventListener('click', (e) => {
  const slug = (e.target as HTMLElement).closest<HTMLElement>('[data-slug]')?.dataset.slug;
  if (!slug) return;
  state.selected = slug;
  draw();
});

/** Apply an edit to the selected profile, persist it, and refresh derived UI. */
async function edit(change: (p: Profile) => void, redraw: boolean): Promise<void> {
  const p = state.profiles.find((x) => x.slug === state.selected);
  if (!p) return;
  change(p);
  p.updatedAt = new Date().toISOString();
  await putProfile(p);
  // Redrawing rebuilds the detail panel, which would steal focus mid-typing.
  if (redraw) draw();
}

let noteTimer: ReturnType<typeof setTimeout> | undefined;

const selected = (): Profile | undefined => state.profiles.find((x) => x.slug === state.selected);

/**
 * True while a tag edit is redrawing the panel. Replacing the input blurs it,
 * and the browser fires that focusout *before* detaching the node — so the
 * focusout handler still sees the old element holding text we already
 * committed. Without this guard it commits that text a second time and kicks
 * off another redraw, which is what steals the caret mid-typing.
 */
let committingTags = false;

/**
 * Rewrite the tag list, redraw so chips and sidebar counts update, then put
 * any half-typed remainder back in the fresh input.
 */
async function setTags(
  next: (p: Profile) => string[],
  rest: string,
  refocus: boolean,
): Promise<void> {
  committingTags = true;
  try {
    await edit((p) => (p.tags = next(p)), true);
  } finally {
    committingTags = false;
  }
  const input = document.getElementById('tag-new') as HTMLInputElement | null;
  if (!input) return;
  input.value = rest;
  if (refocus) input.focus();
}

const addTags = (add: string[], rest: string, refocus: boolean) =>
  setTags((p) => [...new Set([...p.tags, ...add])], rest, refocus);

els.detail.addEventListener('input', (e) => {
  const t = e.target as HTMLElement;

  if (t.id === 'note') {
    const value = (t as HTMLTextAreaElement).value;
    // Update state now and persist on a debounce: a redraw triggered by a tag
    // edit would otherwise repaint the textarea from the last saved value and
    // throw away whatever is still in flight.
    const p = selected();
    if (p) p.note = value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => void edit(() => {}, false), 500);
    return;
  }

  if (t.id === 'tag-new') {
    const input = t as HTMLInputElement;
    const { tags, rest } = splitTagInput(input.value);
    if (tags.length) void addTags(tags, rest, true);
    else if (input.value !== rest) input.value = rest; // a lone comma
  }
});

els.detail.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== 'tag-new' || (e as KeyboardEvent).key !== 'Enter') return;
  e.preventDefault();
  const input = t as HTMLInputElement;
  const tags = parseTagInput(input.value);
  if (tags.length) void addTags(tags, '', true);
});

// Committing on the way out, so a typed-but-uncommitted tag is not silently lost.
els.detail.addEventListener('focusout', (e) => {
  const t = e.target as HTMLElement;
  if (t.id !== 'tag-new' || committingTags) return;
  const tags = parseTagInput((t as HTMLInputElement).value);
  if (tags.length) void addTags(tags, '', false);
});

els.detail.addEventListener('click', (e) => {
  const remove = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]')?.dataset.remove;
  if (remove !== undefined) {
    // Keep whatever is half-typed; removing a chip should not discard it.
    const pending = (document.getElementById('tag-new') as HTMLInputElement | null)?.value ?? '';
    void setTags((p) => p.tags.filter((t) => t !== remove), pending, true);
    return;
  }
  if ((e.target as HTMLElement).id !== 'delete') return;
  const p = state.profiles.find((x) => x.slug === state.selected);
  if (!p || !confirm(`Delete ${p.name} from the archive?`)) return;
  void deleteProfile(p.slug).then(() => {
    state.selected = null;
    return reload();
  });
});

// Flush a pending note edit if the tab closes mid-debounce. State already holds
// the typed text, so this only has to persist it.
window.addEventListener('beforeunload', () => {
  if (noteTimer === undefined) return;
  clearTimeout(noteTimer);
  const p = selected();
  if (p) void putProfile({ ...p, updatedAt: new Date().toISOString() });
});

const io = {
  exportBtn: $<HTMLButtonElement>('export'),
  importBtn: $<HTMLButtonElement>('import-btn'),
  file: $<HTMLInputElement>('import'),
  status: $('io-status'),
};

io.exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.profiles, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `linkedin-archive-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
  io.status.textContent = `Exported ${state.profiles.length} profiles.`;
});

io.importBtn.addEventListener('click', () => io.file.click());

io.file.addEventListener('change', async () => {
  const file = io.file.files?.[0];
  if (!file) return;
  io.status.textContent = 'Importing…';
  try {
    const parsed: unknown = JSON.parse(await file.text());
    if (!Array.isArray(parsed)) throw new Error('expected a JSON array of profiles');
    const { added, updated, skipped } = await importProfiles(parsed);
    await reload();
    io.status.textContent = `Added ${added}, updated ${updated}, skipped ${skipped}.`;
  } catch (e) {
    io.status.textContent = `Import failed: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    // Reset so re-picking the same file fires `change` again.
    io.file.value = '';
  }
});

// The background worker opens the viewer at #<slug> to focus one record.
state.selected = decodeURIComponent(location.hash.slice(1)) || null;

void reload();

export { state };
