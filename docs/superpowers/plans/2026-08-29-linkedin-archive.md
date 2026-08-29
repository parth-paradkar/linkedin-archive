# LinkedIn Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome MV3 extension that saves LinkedIn profiles from a button on the page, and a viewer page for searching, tagging, and annotating them.

**Architecture:** Everything is client-side. A content script scrapes the profile and shows a floating save widget in a shadow root. A background service worker owns every write to `chrome.storage.local`. A viewer page loads the whole collection into memory and filters it there. No server, no account, no sync — JSON export and import are the backup path.

**Tech Stack:** TypeScript, Vite, `@crxjs/vite-plugin`, Vitest, happy-dom. No UI framework.

## Global Constraints

- Chrome only. Target Manifest V3.
- Dependency set is fixed. Add nothing beyond: `vite@^8.2.2`, `@crxjs/vite-plugin@^2.7.1`, `vitest@^4.1.11`, `happy-dom@^20.11.15`, `@types/chrome@^0.2.7`, `typescript@^7.0.2`.
- No UI framework. Viewer DOM is hand-rolled.
- TypeScript `strict: true`. Every task must leave `npm run typecheck` passing.
- All content-script CSS lives inside a shadow root. Every class name in it is prefixed `lia-`.
- Every write to `chrome.storage.local` goes through `src/lib/storage.ts`, called from the background worker. The content script and viewer never write storage directly.
- `parseProfile` never throws. Missing fields become `''`.
- Repo root is `/Users/parth/Work/linkedin-archive`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `manifest.config.ts` | The MV3 manifest as a typed object. |
| `vite.config.ts` | Build config. Loads the crx plugin. |
| `vitest.config.ts` | Test config. No plugins, so tests never run the crx pipeline. |
| `tsconfig.json` | Strict TS, `chrome` types. |
| `src/lib/types.ts` | `Profile`, `ScrapedProfile`. |
| `src/lib/parse.ts` | `slugFromUrl`, `parseProfile`. All LinkedIn selectors live here and nowhere else. |
| `src/lib/filter.ts` | `filterProfiles`, `allTags`. Pure. |
| `src/lib/storage.ts` | `mergeProfile`, `pickNewer` (pure) plus the `chrome.storage.local` wrapper. |
| `src/lib/messages.ts` | Message request and response types, `send` helper. |
| `src/background/background.ts` | Message router, action click handler, viewer opener. |
| `src/content/content.ts` | Floating save widget, saved-state badge, SPA URL watcher. |
| `src/viewer/index.html` | Viewer markup shell. |
| `src/viewer/viewer.css` | Viewer styles. |
| `src/viewer/main.ts` | Viewer state, data loading, event wiring. |
| `src/viewer/render.ts` | Pure render functions producing DOM for the list, tag filter, and detail panel. |
| `tests/*.test.ts` | Vitest suites. |
| `tests/fixtures/` | Saved LinkedIn HTML. |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `manifest.config.ts`, `.gitignore`, `src/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Profile` and `ScrapedProfile` types, imported by every later task. An `npm run build` that emits a loadable `dist/`.

- [ ] **Step 1: Initialise the package**

```bash
cd /Users/parth/Work/linkedin-archive
npm init -y
npm pkg set name="linkedin-archive" version="0.1.0" private=true type="module"
npm pkg delete main scripts.test
npm pkg set scripts.dev="vite" scripts.build="vite build" scripts.typecheck="tsc --noEmit" scripts.test="vitest run"
npm i -D vite@^8.2.2 @crxjs/vite-plugin@^2.7.1 vitest@^4.1.11 happy-dom@^20.11.15 @types/chrome@^0.2.7 typescript@^7.0.2
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules
dist
.DS_Store
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["chrome", "vite/client"],
    "strict": true,
    "noUnusedLocals": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "*.config.ts"]
}
```

- [ ] **Step 4: Write `manifest.config.ts`**

Note there is no `icons` key — Chrome falls back to a default icon, which is fine for a personal tool.

```ts
import type { ManifestV3Export } from '@crxjs/vite-plugin';

const manifest: ManifestV3Export = {
  manifest_version: 3,
  name: 'LinkedIn Archive',
  version: '0.1.0',
  description: 'Save LinkedIn profiles with notes and tags.',
  permissions: ['storage', 'unlimitedStorage'],
  host_permissions: ['*://*.linkedin.com/*'],
  background: {
    service_worker: 'src/background/background.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['*://*.linkedin.com/in/*'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  action: { default_title: 'Open LinkedIn Archive' },
  options_ui: { page: 'src/viewer/index.html', open_in_tab: true },
};

export default manifest;
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { emptyOutDir: true },
});
```

- [ ] **Step 6: Write `vitest.config.ts`**

Kept separate from `vite.config.ts` so the crx plugin never runs during tests.

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 7: Write `src/lib/types.ts`**

```ts
/** A saved profile: scraped snapshot plus user data plus bookkeeping. */
export type Profile = {
  /** Primary key. The `<slug>` in linkedin.com/in/<slug>. */
  slug: string;
  url: string;
  name: string;
  headline: string;
  company: string;
  role: string;
  location: string;
  about: string;
  /** LinkedIn CDN URL. Not image bytes. */
  photoUrl: string;
  /** ISO 8601. Set once, on first save. */
  savedAt: string;
  /** ISO 8601. Bumped on re-scrape and on note or tag edits. */
  updatedAt: string;
  tags: string[];
  note: string;
};

/** The subset of Profile that comes from scraping the page. */
export type ScrapedProfile = Pick<
  Profile,
  'slug' | 'url' | 'name' | 'headline' | 'company' | 'role' | 'location' | 'about' | 'photoUrl'
>;
```

- [ ] **Step 8: Create placeholder entry points so the build resolves**

These are replaced in Tasks 6, 7, and 8. They exist now only so `vite build` has real files to chase from the manifest.

