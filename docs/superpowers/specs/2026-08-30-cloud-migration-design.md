# LinkedIn Archive — Cloud Migration Design

**Date:** 2026-08-30
**Status:** Approved
**Supersedes storage decisions in:** `2026-08-29-linkedin-archive-design.md`

## Problem

The archive is a single-browser-profile tool backed by `chrome.storage.local`. Two co-founders need one shared archive, reachable without installing the extension.

## Decisions

| Question | Decision |
| --- | --- |
| Notes | Append-only thread of attributed entries per profile. No overwriting. |
| Tags | Shared per profile, edited through targeted add/remove operations. |
| Availability | Online-only. No local cache, no sync engine. |
| Auth | Supabase `signInWithOtp`. Web app follows the emailed link; the extension takes the code from the same email. |
| Access | Email allowlist enforced in RLS. |
| Hosting | Supabase (Postgres, Auth) and Vercel (Next.js web app). |

### Out of scope

- Offline support and background sync.
- Realtime subscriptions. The web app refetches on window focus; that is enough for two people.
- Per-user private notes. Every note is visible to the workspace.
- Public sharing, org accounts, more than a handful of members.

## Architecture

```
Extension (MV3)                     Web app (Vercel, Next.js)
  content script ─┐                   ├─ magic-link sign-in
  viewer page ────┼─→ service worker  ├─ list / search / filter
                  │   (sole Supabase  ├─ note thread
                  │    client, owns   └─ tag editing
                  │    the session)        │
                  └────────┬───────────────┘
                           ▼
                  Supabase (Postgres + Auth + RLS)
```

The service worker remains the only writer in the extension, as it is today. The viewer keeps messaging the worker rather than opening a second Supabase client, so only one client refreshes tokens and there is one session to reason about.

### Repository

npm workspaces:

| Workspace | Contents |
| --- | --- |
| `extension/` | The existing MV3 extension, moved wholesale. |
| `web/` | Next.js App Router app deployed to Vercel. |
| `shared/` | Supabase-generated database types and the pure helpers both apps use. |
| `supabase/` | SQL migrations. Not a workspace. |

`parse.ts` stays in `extension/` — nothing else scrapes. Search moves into Postgres for the web app, so `filter.ts` is not shared either.

## Data model

```sql
profiles (
  slug        text primary key,     -- linkedin.com/in/<slug>
  url         text not null,
  name, headline, company, role, location, about, photo_url  text not null default '',
  tags        text[] not null default '{}',
  saved_by    uuid references auth.users(id),
  saved_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now()
)

notes (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null references profiles(slug) on delete cascade,
  author     uuid not null default auth.uid() references auth.users(id),
  body       text not null,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
)

allowed_emails ( email text primary key )
```

`slug` as the primary key means both members saving the same person converge on one row rather than creating duplicates.

The local `Profile.note` field disappears. The local `savedAt`/`updatedAt` merge helpers (`pickNewer`, `importProfiles`) are replaced by server authority and are deleted.

## Behaviour that must survive the move

Two properties were established by earlier debugging and must be preserved. Both move into the database.

1. **An empty scrape must not overwrite stored data.** LinkedIn lazy-renders the About card, so a revisit frequently scrapes it blank. Implemented as `coalesce(nullif(excluded.col, ''), profiles.col)` inside `upsert_profile`.
2. **A revisit that changes nothing must not bump `updated_at`.** Implemented as a `WHERE profiles IS DISTINCT FROM excluded` guard on the `DO UPDATE`, and reported back so the extension only flashes "Updated" on a real change.

### Tag concurrency

Writing the whole `tags` array back would let two simultaneous editors clobber each other — the problem the note thread exists to avoid. Tags are therefore changed through `add_tag(slug, tag)` and `remove_tag(slug, tag)`, which use `array_append` and `array_remove` against the current row.

## Security

The Supabase anon key is embedded in both the extension and the browser bundle. This is expected, and safe only because RLS is the entire boundary.

- Every table has RLS enabled and every policy requires `is_member()`, which checks the caller's JWT email against `allowed_emails`.
- `is_member()` is `security definer` with a pinned `search_path`.
- `allowed_emails` is readable only by members and writable through no API path. Members are added with the SQL editor.
- Signing up is not prevented, but a non-allowlisted account can read and write nothing.
- The `service_role` key is used only by the local migration script and never appears in either app or in the repository.

## Auth flow

`signInWithOtp({ email })` sends one email containing both a link and a code. The web app consumes the link through the standard callback route. The extension asks for the code and calls `verifyOtp`, which avoids redirect handling inside the extension entirely.

The extension persists its session with a `chrome.storage.local`-backed storage adapter, since the service worker has no `localStorage`.

## Migration

A one-off Node script reads a JSON export produced by the current viewer and writes it to Supabase with the `service_role` key. The existing `note` string on each record becomes the first entry in that profile's note thread, attributed to whichever member the script is told to credit.

## Error handling

Network and auth failures surface as visible messages, never silent no-ops. In the extension the pill shows a failed state; in the web app failures appear inline. A signed-out extension shows a sign-in prompt in place of the save pill rather than failing on click.

## Testing

- Pure logic (`parse`, `filter`, rendering) keeps its existing Vitest coverage.
- Database behaviour is tested with SQL assertions run against a local Supabase instance: the coalesce rule, the no-op-write rule, tag add/remove, and that a non-allowlisted user is denied on every table.
- The RLS denial test is required, not optional. It is the security boundary.
