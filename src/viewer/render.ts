import type { Profile } from '../lib/types';

const frag = (): DocumentFragment => document.createDocumentFragment();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function renderTagFilter(
  tags: { tag: string; count: number }[],
  selected: string[],
): DocumentFragment {
  const f = frag();
  for (const { tag, count } of tags) {
    const b = el('button', { className: 'tag-toggle', type: 'button' }, [
      el('span', { textContent: tag }),
      el('span', { className: 'count', textContent: String(count) }),
    ]);
    b.dataset.tag = tag;
    b.setAttribute('aria-pressed', String(selected.includes(tag)));
    f.append(b);
  }
  return f;
}

export function renderList(profiles: Profile[], selectedSlug: string | null): DocumentFragment {
  const f = frag();
  if (!profiles.length) {
    f.append(el('p', { className: 'empty', textContent: 'No profiles match.' }));
    return f;
  }
  for (const p of profiles) {
    const sub = [p.headline || p.role, p.company].filter(Boolean).join(' · ');
    const row = el('button', { className: 'row', type: 'button' }, [
      el('img', { src: p.photoUrl, alt: '' }),
      el('span', { className: 'meta' }, [
        el('div', { className: 'name', textContent: p.name }),
        el('div', { className: 'sub', textContent: sub }),
      ]),
    ]);
    row.dataset.slug = p.slug;
    row.setAttribute('aria-current', String(p.slug === selectedSlug));
    f.append(row);
  }
  return f;
}

export function renderDetail(p: Profile | null): DocumentFragment {
  const f = frag();
  if (!p) {
    f.append(el('p', { className: 'empty', textContent: 'Select a profile.' }));
    return f;
  }
  f.append(
    el('img', { src: p.photoUrl, alt: '' }),
    el('h2', { textContent: p.name }),
    el('p', { className: 'muted', textContent: p.headline }),
    el('p', {
      className: 'muted',
      textContent: [p.company, p.location].filter(Boolean).join(' · '),
    }),
    el('p', {}, [
      el('a', {
        href: p.url,
        target: '_blank',
        rel: 'noreferrer',
        textContent: 'Open on LinkedIn ↗',
      }),
    ]),
    el('p', {
      className: 'muted',
      textContent: `Saved ${new Date(p.savedAt).toLocaleDateString()}`,
    }),
  );
  if (p.about) {
    f.append(
      el('label', { textContent: 'About' }),
      el('p', { className: 'about', textContent: p.about }),
    );
  }
  return f;
}
