import { describe, it, expect } from 'vitest';
import { renderList, renderDetail, renderTagFilter } from '../src/viewer/render';
import type { Profile } from '../src/lib/types';

const p = (over: Partial<Profile> = {}): Profile => ({
  slug: 'jane',
  url: 'https://www.linkedin.com/in/jane',
  name: 'Jane Doe',
  headline: 'Staff Engineer',
  company: 'Acme',
  role: 'Staff Engineer',
  location: 'Berlin',
  about: '',
  photoUrl: 'https://media.licdn.com/jane.jpg',
  savedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  note: '',
  ...over,
});

/** Fragments have no querySelector, so mount into a detached container first. */
const mount = (f: DocumentFragment): HTMLElement => {
  const div = document.createElement('div');
  div.append(f);
  return div;
};

describe('renderList', () => {
  it('renders one addressable row per profile', () => {
    const d = mount(renderList([p(), p({ slug: 'bob', name: 'Bob' })], null));
    expect([...d.querySelectorAll('[data-slug]')].map((r) => (r as HTMLElement).dataset.slug)).toEqual(
      ['jane', 'bob'],
    );
    expect(d.querySelector('.name')?.textContent).toBe('Jane Doe');
    expect(d.querySelector('.sub')?.textContent).toBe('Staff Engineer · Acme');
  });

  it('marks the selected row', () => {
    const d = mount(renderList([p(), p({ slug: 'bob' })], 'bob'));
    const rows = [...d.querySelectorAll('[data-slug]')];
    expect(rows.map((r) => r.getAttribute('aria-current'))).toEqual(['false', 'true']);
  });

  it('shows an empty state', () => {
    expect(mount(renderList([], null)).querySelector('.empty')).not.toBeNull();
  });
});

describe('renderTagFilter', () => {
  it('marks selected tags as pressed', () => {
    const d = mount(
      renderTagFilter([{ tag: 'a', count: 2 }, { tag: 'b', count: 1 }], ['b']),
    );
    const btns = [...d.querySelectorAll('[data-tag]')];
    expect(btns.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(d.querySelector('.count')?.textContent).toBe('2');
  });
});

describe('renderDetail', () => {
  it('prompts when nothing is selected', () => {
    expect(mount(renderDetail(null)).querySelector('.empty')).not.toBeNull();
  });

  it('populates the editable fields', () => {
    const d = mount(renderDetail(p({ note: 'met at conf', tags: ['founders', 'berlin'] })));
    expect(d.querySelector<HTMLTextAreaElement>('#note')?.value).toBe('met at conf');
    expect(d.querySelector<HTMLInputElement>('#tag-input')?.value).toBe('founders, berlin');
    expect(d.querySelector('#delete')).not.toBeNull();
  });

  it('omits the About block when there is no about text', () => {
    expect(mount(renderDetail(p({ about: '' }))).querySelector('.about')).toBeNull();
    expect(mount(renderDetail(p({ about: 'hi' }))).querySelector('.about')?.textContent).toBe('hi');
  });

  it('treats scraped text as text, never as markup', () => {
    const d = mount(renderDetail(p({ name: '<img src=x onerror=alert(1)>' })));
    expect(d.querySelector('h2')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(d.querySelectorAll('img')).toHaveLength(1); // only the avatar
  });
});
