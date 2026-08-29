# LinkedIn Archive — Design

**Date:** 2026-08-29
**Status:** Approved

## Problem

Save LinkedIn profiles while browsing, then organise them with notes and tags and find them again later.

## Scope

A Chrome MV3 extension with no backend. Two surfaces:

1. A save button injected on LinkedIn profile pages.
2. A viewer page (an extension page opened in a tab) that lists, searches, and filters saved profiles and edits their notes and tags.

Data lives in `chrome.storage.local`, scoped to one browser profile. There is no server, no account, and no sync. JSON export and import cover backup and moving between machines.

### Out of scope

- Lists and folders. Tags cover grouping.
- Experience and education scraping. Core fields only.
- Auto-save on page visit. Saving is always an explicit click.
- Multi-device sync, Firefox support, team sharing.

## Architecture

Vite plus `@crxjs/vite-plugin` builds the MV3 bundle. TypeScript throughout, no UI framework.

| Part | Responsibility |
| --- | --- |
| Content script | Runs on `linkedin.com/in/*`. Scrapes core fields. Injects the save button and the already-saved badge. |
| Background service worker | Owns every storage write. Handles the `saveProfile`, `isSaved`, and `openViewer` messages. |
| Storage module | Wraps `chrome.storage.local`. Shared by the worker and the viewer. |
| Viewer page | Lists profiles, searches, filters by tag, edits notes and tags, exports and imports JSON. |

Writes are funnelled through the background worker so the content script and the viewer cannot interleave read-modify-write cycles on the same record.

### Why `chrome.storage.local` and not IndexedDB

A personal collection runs to hundreds or low thousands of records. That whole set loads into memory quickly enough to search on every keystroke, which removes the need for an index. `chrome.storage.local` with the `unlimitedStorage` permission gives a simple key-value API and survives extension updates.

**Ceiling:** whole-collection loads become slow somewhere in the tens of thousands of records. The upgrade path is IndexedDB behind the same storage module interface.

## Data model

One record per profile, keyed by the URL slug from `/in/<slug>`.

```ts
type Profile = {
  slug: string;        // "parthparadkar" — primary key
  url: string;         // canonical https://www.linkedin.com/in/<slug>
  name: string;        // falls back to slug when scraping fails
  headline: string;
  company: string;
  role: string;
  location: string;
  about: string;
  photoUrl: string;    // LinkedIn CDN URL, not image bytes
  savedAt: string;     // ISO 8601
  updatedAt: string;   // ISO 8601, bumped on note or tag edit
  tags: string[];
  note: string;        // plain text
};
```

Storage layout: one `chrome.storage.local` key per profile, `profile:<slug>`. Per-key writes keep an edit from rewriting the whole collection.

The scrape is a single snapshot taken at save time. Nothing re-syncs. Saving an already-saved profile refreshes the scraped fields and preserves `note`, `tags`, and `savedAt`.

**Ceiling:** `photoUrl` points at the LinkedIn CDN, and those URLs expire. The upgrade path is to fetch the image at save time and store it as a data URL.

## Flows

### Saving

1. The content script reads the slug from the URL.
2. It sends `isSaved` to the worker.
3. Not saved: it renders a "Save to Archive" button. Already saved: it renders a "Saved ✓ · Open note" badge that opens the viewer focused on that record.
4. On click it runs `parseProfile(document)`, sends the result as `saveProfile`, and the worker merges and writes.
5. The button flips to the saved state.

LinkedIn renders profiles client-side and swaps content on in-page navigation, so the content script watches for URL changes and re-runs the check rather than relying on initial load alone.

### Viewing

The viewer loads every record once on open and renders the list. Search filters in memory on each keystroke. Tag filters come from a sidebar; selecting several tags requires a profile to carry all of them. Editing a note or tag writes that one record back immediately and bumps `updatedAt`.

### Backup

Export downloads the full collection as JSON. Import reads a JSON file and merges by slug, where the higher `updatedAt` wins. Since there is no server, this is the only recovery path and ships in the first version.

## Error handling

`parseProfile` never throws. Each field is read independently and missing fields become empty strings. A missing name falls back to the slug, so a record is always identifiable.

Storage write failures surface as a toast in whichever surface triggered them.

LinkedIn markup changes are the main fragility. Every selector lives in `parseProfile`, so a break is a one-file fix.

## Permissions

`storage`, `unlimitedStorage`, and host access to `*://*.linkedin.com/*`. Opening the extension's own viewer page needs no `tabs` permission.

## Testing

Two pure functions carry the logic worth testing, both under Vitest:

- `parseProfile(document)` against a saved LinkedIn profile HTML fixture, plus a stripped fixture that asserts graceful degradation.
- `filterProfiles(records, query, tags)` against a fixed record array, covering search, tag AND logic, and their combination.

Message passing and storage wiring are verified by hand against a real profile page.