```bash
mkdir -p src/background src/content src/viewer tests/fixtures
printf 'export {};\n' > src/background/background.ts
printf 'export {};\n' > src/content/content.ts
printf '<!doctype html>\n<html><head><title>LinkedIn Archive</title></head><body><div id="app"></div><script type="module" src="./main.ts"></script></body></html>\n' > src/viewer/index.html
printf 'export {};\n' > src/viewer/main.ts
```

- [ ] **Step 9: Verify the build and the types**

Run: `npm run typecheck && npm run build`
Expected: both exit 0, and `dist/manifest.json` exists.

- [ ] **Step 10: Confirm the built viewer path**

Run: `cat dist/manifest.json`
Expected: an `options_ui.page` value pointing at an HTML file that exists under `dist/`. Confirm with `ls dist/src/viewer/` (or whatever path the manifest names). Later code reads this path from the manifest at runtime rather than hardcoding it, so any value here is acceptable — this step is only to confirm the page was emitted at all.

- [ ] **Step 11: Load the extension in Chrome**

Open `chrome://extensions`, enable Developer mode, click "Load unpacked", select `dist/`.
Expected: the extension appears with no errors listed on its card.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold MV3 extension build with Vite and crxjs"
```

---

### Task 2: Profile parsing

LinkedIn embeds a JSON-LD `Person` block on profile pages. That is far more stable than their CSS class names, so it is the primary source and DOM selectors are only the fallback.

**Files:**
- Create: `src/lib/parse.ts`, `tests/parse.test.ts`

**Interfaces:**
- Consumes: `ScrapedProfile` from `src/lib/types.ts`.
- Produces:
  - `slugFromUrl(url: string): string | null`
  - `parseProfile(doc: Document, url: string): ScrapedProfile | null` — returns `null` only when the URL has no slug.

- [ ] **Step 1: Write the failing test**

Create `tests/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugFromUrl, parseProfile } from '../src/lib/parse';

const parse = (html: string, url: string) =>
  parseProfile(new DOMParser().parseFromString(html, 'text/html'), url);

const JSON_LD_PAGE = `
<html><head>
<script type="application/ld+json">
{"@context":"http://schema.org","@graph":[
  {"@type":"WebPage","url":"https://www.linkedin.com/in/janedoe"},
  {"@type":"Person",
   "name":"Jane Doe",
   "jobTitle":["Staff Engineer"],
   "worksFor":[{"@type":"Organization","name":"Acme Corp"}],
   "address":{"@type":"PostalAddress","addressLocality":"Berlin","addressCountry":"DE"},
   "image":{"@type":"ImageObject","contentUrl":"https://media.licdn.com/jane.jpg"},
   "description":"Building reliable systems."}
]}
</script>
</head><body>
<main><h1>Jane Doe</h1>
<div class="text-body-medium break-words">Staff Engineer at Acme Corp</div>
</main>
</body></html>`;

const DOM_ONLY_PAGE = `
<html><body><main>
<h1>  John Smith  </h1>
<div class="text-body-medium break-words">Designer at Globex</div>
<span class="text-body-small inline t-black--light break-words">Lisbon, Portugal</span>
<img class="pv-top-card-profile-picture__image" src="https://media.licdn.com/john.jpg">
<section><div id="about"></div><p>Ten years of product design.</p></section>
</main></body></html>`;

describe('slugFromUrl', () => {
  it('extracts the slug', () => {
    expect(slugFromUrl('https://www.linkedin.com/in/janedoe/')).toBe('janedoe');
  });

  it('ignores query strings and subpaths', () => {
    expect(slugFromUrl('https://www.linkedin.com/in/jane-doe-1a2b/details/experience?x=1')).toBe(
      'jane-doe-1a2b',
    );
  });

  it('returns null off a profile page', () => {
    expect(slugFromUrl('https://www.linkedin.com/feed/')).toBeNull();
  });
});

