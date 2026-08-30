# Cloud Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the archive to Supabase + Vercel so two members share one archive, with an attributed note thread per profile.

**Architecture:** Postgres holds profiles, notes and the member allowlist; RLS is the only security boundary. The extension's service worker stays the sole Supabase client on that side. A Next.js app on Vercel is the second surface.

**Tech Stack:** Supabase (Postgres, Auth), `@supabase/supabase-js`, Next.js App Router, Vercel, npm workspaces, Vitest.

## Global Constraints

- RLS enabled on every table; every policy gates on `is_member()`. A missing policy is a security defect, not a style issue.
- `service_role` key never appears in `extension/`, `web/`, or any committed file. Only `scripts/migrate.mjs` uses it, read from the environment.
- Preserve two behaviours from the local version: an empty scraped field must not overwrite stored text, and a scrape identical to what is stored must not bump `updated_at`.
- Tags are changed only through `add_tag` / `remove_tag`, never by writing the whole array.
- Notes are append-only and attributed. Nothing overwrites another member's note.
- Existing Vitest suites must keep passing throughout.

## Steps requiring your Supabase/Vercel accounts

These cannot be done for you and gate the tasks that follow:

1. Create the Supabase project; record project ref, URL, anon key.
2. Run the migrations (`supabase db push`, or paste into the SQL editor).
3. Insert the two member emails into `allowed_emails`.
4. Create the Vercel project and set its environment variables.

---

### Task 1: Restructure into workspaces

**Files:** `package.json` (root), move all existing source into `extension/`, add `shared/`.

