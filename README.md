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

## When LinkedIn breaks the parser

All scraping lives in `src/lib/parse.ts`. It deliberately keys off nothing that LinkedIn's build can rename — their class names are hashed (`_02484ad3`) and change every deploy, and logged-in pages carry no JSON-LD and no `<h1>`. The anchors it does rely on:

| Field | Anchor |
| --- | --- |
| name | `<title>` — `<Name> \| LinkedIn` |
| headline | first top-card line after the name, skipping `· 1st` badges |
| location | the line before `Contact info` |
| company | the line after `Contact info` |
| photo | top-card `img` whose src contains `profile-displayphoto` |
| about | the section headed by an `About` `<h2>` |

If a field goes empty, open a profile and check which anchor moved, then update that one rule and its fixture in `tests/parse.test.ts`.

Known limits: About is lazy-rendered, so it is captured only when that card has rendered, and LinkedIn collapses long About text behind "see more" — you get the visible portion. Re-saving a profile later fills in anything that was missing without touching your notes or tags.
