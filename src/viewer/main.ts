import './viewer.css';
import type { Profile } from '../lib/types';
import { allProfiles } from '../lib/storage';
import { allTags, filterProfiles } from '../lib/filter';
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

// The background worker opens the viewer at #<slug> to focus one record.
state.selected = decodeURIComponent(location.hash.slice(1)) || null;

void reload();

export { state };