- [ ] Move `src/`, `tests/`, `manifest.config.ts`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json` into `extension/`, preserving git history with `git mv`.
- [ ] Root `package.json` gets `"workspaces": ["extension", "web", "shared"]` and scripts that fan out (`npm test -ws --if-present`).
- [ ] Verify: `npm install && npm test -ws --if-present && npm run build -w extension` all succeed, 70 tests still pass.
- [ ] Commit.

### Task 2: Database schema

**Files:** `supabase/migrations/0001_init.sql`

- [ ] Create `profiles`, `notes`, `allowed_emails` exactly as the spec defines.
- [ ] Add `is_member()`:

```sql
create function public.is_member() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
```

- [ ] Enable RLS on all three tables. Policies: members may select/insert/update/delete `profiles` and `notes`; members may only select `allowed_emails`; no policy grants insert/update/delete on `allowed_emails`.
- [ ] Restrict note mutation to its author: `update`/`delete` on `notes` require `author = auth.uid()` in addition to `is_member()`.
- [ ] Index `notes(slug, created_at)` and a GIN index on `profiles(tags)`.
- [ ] Verify by applying to a local Supabase instance without error.
- [ ] Commit.

### Task 3: Upsert and tag functions

**Files:** `supabase/migrations/0002_functions.sql`

- [ ] `upsert_profile(p_slug, p_url, p_name, p_headline, p_company, p_role, p_location, p_about, p_photo_url)` returning `boolean` (whether anything changed). Insert-or-update where every text column resolves as `coalesce(nullif(excluded.col, ''), profiles.col)`, with the update guarded so an identical row is not rewritten and `updated_at` is not bumped.
- [ ] `add_tag(p_slug, p_tag)` and `remove_tag(p_slug, p_tag)` using `array_append` / `array_remove`, normalising the tag to lowercase and trimmed.
- [ ] All three are `security invoker` so RLS still applies to the caller.
- [ ] Commit.

### Task 4: Database behaviour tests

**Files:** `supabase/tests/behaviour.sql`

- [ ] Assert an empty `p_about` leaves stored About intact.
- [ ] Assert an identical upsert returns false and leaves `updated_at` unchanged.
- [ ] Assert a changed field returns true and does bump `updated_at`.
- [ ] Assert `add_tag` is idempotent and `remove_tag` removes only the named tag.
- [ ] Assert a JWT whose email is absent from `allowed_emails` can read zero rows from `profiles`, `notes`, and `allowed_emails`, and cannot insert. **This test is required.**
- [ ] Verify: run against local Supabase; every assertion passes.
- [ ] Commit.

### Task 5: Shared types

**Files:** `shared/package.json`, `shared/src/database.types.ts`, `shared/src/index.ts`

- [ ] Generate types with `supabase gen types typescript --local > shared/src/database.types.ts`.
- [ ] Export a hand-written `Profile` and `NoteEntry` view-model derived from the generated row types, so both apps agree on shape.
- [ ] Commit.

### Task 6: Migration script

**Files:** `scripts/migrate.mjs`

- [ ] Read a JSON export (the current viewer's format) and a `--author <email>` argument.
- [ ] Upsert each profile; insert each non-empty `note` as the first thread entry attributed to that author's user id.
- [ ] Idempotent: running twice must not duplicate notes. Key on `(slug, body, author)`.
- [ ] Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment; refuses to run if either is missing. Never hardcode them.
- [ ] Verify: export from the current extension, run against local Supabase, confirm counts and one spot-checked note.
- [ ] Commit.

### Task 7: Web app — auth

**Files:** `web/` (Next.js App Router), `web/app/login/page.tsx`, `web/app/auth/callback/route.ts`, `web/lib/supabase/{client,server}.ts`

- [ ] Scaffold Next.js with TypeScript and the App Router.
- [ ] Magic-link sign-in form calling `signInWithOtp`.
- [ ] Callback route exchanging the code for a session.
- [ ] Middleware redirecting unauthenticated users to `/login`.
- [ ] A signed-in but non-allowlisted user sees a plain "no access" page rather than an empty archive.
- [ ] Verify: sign in with an allowlisted address, then with a non-allowlisted one, and confirm both outcomes.
- [ ] Commit.

### Task 8: Web app — archive list

**Files:** `web/app/page.tsx`, `web/components/*`

- [ ] Server-rendered list of profiles, newest `saved_at` first.
- [ ] Search across name, headline, company and location in Postgres (`ilike`, or a generated `tsvector` column if it proves slow).
- [ ] Tag filter with AND semantics using `tags @> array[...]`.
- [ ] Refetch on window focus.
- [ ] Verify against migrated data.
- [ ] Commit.

### Task 9: Web app — profile detail, notes, tags

**Files:** `web/app/p/[slug]/page.tsx`, note and tag components, server actions

- [ ] Detail view with the scraped fields and a link to LinkedIn.
- [ ] Note thread ordered oldest first, each entry showing author email and timestamp; a compose box appends a new entry.
- [ ] Authors may edit and delete their own entries only; the UI must not offer those controls on someone else's.
- [ ] Tag chips reusing the interaction rules already settled in the extension: comma or Enter commits, `×` removes, blur commits pending text. Calls `add_tag` / `remove_tag`.
- [ ] Verify: two browser sessions signed in as different members both see each other's notes.
- [ ] Commit.

### Task 10: Extension — Supabase-backed storage

**Files:** `extension/src/lib/storage.ts` (rewritten), `extension/src/lib/supabase.ts`, `extension/src/lib/messages.ts`, `extension/src/background/background.ts`

- [ ] Supabase client in the service worker with a `chrome.storage.local` storage adapter.
- [ ] Replace `storage.ts` internals with Supabase calls: `saveScraped` calls `upsert_profile` and returns its `changed` result; `allProfiles`, `getProfile`, `deleteProfile` hit the table.
- [ ] Delete `pickNewer`, `importProfiles`, `mergeProfile`, `hasScrapeChanges` and their tests — the server owns that logic now. Keep the tests that assert the *behaviour*, retargeted at the SQL in Task 4.
- [ ] Add `https://<project>.supabase.co/*` to `host_permissions`.
- [ ] Extend the message contract for notes and tags.
- [ ] Commit.

### Task 11: Extension — sign-in and signed-out states

**Files:** `extension/src/viewer/*`, `extension/src/content/content.ts`

- [ ] Viewer shows an email + code sign-in form when there is no session.
- [ ] The save pill shows "Sign in to save" when signed out, opening the viewer instead of attempting a save.
- [ ] Viewer detail panel replaces the single note box with the thread plus a compose box.
- [ ] Verify end-to-end against the browser harness pattern used previously, then in a loaded extension.
- [ ] Commit.

### Task 12: Deploy

- [ ] Deploy `web/` to Vercel with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Add the deployed origin to Supabase Auth redirect URLs.
- [ ] Rebuild the extension against the production project.
- [ ] Verify: both members sign in on the web app and in the extension, save a profile from one and see it from the other.
- [ ] Update `README.md` with setup, environment variables, and how to add a member.
- [ ] Commit.

## Self-Review Notes

- Every spec section maps to a task: schema (2), the two preserved behaviours (3, 4), tag concurrency (3, 9), security (2, 4, 7), auth (7, 11), migration (6), error handling (7, 9, 11), testing (4).
- The RLS denial test in Task 4 is the one step that must not be skipped or deferred.
- Tasks 1–6 need no Vercel account; Tasks 7–12 need the Supabase project to exist.
