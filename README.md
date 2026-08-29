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
