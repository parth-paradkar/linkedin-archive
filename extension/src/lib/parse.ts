import type { ScrapedProfile } from '@archive/shared';

/**
 * Every LinkedIn-specific selector in the project lives in this file.
 *
 * Logged-in LinkedIn (verified 2026-08-29) ships no JSON-LD, no <h1>, and
 * build-hashed class names like `_02484ad3` that change on every deploy. So
 * nothing here keys off a class name. The stable anchors are:
 *   - `<title>` — "<Name> | LinkedIn"
 *   - a top-card container whose id contains "topcard"
 *   - CDN path segments: profile-displayphoto / -displaybackgroundimage / company-logo
 *   - the literal "Contact info" label, which brackets location and company
 */

export function slugFromUrl(url: string): string | null {
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

const TOPCARD = '[id*="topcard" i]';

/**
 * Text of every leaf element, in DOM order, with consecutive duplicates
 * collapsed. Deliberately not `innerText`: that depends on layout, so it is
 * unreproducible in tests and hides elements this parser needs to reason about.
 */
function leafLines(root: Element): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length) continue;
    const t = el.textContent?.trim();
    if (t && out[out.length - 1] !== t) out.push(t);
  }
  return out;
}

/** Degree badges ("· 1st") and bare separator dots. */
const isDot = (s: string) => s.startsWith('·');

/** LinkedIn renders a hidden "Company · School" summary. It always joins with " · ". */
const isSummary = (s: string) => s.includes(' · ');

function nameFrom(doc: Document): string {
  const fromTitle = doc.title.replace(/\s*\|\s*LinkedIn\s*$/, '').trim();
  if (fromTitle) return fromTitle;
  return doc.querySelector('main h1, main h2')?.textContent?.trim() ?? '';
}

/** Best effort: LinkedIn lazy-renders this card, so it is often absent at save time. */
function aboutFrom(doc: Document): string {
  const heading = [...doc.querySelectorAll('h2')].find((h) => h.textContent?.trim() === 'About');
  const section = heading?.closest('section');
  if (!section) return '';
  return leafLines(section)
    .filter((l) => l !== 'About' && !/^…?\s*see more$/i.test(l))
    .join('\n')
    .trim();
}

type TopCard = { headline: string; location: string; company: string; photoUrl: string };

function topCardFrom(doc: Document, name: string): TopCard {
  const empty = { headline: '', location: '', company: '', photoUrl: '' };
  const top = doc.querySelector(TOPCARD);
  if (!top) return empty;

  const lines = leafLines(top);
  const usable = (s: string) => !isDot(s) && !isSummary(s);

  const nameAt = lines.indexOf(name);
  const headline = lines.slice(nameAt + 1).find(usable) ?? '';

  // "Contact info" sits between the location and the company/school row.
  const contactAt = lines.findIndex((l) => /^Contact info$/i.test(l));
  let location = '';
  let company = '';
  if (contactAt > 0) {
    for (let i = contactAt - 1; i >= 0; i--) {
      if (usable(lines[i]) && lines[i] !== headline) {
        location = lines[i];
        break;
      }
    }
    company = lines.slice(contactAt + 1).find((l) => !isDot(l)) ?? '';
  } else {
    // No contact-info link (not a connection). Fall back to document order.
    location = lines.slice(lines.indexOf(headline) + 1).find(usable) ?? '';
  }

  if (!company) company = companyBesideLogo(top);

  return {
    headline,
    location,
    company,
    // The cover photo is `profile-displaybackgroundimage`; the avatar is the
    // first `profile-displayphoto` (later ones are mutual connections' faces).
    photoUrl:
      top.querySelector<HTMLImageElement>('img[src*="profile-displayphoto"]')?.src ?? '',
  };
}

/** Fallback for profiles with no "Contact info" link: the name next to the company logo. */
function companyBesideLogo(top: Element): string {
  let node: Element | null = top.querySelector('img[src*="company-logo"]');
  for (let i = 0; i < 6 && node; i++) {
    node = node.parentElement;
    const p = node?.querySelector('p');
    if (p?.textContent?.trim()) return p.textContent.trim();
  }
  return '';
}

export function parseProfile(doc: Document, url: string): ScrapedProfile | null {
  const slug = slugFromUrl(url);
  if (!slug) return null;

  const name = nameFrom(doc);
  const top = topCardFrom(doc, name);

  return {
    slug,
    url: `https://www.linkedin.com/in/${slug}`,
    // The slug is a poor name but it always identifies the record.
    name: name || slug,
    headline: top.headline,
    company: top.company,
    // LinkedIn no longer surfaces a role separate from the headline.
    role: '',
    location: top.location,
    about: aboutFrom(doc),
    photoUrl: top.photoUrl,
  };
}
