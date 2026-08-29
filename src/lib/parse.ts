import type { ScrapedProfile } from './types';

/** Every LinkedIn-specific selector in the project lives in this file. */

export function slugFromUrl(url: string): string | null {
  const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

const text = (doc: Document, selector: string): string =>
  doc.querySelector(selector)?.textContent?.trim() ?? '';

/** First non-empty result from a list of selectors. */
const firstText = (doc: Document, selectors: string[]): string => {
  for (const s of selectors) {
    const t = text(doc, s);
    if (t) return t;
  }
  return '';
};

type Person = {
  name?: string;
  jobTitle?: string[] | string;
  worksFor?: { name?: string }[] | { name?: string };
  address?: { addressLocality?: string; addressCountry?: string };
  image?: { contentUrl?: string };
  description?: string;
};

/** LinkedIn ships a schema.org Person block. Far more stable than class names. */
function jsonLdPerson(doc: Document): Person | null {
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(el.textContent ?? '');
    } catch {
      continue;
    }
    const graph = (data as { '@graph'?: unknown[] })?.['@graph'] ?? [data];
    const person = graph.find((n) => (n as { '@type'?: string })?.['@type'] === 'Person');
    if (person) return person as Person;
  }
  return null;
}

const one = <T,>(v: T[] | T | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

function fromJsonLd(p: Person) {
  const addr = p.address;
  const location = [addr?.addressLocality, addr?.addressCountry].filter(Boolean).join(', ');
  return {
    name: p.name?.trim() ?? '',
    role: (one(p.jobTitle) ?? '').trim(),
    company: (one(p.worksFor)?.name ?? '').trim(),
    location,
    photoUrl: p.image?.contentUrl ?? '',
    about: p.description?.trim() ?? '',
  };
}

function fromDom(doc: Document) {
  return {
    name: firstText(doc, ['main h1', 'h1']),
    headline: firstText(doc, [
      'main .text-body-medium.break-words',
      '.text-body-medium.break-words',
    ]),
    location: firstText(doc, [
      'main .text-body-small.inline.t-black--light.break-words',
      '.text-body-small.inline.t-black--light.break-words',
    ]),
    photoUrl:
      doc.querySelector<HTMLImageElement>(
        'img.pv-top-card-profile-picture__image, main img[class*="profile-picture"]',
      )?.src ?? '',
    about: doc.querySelector('#about')?.closest('section')?.textContent?.trim() ?? '',
  };
}

/** Prefer `a`, fall back to `b`, never undefined. */
const or = (a: string | undefined, b: string | undefined): string => (a || b || '').trim();

export function parseProfile(doc: Document, url: string): ScrapedProfile | null {
  const slug = slugFromUrl(url);
  if (!slug) return null;

  const dom = fromDom(doc);
  const person = jsonLdPerson(doc);
  const ld = person ? fromJsonLd(person) : null;

  return {
    slug,
    url: `https://www.linkedin.com/in/${slug}`,
    // The slug is a poor name but it always identifies the record.
    name: or(ld?.name, dom.name) || slug,
    headline: or(dom.headline, ld?.about),
    company: or(ld?.company, ''),
    role: or(ld?.role, ''),
    location: or(ld?.location, dom.location),
    about: or(ld?.about, dom.about),
    photoUrl: or(ld?.photoUrl, dom.photoUrl),
  };
}
