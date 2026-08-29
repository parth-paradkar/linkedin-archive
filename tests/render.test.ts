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

describe('avatar fallback', () => {
  it('renders an image when there is a photo', () => {
    const d = mount(renderList([p()], null));
    expect(d.querySelector('img.avatar')).not.toBeNull();
    expect(d.querySelector('span.avatar')).toBeNull();
  });

  it('renders initials instead of a broken image when there is no photo', () => {
    const d = mount(renderList([p({ photoUrl: '' })], null));
    expect(d.querySelector('img')).toBeNull();
    expect(d.querySelector('span.avatar')?.textContent).toBe('JD');
  });

  it('uses one initial for a single-word name', () => {
    const d = mount(renderList([p({ photoUrl: '', name: 'Cher' })], null));
    expect(d.querySelector('span.avatar')?.textContent).toBe('C');
  });

  it('takes only the first two words of a long name', () => {
    const d = mount(renderList([p({ photoUrl: '', name: 'Ada Grace Byron King' })], null));
    expect(d.querySelector('span.avatar')?.textContent).toBe('AG');
  });

  it('falls back to the slug when the name is empty', () => {
    const d = mount(renderList([p({ photoUrl: '', name: '', slug: 'ghost' })], null));
    expect(d.querySelector('span.avatar')?.textContent).toBe('G');
  });

  it('swaps in initials when the photo fails to load', () => {
    const d = mount(renderList([p()], null));
    const img = d.querySelector<HTMLImageElement>('img.avatar')!;
    img.dispatchEvent(new Event('error'));
    expect(d.querySelector('img')).toBeNull();
    expect(d.querySelector('span.avatar')?.textContent).toBe('JD');
  });

  it('applies the same fallback in the detail panel', () => {
    const d = mount(renderDetail(p({ photoUrl: '' })));
    expect(d.querySelector('img')).toBeNull();
    expect(d.querySelector('span.avatar')?.textContent).toBe('JD');
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
