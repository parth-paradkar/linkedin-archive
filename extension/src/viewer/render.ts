import type { NoteEntry, Profile } from '@archive/shared';

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

/** Up to two leading characters, e.g. "Ada Grace Byron" -> "AG". */
const initials = (label: string): string =>
  label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? '')
    .join('')
    .toUpperCase();

/**
 * A photo when we have one, initials when we don't. LinkedIn CDN URLs expire,
 * so a stored photo can start 404ing long after it was saved — the error
 * handler covers that as well as profiles that never had a picture.
 */
function avatar(p: Profile): HTMLElement {
  const fallback = () =>
    el('span', { className: 'avatar', textContent: initials(p.name || p.slug) });
  if (!p.photoUrl) return fallback();
  const img = el('img', { className: 'avatar', src: p.photoUrl, alt: '' });
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
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
      avatar(p),
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

/** Committed tags as removable chips, plus one input for typing the next. */
function tagEditor(p: Profile): HTMLElement {
  const box = el('div', { className: 'tag-edit' });
  box.id = 'tag-edit';

  for (const tag of p.tags) {
    const x = el('button', { className: 'chip-x', type: 'button', textContent: '×' });
    x.dataset.remove = tag;
    x.setAttribute('aria-label', `Remove tag ${tag}`);
    box.append(el('span', { className: 'chip' }, [el('span', { textContent: tag }), x]));
  }

  const input = el('input', {
    type: 'text',
    placeholder: p.tags.length ? 'Add tag…' : 'type, then comma',
  });
  input.id = 'tag-new';
  box.append(input);
  return box;
}

export function renderDetail(p: Profile | null): DocumentFragment {
  const f = frag();
  if (!p) {
    f.append(el('p', { className: 'empty', textContent: 'Select a profile.' }));
    return f;
  }
  f.append(
    avatar(p),
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

  f.append(
    el('label', { htmlFor: 'tag-new', textContent: 'Tags' }),
    tagEditor(p),
    el('label', { textContent: 'Notes' }),
  );
  return f;
}

/** Attributed, append-only. Only your own entries offer a delete control; the
 *  database enforces that regardless of what is rendered. */
export function renderNotes(
  notes: NoteEntry[],
  viewerEmail: string,
): DocumentFragment {
  const f = frag();
  const thread = el('div', { className: 'thread' });

  if (!notes.length) thread.append(el('p', { className: 'muted', textContent: 'No notes yet.' }));

  for (const n of notes) {
    const mine = n.authorEmail === viewerEmail;
    const head = el('div', { className: 'note-head' }, [
      el('span', { className: 'who', textContent: mine ? 'You' : n.authorEmail }),
      el('span', { textContent: new Date(n.createdAt).toLocaleString() }),
    ]);
    const note = el('div', { className: 'note' }, [
      head,
      el('p', { className: 'note-body', textContent: n.body }),
    ]);
    if (mine) {
      const del = el('button', { className: 'note-del', type: 'button', textContent: 'Delete' });
      del.dataset.deleteNote = n.id;
      note.append(el('div', { className: 'note-actions' }, [del]));
    }
    thread.append(note);
  }

  const box = el('textarea', { placeholder: 'Add a note\u2026' });
  box.id = 'note-new';
  const add = el('button', { type: 'button', textContent: 'Add note' });
  add.id = 'note-add';

  f.append(thread, box, el('div', {}, [add]));
  return f;
}
