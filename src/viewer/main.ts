import './viewer.css';
import type { Profile } from '../lib/types';
import { allProfiles, deleteProfile, putProfile } from '../lib/storage';
import { allTags, filterProfiles, parseTagInput } from '../lib/filter';
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

els.detail.addEventListener('input', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'note') {
    const value = (t as HTMLTextAreaElement).value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => void edit((p) => (p.note = value), false), 500);
  }
});

els.detail.addEventListener('change', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'tag-input') {
    const tags = parseTagInput((t as HTMLInputElement).value);
    // Tag changes alter the sidebar counts and possibly the filtered list.
    void edit((p) => (p.tags = tags), true);
  }
});

els.detail.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id !== 'delete') return;
  const p = state.profiles.find((x) => x.slug === state.selected);
  if (!p || !confirm(`Delete ${p.name} from the archive?`)) return;
  void deleteProfile(p.slug).then(() => {
    state.selected = null;
    return reload();
  });
});

// Flush a pending note edit if the tab closes mid-debounce.
window.addEventListener('beforeunload', () => {
  if (noteTimer === undefined) return;
  clearTimeout(noteTimer);
  const p = state.profiles.find((x) => x.slug === state.selected);
  const note = document.getElementById('note') as HTMLTextAreaElement | null;
  if (p && note) void putProfile({ ...p, note: note.value, updatedAt: new Date().toISOString() });
});

// The background worker opens the viewer at #<slug> to focus one record.
state.selected = decodeURIComponent(location.hash.slice(1)) || null;

void reload();

export { state };