describe('parseProfile', () => {
  it('prefers JSON-LD', () => {
    const p = parse(JSON_LD_PAGE, 'https://www.linkedin.com/in/janedoe/')!;
    expect(p.slug).toBe('janedoe');
    expect(p.url).toBe('https://www.linkedin.com/in/janedoe');
    expect(p.name).toBe('Jane Doe');
    expect(p.role).toBe('Staff Engineer');
    expect(p.company).toBe('Acme Corp');
    expect(p.location).toBe('Berlin, DE');
    expect(p.photoUrl).toBe('https://media.licdn.com/jane.jpg');
    expect(p.headline).toBe('Staff Engineer at Acme Corp');
  });

  it('falls back to DOM selectors when JSON-LD is absent', () => {
    const p = parse(DOM_ONLY_PAGE, 'https://www.linkedin.com/in/johnsmith')!;
    expect(p.name).toBe('John Smith');
    expect(p.headline).toBe('Designer at Globex');
    expect(p.location).toBe('Lisbon, Portugal');
    expect(p.photoUrl).toBe('https://media.licdn.com/john.jpg');
    expect(p.about).toBe('Ten years of product design.');
  });

  it('degrades to the slug rather than throwing on an empty page', () => {
    const p = parse('<html><body></body></html>', 'https://www.linkedin.com/in/ghost')!;
    expect(p.name).toBe('ghost');
    expect(p.headline).toBe('');
    expect(p.company).toBe('');
  });

  it('survives malformed JSON-LD', () => {
    const html = `<html><head><script type="application/ld+json">{ not json </script></head>
      <body><main><h1>Fallback Name</h1></main></body></html>`;
    expect(parse(html, 'https://www.linkedin.com/in/x')!.name).toBe('Fallback Name');
  });

  it('returns null when the URL is not a profile', () => {
    expect(parse(JSON_LD_PAGE, 'https://www.linkedin.com/feed/')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/parse.test.ts`
Expected: FAIL — cannot resolve `../src/lib/parse`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/parse.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/parse.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/parse.ts tests/parse.test.ts
git commit -m "feat: parse LinkedIn profiles from JSON-LD with DOM fallback"
```

---

### Task 3: Calibrate the parser against a real page

Task 2's selectors were written against synthetic HTML. This task checks them against markup LinkedIn actually serves, which is the only way to know whether they work.

**Files:**
- Create: `tests/fixtures/profile.html`, `tests/parse.fixture.test.ts`
- Modify: `src/lib/parse.ts` (selectors only, if the fixture proves them wrong)

**Interfaces:**
- Consumes: `parseProfile` from Task 2.
- Produces: no new exports. A parser verified against real markup.

- [ ] **Step 1: Capture a real profile page**

In Chrome, logged in, open any LinkedIn profile. Open DevTools console and run:

```js
copy(document.documentElement.outerHTML)
```

Paste into `tests/fixtures/profile.html`.

Before committing, read through the file and delete anything you do not want in the repo — this dump contains your own session's rendered page. In particular, search for `csrf`, `JSESSIONID`, and your own name in the navigation chrome. The parts the test needs are the `application/ld+json` block and the `<main>` element; deleting everything else is the safest option and makes the fixture readable.

- [ ] **Step 2: Write the fixture test**

Create `tests/parse.fixture.test.ts`. Replace every `EXPECTED_*` value with what the captured profile actually shows.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProfile } from '../src/lib/parse';

const html = readFileSync(new URL('./fixtures/profile.html', import.meta.url), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

// Set these to the values shown on the profile you captured.
const EXPECTED_SLUG = 'REPLACE_ME';
const EXPECTED_NAME = 'REPLACE_ME';

describe('parseProfile against a real captured page', () => {
  const p = parseProfile(doc, `https://www.linkedin.com/in/${EXPECTED_SLUG}/`)!;

  it('reads the name', () => {
    expect(p.name).toBe(EXPECTED_NAME);
  });

  it('reads a headline', () => {
    expect(p.headline.length).toBeGreaterThan(0);
  });

  it('reads a photo URL', () => {
    expect(p.photoUrl).toMatch(/^https:\/\//);
  });

  it('reads a location', () => {
    expect(p.location.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the fixture test**

Run: `npx vitest run tests/parse.fixture.test.ts`
Expected: it may FAIL. That is the point of the task.

- [ ] **Step 4: Fix the selectors until it passes**

For each failing field, find the real element in `tests/fixtures/profile.html` and add its selector to the front of the relevant array in `fromDom` in `src/lib/parse.ts`. Keep the existing selectors behind the new ones — `firstText` walks the list in order, so old selectors stay as fallbacks for older markup.

Change only `src/lib/parse.ts`. If a field genuinely is not present on the page (some profiles have no About section), relax that assertion in the test rather than inventing a selector.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. Task 2's synthetic tests must still pass — if a selector change broke one, the change was too aggressive.

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/profile.html tests/parse.fixture.test.ts src/lib/parse.ts
git commit -m "test: calibrate profile parser against a real LinkedIn page"
```

---

### Task 4: Storage

**Files:**
- Create: `src/lib/storage.ts`, `tests/storage.test.ts`

**Interfaces:**
- Consumes: `Profile`, `ScrapedProfile`.
- Produces:
  - `mergeProfile(existing: Profile | undefined, scraped: ScrapedProfile, now: string): Profile` — pure
  - `pickNewer(a: Profile | undefined, b: Profile): Profile` — pure
  - `getProfile(slug: string): Promise<Profile | undefined>`
  - `allProfiles(): Promise<Profile[]>` — newest `savedAt` first
  - `putProfile(p: Profile): Promise<void>`
  - `saveScraped(s: ScrapedProfile): Promise<Profile>`
  - `deleteProfile(slug: string): Promise<void>`
  - `importProfiles(incoming: Profile[]): Promise<{ added: number; updated: number; skipped: number }>`

- [ ] **Step 1: Write the failing test**

Create `tests/storage.test.ts`. The fake chrome object is small enough to keep inline.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type { Profile, ScrapedProfile } from '../src/lib/types';

function fakeChrome() {
  let store: Record<string, unknown> = {};
  return {
    reset: () => {
      store = {};
    },
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          if (keys === null) return { ...store };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            list.filter((k) => k in store).map((k) => [k, store[k]]),
          );
        },
        async set(items: Record<string, unknown>) {
          Object.assign(store, items);
        },
        async remove(key: string) {
          delete store[key];
        },
      },
    },
  };
}

const chromeStub = fakeChrome();
(globalThis as unknown as { chrome: unknown }).chrome = chromeStub;

const {
  mergeProfile,
  pickNewer,
  putProfile,
  getProfile,
  allProfiles,
  saveScraped,
  deleteProfile,
  importProfiles,
} = await import('../src/lib/storage');

const scraped = (over: Partial<ScrapedProfile> = {}): ScrapedProfile => ({
  slug: 'jane',
  url: 'https://www.linkedin.com/in/jane',
  name: 'Jane Doe',
  headline: 'Staff Engineer',
  company: 'Acme',
  role: 'Staff Engineer',
  location: 'Berlin',
  about: 'Systems.',
  photoUrl: 'https://media.licdn.com/jane.jpg',
  ...over,
});

const profile = (over: Partial<Profile> = {}): Profile => ({
  ...scraped(),
  savedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  note: '',
  ...over,
});

beforeEach(() => chromeStub.reset());

describe('mergeProfile', () => {
  it('creates a new record with empty user data', () => {
    const p = mergeProfile(undefined, scraped(), '2026-05-05T00:00:00.000Z');
    expect(p.savedAt).toBe('2026-05-05T00:00:00.000Z');
    expect(p.updatedAt).toBe('2026-05-05T00:00:00.000Z');
    expect(p.tags).toEqual([]);
    expect(p.note).toBe('');
  });

  it('preserves notes, tags, and savedAt on re-scrape', () => {
    const existing = profile({ note: 'met at conf', tags: ['founders'] });
    const p = mergeProfile(existing, scraped({ company: 'NewCo' }), '2026-06-06T00:00:00.000Z');
    expect(p.note).toBe('met at conf');
    expect(p.tags).toEqual(['founders']);
    expect(p.savedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(p.updatedAt).toBe('2026-06-06T00:00:00.000Z');
    expect(p.company).toBe('NewCo');
  });

  it('keeps the old value when a re-scrape returns an empty field', () => {
    const existing = profile({ headline: 'Staff Engineer' });
    const p = mergeProfile(existing, scraped({ headline: '' }), '2026-06-06T00:00:00.000Z');
    expect(p.headline).toBe('Staff Engineer');
  });
});

describe('pickNewer', () => {
  it('takes the incoming record when it is newer', () => {
    const a = profile({ note: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const b = profile({ note: 'new', updatedAt: '2026-02-02T00:00:00.000Z' });
    expect(pickNewer(a, b).note).toBe('new');
  });

  it('keeps the existing record when the incoming one is older', () => {
    const a = profile({ note: 'keep', updatedAt: '2026-03-03T00:00:00.000Z' });
    const b = profile({ note: 'stale', updatedAt: '2026-02-02T00:00:00.000Z' });
    expect(pickNewer(a, b).note).toBe('keep');
  });
});

describe('storage round trip', () => {
  it('stores and reads back a profile', async () => {
    await putProfile(profile());
    expect((await getProfile('jane'))?.name).toBe('Jane Doe');
  });

  it('returns undefined for an unknown slug', async () => {
    expect(await getProfile('nobody')).toBeUndefined();
  });

  it('lists newest first and ignores non-profile keys', async () => {
    await chromeStub.storage.local.set({ 'settings:theme': 'dark' });
    await putProfile(profile({ slug: 'a', savedAt: '2026-01-01T00:00:00.000Z' }));
    await putProfile(profile({ slug: 'b', savedAt: '2026-03-03T00:00:00.000Z' }));
    expect((await allProfiles()).map((p) => p.slug)).toEqual(['b', 'a']);
  });

  it('saveScraped merges over an existing record', async () => {
    await putProfile(profile({ note: 'keep me' }));
    const saved = await saveScraped(scraped({ company: 'NewCo' }));
    expect(saved.note).toBe('keep me');
    expect(saved.company).toBe('NewCo');
  });

  it('deletes', async () => {
    await putProfile(profile());
    await deleteProfile('jane');
    expect(await getProfile('jane')).toBeUndefined();
  });

  it('imports by newest updatedAt', async () => {
    await putProfile(profile({ slug: 'jane', note: 'local', updatedAt: '2026-05-05T00:00:00.000Z' }));
    const result = await importProfiles([
      profile({ slug: 'jane', note: 'newer', updatedAt: '2026-07-07T00:00:00.000Z' }),
      profile({ slug: 'bob', note: 'fresh' }),
      profile({ slug: 'jane2', note: 'older', updatedAt: '2020-01-01T00:00:00.000Z' }),
    ]);
    expect((await getProfile('jane'))?.note).toBe('newer');
    expect((await getProfile('bob'))?.note).toBe('fresh');
    expect(result).toEqual({ added: 2, updated: 1, skipped: 0 });
  });

  it('skips import entries that are not profiles', async () => {
    const result = await importProfiles([{ note: 'no slug' } as unknown as Profile]);
    expect(result.skipped).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL — cannot resolve `../src/lib/storage`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage.ts`:

```ts
import type { Profile, ScrapedProfile } from './types';

const PREFIX = 'profile:';
const key = (slug: string) => `${PREFIX}${slug}`;

/** Prefer the fresh value, but never let an empty re-scrape wipe good data. */
const keep = (fresh: string, old: string | undefined): string => fresh || old || '';

export function mergeProfile(
  existing: Profile | undefined,
  s: ScrapedProfile,
  now: string,
): Profile {
  return {
    slug: s.slug,
    url: keep(s.url, existing?.url),
    name: keep(s.name, existing?.name),
    headline: keep(s.headline, existing?.headline),
    company: keep(s.company, existing?.company),
    role: keep(s.role, existing?.role),
    location: keep(s.location, existing?.location),
    about: keep(s.about, existing?.about),
    photoUrl: keep(s.photoUrl, existing?.photoUrl),
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
    tags: existing?.tags ?? [],
    note: existing?.note ?? '',
  };
}

export function pickNewer(a: Profile | undefined, b: Profile): Profile {
  if (!a) return b;
  return b.updatedAt > a.updatedAt ? b : a;
}

export async function getProfile(slug: string): Promise<Profile | undefined> {
  const k = key(slug);
  const got = await chrome.storage.local.get(k);
  return got[k] as Profile | undefined;
}

export async function allProfiles(): Promise<Profile[]> {
  const all = await chrome.storage.local.get(null);
  return Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([, v]) => v as Profile)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function putProfile(p: Profile): Promise<void> {
  await chrome.storage.local.set({ [key(p.slug)]: p });
}

export async function saveScraped(s: ScrapedProfile): Promise<Profile> {
  const merged = mergeProfile(await getProfile(s.slug), s, new Date().toISOString());
  await putProfile(merged);
  return merged;
}

export async function deleteProfile(slug: string): Promise<void> {
  await chrome.storage.local.remove(key(slug));
}

export async function importProfiles(
  incoming: Profile[],
): Promise<{ added: number; updated: number; skipped: number }> {
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of incoming) {
    // Import data is a file the user picked. Validate before it reaches storage.
    if (!raw || typeof raw.slug !== 'string' || !raw.slug || typeof raw.updatedAt !== 'string') {
      skipped++;
      continue;
    }
    const existing = await getProfile(raw.slug);
    const winner = pickNewer(existing, raw);
    if (winner === existing) continue;
    await putProfile(winner);
    existing ? updated++ : added++;
  }
  return { added, updated, skipped };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/lib/storage.ts tests/storage.test.ts
git commit -m "feat: add profile storage with merge-on-rescrape and import"
```

---

### Task 5: Search and tag filtering

**Files:**
- Create: `src/lib/filter.ts`, `tests/filter.test.ts`

**Interfaces:**
- Consumes: `Profile`.
- Produces:
  - `filterProfiles(profiles: Profile[], query: string, tags: string[]): Profile[]`
  - `allTags(profiles: Profile[]): { tag: string; count: number }[]` — alphabetical

- [ ] **Step 1: Write the failing test**

Create `tests/filter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterProfiles, allTags } from '../src/lib/filter';
import type { Profile } from '../src/lib/types';

const p = (over: Partial<Profile>): Profile => ({
  slug: 'x',
  url: '',
  name: '',
  headline: '',
  company: '',
  role: '',
  location: '',
  about: '',
  photoUrl: '',
  savedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  note: '',
  ...over,
});

const people = [
  p({ slug: 'jane', name: 'Jane Doe', company: 'Acme', tags: ['founders', 'berlin'] }),
  p({ slug: 'john', name: 'John Smith', headline: 'Designer', tags: ['design'] }),
  p({ slug: 'ada', name: 'Ada L', note: 'met at Acme offsite', tags: ['founders'] }),
];

describe('filterProfiles', () => {
  it('returns everything for an empty query and no tags', () => {
    expect(filterProfiles(people, '', [])).toHaveLength(3);
  });

  it('matches case-insensitively across fields', () => {
    expect(filterProfiles(people, 'acme', []).map((x) => x.slug)).toEqual(['jane', 'ada']);
  });

  it('requires every search term to match', () => {
    expect(filterProfiles(people, 'jane acme', []).map((x) => x.slug)).toEqual(['jane']);
    expect(filterProfiles(people, 'jane designer', [])).toHaveLength(0);
  });

  it('ignores surrounding whitespace', () => {
    expect(filterProfiles(people, '   jane  ', [])).toHaveLength(1);
  });

  it('requires all selected tags', () => {
    expect(filterProfiles(people, '', ['founders']).map((x) => x.slug)).toEqual(['jane', 'ada']);
    expect(filterProfiles(people, '', ['founders', 'berlin']).map((x) => x.slug)).toEqual(['jane']);
  });

  it('combines query and tags', () => {
    expect(filterProfiles(people, 'ada', ['founders']).map((x) => x.slug)).toEqual(['ada']);
    expect(filterProfiles(people, 'ada', ['design'])).toHaveLength(0);
  });

  it('searches tag names too', () => {
    expect(filterProfiles(people, 'design', []).map((x) => x.slug)).toEqual(['john']);
  });
});

describe('allTags', () => {
  it('counts tags alphabetically', () => {
    expect(allTags(people)).toEqual([
      { tag: 'berlin', count: 1 },
      { tag: 'design', count: 1 },
      { tag: 'founders', count: 2 },
    ]);
  });

  it('returns an empty list when nothing is tagged', () => {
    expect(allTags([p({})])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/filter.test.ts`
Expected: FAIL — cannot resolve `../src/lib/filter`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/filter.ts`:

```ts
import type { Profile } from './types';

const haystack = (p: Profile): string =>
  [p.name, p.headline, p.company, p.role, p.location, p.note, p.tags.join(' ')]
    .join(' ')
    .toLowerCase();

export function filterProfiles(profiles: Profile[], query: string, tags: string[]): Profile[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return profiles.filter((p) => {
    if (!tags.every((t) => p.tags.includes(t))) return false;
    if (!terms.length) return true;
    const h = haystack(p);
    return terms.every((t) => h.includes(t));
  });
}

export function allTags(profiles: Profile[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of profiles) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/filter.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/lib/filter.ts tests/filter.test.ts
git commit -m "feat: add profile search and tag filtering"
```

---

### Task 6: Background worker and message contract

**Files:**
- Create: `src/lib/messages.ts`
- Modify: `src/background/background.ts` (replaces the Task 1 placeholder)

**Interfaces:**
- Consumes: `saveScraped`, `getProfile` from `src/lib/storage.ts`; `ScrapedProfile`, `Profile` from types.
- Produces:
  - `send<K extends Msg['type']>(msg: Extract<Msg, { type: K }>): Promise<Res[K]>` from `src/lib/messages.ts`
  - Message types `Msg` and `Res`.
  - `openViewer(slug?: string): Promise<void>` from the background worker (not exported; invoked by message and by action click).

- [ ] **Step 1: Write the message contract**

Create `src/lib/messages.ts`:

```ts
import type { Profile, ScrapedProfile } from './types';

export type Msg =
  | { type: 'isSaved'; slug: string }
  | { type: 'saveProfile'; scraped: ScrapedProfile }
  | { type: 'openViewer'; slug?: string };

export type Res = {
  isSaved: { saved: boolean };
  saveProfile: { profile: Profile };
  openViewer: { ok: true };
};

/** Rejects if the worker reported an error, so callers can use try/catch. */
export async function send<K extends Msg['type']>(
  msg: Extract<Msg, { type: K }>,
): Promise<Res[K]> {
  const res = (await chrome.runtime.sendMessage(msg)) as Res[K] | { error: string };
  if (res && typeof res === 'object' && 'error' in res) throw new Error(res.error);
  return res as Res[K];
}
```

- [ ] **Step 2: Write the worker**

Replace `src/background/background.ts`:

```ts
import type { Msg, Res } from '../lib/messages';
import { getProfile, saveScraped } from '../lib/storage';

/** Read the viewer path from the manifest so the build's output path never has to be guessed. */
function viewerUrl(slug?: string): string {
  const page = chrome.runtime.getManifest().options_ui?.page;
  if (!page) throw new Error('viewer page missing from manifest');
  return chrome.runtime.getURL(page) + (slug ? `#${encodeURIComponent(slug)}` : '');
}

async function openViewer(slug?: string): Promise<void> {
  await chrome.tabs.create({ url: viewerUrl(slug) });
}

async function handle(msg: Msg): Promise<Res[Msg['type']]> {
  switch (msg.type) {
    case 'isSaved':
      return { saved: (await getProfile(msg.slug)) !== undefined };
    case 'saveProfile':
      return { profile: await saveScraped(msg.scraped) };
    case 'openViewer':
      await openViewer(msg.slug);
      return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse, (e: unknown) => sendResponse({ error: String(e) }));
  return true; // keep the channel open for the async response
});

chrome.action.onClicked.addListener(() => {
  void openViewer();
});
```

- [ ] **Step 3: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Verify the worker in Chrome**

Reload the extension at `chrome://extensions`. Click the toolbar icon.
Expected: a new tab opens showing the placeholder viewer page. No errors under the extension's "Errors" link or in the service worker's console.

- [ ] **Step 5: Commit**

```bash
git add src/lib/messages.ts src/background/background.ts
git commit -m "feat: add background message router and viewer opener"
```

---

### Task 7: Content script save widget

The widget is a fixed-position pill in its own shadow root rather than an element spliced into LinkedIn's top card. It cannot be broken by a LinkedIn redesign and its styles cannot leak either direction.

**Files:**
- Modify: `src/content/content.ts` (replaces the Task 1 placeholder)

**Interfaces:**
- Consumes: `slugFromUrl`, `parseProfile` from parse; `send` from messages.
- Produces: no exports. A UI surface on `linkedin.com/in/*`.

- [ ] **Step 1: Write the content script**

Replace `src/content/content.ts`:

```ts
import { parseProfile, slugFromUrl } from '../lib/parse';
import { send } from '../lib/messages';

const STYLE = `
.lia-pill {
  position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
  display: flex; gap: 8px; align-items: center;
  padding: 10px 16px; border: 0; border-radius: 999px;
  font: 600 14px/1 system-ui, -apple-system, sans-serif;
  color: #fff; background: #0a66c2; cursor: pointer;
  box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
}
.lia-pill:hover { background: #004182; }
.lia-pill[data-state="saved"] { background: #057642; }
.lia-pill[data-state="error"] { background: #b24020; }
.lia-pill[disabled] { opacity: 0.7; cursor: default; }
`;

let host: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;

function mount(): HTMLButtonElement {
  if (button) return button;
  host = document.createElement('div');
  host.id = 'lia-host';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  button = document.createElement('button');
  button.className = 'lia-pill';
  root.append(style, button);
  document.body.append(host);
  button.addEventListener('click', onClick);
  return button;
}

function setState(state: 'save' | 'saved' | 'busy' | 'error', label: string) {
  const b = mount();
  b.dataset.state = state;
  b.textContent = label;
  b.disabled = state === 'busy';
}

async function onClick() {
  const slug = slugFromUrl(location.href);
  if (!slug) return;

  if (button?.dataset.state === 'saved') {
    await send({ type: 'openViewer', slug });
    return;
  }

  setState('busy', 'Saving…');
  try {
    const scraped = parseProfile(document, location.href);
    if (!scraped) throw new Error('not a profile page');
    await send({ type: 'saveProfile', scraped });
    setState('saved', 'Saved ✓ · Open note');
  } catch (e) {
    setState('error', 'Save failed — retry');
    console.error('[LinkedIn Archive]', e);
  }
}

async function refresh() {
  const slug = slugFromUrl(location.href);
  if (!slug) {
    host?.remove();
    host = null;
    button = null;
    return;
  }
  try {
    const { saved } = await send({ type: 'isSaved', slug });
    setState(saved ? 'saved' : 'save', saved ? 'Saved ✓ · Open note' : 'Save to Archive');
  } catch (e) {
    console.error('[LinkedIn Archive]', e);
  }
}

// ponytail: 1s poll for LinkedIn's client-side navigation. Swap for the
// Navigation API if it turns out to be exposed to isolated worlds.
let lastHref = '';
setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  void refresh();
}, 1000);

void refresh();
```

- [ ] **Step 2: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 3: Verify on a real profile**

Reload the extension. Open a LinkedIn profile.
Expected: a blue "Save to Archive" pill in the bottom-right corner. Click it. It turns green and reads "Saved ✓ · Open note".

- [ ] **Step 4: Verify the saved-state badge and SPA navigation**

Reload the same profile.
Expected: the pill is green immediately.

Now click through to a different person's profile from within LinkedIn, without a full page load.
Expected: within about a second the pill flips back to blue "Save to Archive".

Navigate to `linkedin.com/feed`.
Expected: the pill disappears.

- [ ] **Step 5: Verify the stored record**

In the service worker console (`chrome://extensions` → "service worker"):

```js
chrome.storage.local.get(null).then(console.log)
```

Expected: a `profile:<slug>` key whose value has a real `name`, `headline`, and `photoUrl`. If any of those is empty, go back to Task 3 and fix the selector — do not work around it here.

- [ ] **Step 6: Commit**

```bash
git add src/content/content.ts
git commit -m "feat: add floating save widget to LinkedIn profile pages"
```

---

### Task 8: Viewer list, search, and tag filter

**Files:**
- Modify: `src/viewer/index.html`, `src/viewer/main.ts` (replace the Task 1 placeholders)
- Create: `src/viewer/viewer.css`, `src/viewer/render.ts`

**Interfaces:**
- Consumes: `allProfiles` from storage; `filterProfiles`, `allTags` from filter.
- Produces:
  - `renderList(profiles: Profile[], selectedSlug: string | null): DocumentFragment`
  - `renderTagFilter(tags: { tag: string; count: number }[], selected: string[]): DocumentFragment`
  - `renderDetail(p: Profile | null): DocumentFragment` (detail body is filled in Task 9; this task renders the read-only header)

- [ ] **Step 1: Write the markup**

Replace `src/viewer/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>LinkedIn Archive</title>
    <link rel="stylesheet" href="./viewer.css" />
  </head>
  <body>
    <aside class="sidebar">
      <h1>Archive</h1>
      <input id="search" type="search" placeholder="Search…" autocomplete="off" />
      <div id="tags" class="tags"></div>
      <div class="spacer"></div>
      <div class="io">
        <button id="export" type="button">Export JSON</button>
        <button id="import-btn" type="button">Import JSON</button>
        <input id="import" type="file" accept="application/json" hidden />
      </div>
      <p id="io-status" class="status"></p>
    </aside>
    <main class="list" id="list"></main>
    <section class="detail" id="detail"></section>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Write the styles**

Create `src/viewer/viewer.css`:

```css
:root {
  --bg: #fff;
  --fg: #1a1a1a;
  --muted: #666;
  --line: #e3e3e3;
  --accent: #0a66c2;
  --sel: #eef3f8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1f23;
    --fg: #e8e8e8;
    --muted: #9aa0a6;
    --line: #33383d;
    --sel: #26333f;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  display: grid;
  grid-template-columns: 260px minmax(320px, 1fr) minmax(0, 1.2fr);
  height: 100vh;
  font: 14px/1.5 system-ui, -apple-system, sans-serif;
  color: var(--fg);
  background: var(--bg);
}
.sidebar { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-right: 1px solid var(--line); overflow-y: auto; }
.sidebar h1 { margin: 0; font-size: 16px; }
.spacer { flex: 1; }
input, textarea, button { font: inherit; color: inherit; }
#search { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }
.tags { display: flex; flex-direction: column; gap: 2px; }
.tag-toggle { display: flex; justify-content: space-between; gap: 8px; padding: 4px 6px; border: 0; border-radius: 4px; background: none; cursor: pointer; text-align: left; }
.tag-toggle[aria-pressed='true'] { background: var(--accent); color: #fff; }
.tag-toggle .count { color: var(--muted); }
.tag-toggle[aria-pressed='true'] .count { color: #cfe2f5; }
.io { display: flex; gap: 8px; }
.io button { flex: 1; padding: 6px; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer; }
.status { min-height: 1.5em; margin: 0; color: var(--muted); font-size: 12px; }
.list { overflow-y: auto; border-right: 1px solid var(--line); }
.row { display: flex; gap: 12px; width: 100%; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--line); background: none; cursor: pointer; text-align: left; }
.row[aria-current='true'] { background: var(--sel); }
.row img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: var(--line); }
.row .name { font-weight: 600; }
.row .sub { color: var(--muted); font-size: 13px; }
.row .sub, .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .meta { min-width: 0; }
.empty { padding: 32px 16px; color: var(--muted); }
.detail { padding: 24px; overflow-y: auto; }
.detail img { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; background: var(--line); }
.detail h2 { margin: 12px 0 4px; font-size: 20px; }
.detail .muted { color: var(--muted); }
.detail label { display: block; margin: 20px 0 6px; font-weight: 600; }
.detail textarea, .detail input[type='text'] { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); }
.detail textarea { min-height: 160px; resize: vertical; }
.detail .about { white-space: pre-wrap; }
.danger { margin-top: 24px; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: none; color: #b24020; cursor: pointer; }
```

- [ ] **Step 3: Write the render functions**

Create `src/viewer/render.ts`:

```ts
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
    el('p', { className: 'muted', textContent: [p.company, p.location].filter(Boolean).join(' · ') }),
    el('p', {}, [el('a', { href: p.url, target: '_blank', rel: 'noreferrer', textContent: 'Open on LinkedIn ↗' })]),
    el('p', { className: 'muted', textContent: `Saved ${new Date(p.savedAt).toLocaleDateString()}` }),
  );
  if (p.about) {
    f.append(el('label', { textContent: 'About' }), el('p', { className: 'about', textContent: p.about }));
  }
  return f;
}
```

Note every field goes in through `textContent`, never `innerHTML`. Profile text is scraped from a page controlled by someone else and must never be parsed as markup.

- [ ] **Step 4: Write the viewer bootstrap**

Replace `src/viewer/main.ts`:

```ts
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
```

- [ ] **Step 5: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 6: Verify in Chrome**

Reload the extension. Save two or three profiles from LinkedIn, then click the toolbar icon.
Expected: the saved profiles appear as rows with photo, name, and headline. Typing in the search box narrows the list live. Clicking a row shows its detail panel on the right and highlights the row.

- [ ] **Step 7: Verify the deep link**

On a saved LinkedIn profile, click the green "Saved ✓ · Open note" pill.
Expected: the viewer opens with that profile already selected.

- [ ] **Step 8: Commit**

```bash
git add src/viewer/
git commit -m "feat: add viewer with profile list, search, and tag filter"
```

---

### Task 9: Notes and tag editing

**Files:**
- Modify: `src/viewer/render.ts`, `src/viewer/main.ts`

**Interfaces:**
- Consumes: `putProfile`, `deleteProfile` from storage; the render functions from Task 8.
- Produces:
  - `parseTagInput(raw: string): string[]` in `src/lib/filter.ts` — pure, comma-separated, trimmed, lowercased, de-duplicated
  - `renderDetail` gains a note textarea (`#note`), a tag input (`#tag-input`), and a delete button (`#delete`).

- [ ] **Step 1: Write the failing test for tag parsing**

Append to `tests/filter.test.ts`:

```ts
import { parseTagInput } from '../src/lib/filter';

describe('parseTagInput', () => {
  it('splits on commas and trims', () => {
    expect(parseTagInput(' founders , berlin ')).toEqual(['founders', 'berlin']);
  });

  it('lowercases and de-duplicates', () => {
    expect(parseTagInput('Founders, founders, FOUNDERS')).toEqual(['founders']);
  });

  it('drops empty entries', () => {
    expect(parseTagInput('a,,  ,b,')).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseTagInput('   ')).toEqual([]);
  });
});
```

Move the new `import` to the top of the file alongside the existing one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/filter.test.ts`
Expected: FAIL — `parseTagInput` is not exported.

- [ ] **Step 3: Implement `parseTagInput`**

Append to `src/lib/filter.ts`:

```ts
export function parseTagInput(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/filter.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Add the editable fields to `renderDetail`**

In `src/viewer/render.ts`, replace the `if (p.about) { ... }` block at the end of `renderDetail` with:

```ts
  if (p.about) {
    f.append(el('label', { textContent: 'About' }), el('p', { className: 'about', textContent: p.about }));
  }

  const tagInput = el('input', { type: 'text', value: p.tags.join(', '), placeholder: 'comma, separated' });
  tagInput.id = 'tag-input';
  const note = el('textarea', { value: p.note, placeholder: 'Notes…' });
  note.id = 'note';
  const del = el('button', { className: 'danger', type: 'button', textContent: 'Delete profile' });
  del.id = 'delete';

  f.append(
    el('label', { htmlFor: 'tag-input', textContent: 'Tags' }),
    tagInput,
    el('label', { htmlFor: 'note', textContent: 'Note' }),
    note,
    del,
  );
  return f;
}
```

Delete the now-duplicated trailing `return f;` from the original function body.

- [ ] **Step 6: Wire the editors in `main.ts`**

Add to `src/viewer/main.ts`, before the final `export { state };`:

```ts
import { parseTagInput } from '../lib/filter';
import { deleteProfile, putProfile } from '../lib/storage';

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
```

- [ ] **Step 7: Typecheck, test, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all exit 0.

- [ ] **Step 8: Verify in Chrome**

Reload the extension and open the viewer.
Expected:
- Typing in the note field and waiting a second, then selecting another profile and coming back, shows the note preserved.
- Entering `founders, berlin` in Tags and pressing Tab makes both tags appear in the sidebar with counts, and clicking one filters the list.
- Searching for a word that appears only in a note finds that profile.
- Delete asks for confirmation and removes the row.

- [ ] **Step 9: Verify notes survive a re-scrape**

Go back to a LinkedIn profile you annotated and click the green pill so it re-saves (click it once to open the viewer, then return and use the pill after a reload — or delete-and-resave a different profile to confirm). Simpler check, in the service worker console:

```js
chrome.storage.local.get(null).then((all) => console.log(Object.values(all).map((p) => [p.slug, p.note, p.tags])))
```

Expected: notes and tags are still attached to their profiles.

- [ ] **Step 10: Commit**

```bash
git add src/viewer/ src/lib/filter.ts tests/filter.test.ts
git commit -m "feat: add note and tag editing to the viewer"
```

---

### Task 10: Export and import

With no server, this is the only backup path, so it ships in v1.

**Files:**
- Modify: `src/viewer/main.ts`

**Interfaces:**
- Consumes: `allProfiles`, `importProfiles` from storage.
- Produces: no new exports. Wires `#export`, `#import-btn`, `#import`, and `#io-status`, which already exist in the Task 8 markup.

- [ ] **Step 1: Wire export and import**

Add to `src/viewer/main.ts`, before the final `export { state };`:

```ts
import { importProfiles } from '../lib/storage';

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
```

- [ ] **Step 2: Typecheck, test, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all exit 0.

- [ ] **Step 3: Verify the round trip**

Reload the extension and open the viewer with several profiles saved, at least one carrying a note and tags.

1. Click "Export JSON". A file downloads.
2. Delete one profile from the viewer.
3. Click "Import JSON" and pick the exported file.

Expected: the deleted profile comes back with its note and tags intact, and the status line reads `Added 1, updated 0, skipped N` — where the other records are left alone because their `updatedAt` matches.

- [ ] **Step 4: Verify import rejects junk**

Import a file containing `{"nope": true}`.
Expected: the status line reads `Import failed: expected a JSON array of profiles` and nothing changes.

- [ ] **Step 5: Commit**

```bash
git add src/viewer/main.ts
git commit -m "feat: add JSON export and import"
```

- [ ] **Step 6: Write the README**

Create `README.md`:

```markdown
# LinkedIn Archive

A Chrome extension that saves LinkedIn profiles with notes and tags. No server, no account. Everything lives in `chrome.storage.local` in one browser profile.

## Install

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer mode, click "Load unpacked", and select `dist/`.

## Use

- On any `linkedin.com/in/...` page, click the pill in the bottom-right to save the profile. It turns green once saved.
- Click the toolbar icon to open the archive: search, filter by tag, and edit notes.
- Export JSON regularly. It is the only backup.

## Develop

```bash
npm test        # unit tests
npm run typecheck
npm run build
```

If LinkedIn changes its markup and fields stop being captured, the fix is in `src/lib/parse.ts` — add the new selector to the front of the relevant list in `fromDom`. Re-capture `tests/fixtures/profile.html` to catch it in tests.
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review Notes

**Spec coverage:** Content script (Task 7), background worker (Task 6), storage module (Task 4), viewer (Tasks 8–9), `Profile` model (Task 1), save flow with badge (Task 7), viewing flow with search and tag AND-logic (Task 8), backup flow (Task 10), error handling (Tasks 2, 4, 7, 10), permissions (Task 1), both required test targets (Tasks 2, 3, 5). All covered.

**Deviations from the spec, deliberate:**
- Search matches multiple whitespace-separated terms with AND, and the haystack includes `role`, `location`, and tags. The spec named a narrower substring search; this is a superset at no added complexity.
- The save button is a fixed-position shadow-root pill rather than an element injected into LinkedIn's top card. Same UX, immune to LinkedIn layout changes.
- No `content_scripts.css` entry — styles live in the shadow root, so the manifest and the file count both shrink.
- No extension icons. Chrome's default is fine for a personal tool.
- Task 3 was added: the spec assumed selectors could be written correctly up front, and they cannot be without a real page.
