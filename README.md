# LinkedIn Archive

Save LinkedIn profiles while browsing and organise them with shared notes and tags. A Chrome extension for capturing, a web app for browsing, and Supabase behind both so two people work from one archive.

## Layout

| Path | What |
| --- | --- |
| `extension/` | Chrome MV3 extension: save pill on profile pages, plus a viewer |
| `web/` | Next.js app deployed to Vercel |
| `shared/` | Types and tag helpers used by both |
| `supabase/` | Migrations, RLS policies, behaviour tests |
| `scripts/migrate.mjs` | One-off import of a JSON export from the old local-only version |

## Setup

### 1. Supabase

```bash
supabase start
```

Apply the migrations (`supabase db reset` locally, `supabase db push` for a hosted project), then add your members:

```sql
insert into public.allowed_emails (email) values ('you@example.com'), ('cofounder@example.com');
```

**Membership is the whole security model.** The anon key ships publicly in both clients; RLS is what keeps everyone else out. Anyone can create an account, but a non-member reads and writes nothing.

Verify that before putting real data in:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/behaviour.sql
```

It exits `ALL BEHAVIOUR TESTS PASSED` or raises. The final sections assert that a non-member and an anonymous caller each read zero rows and cannot insert.

For a hosted project, set the **magic link email template** to `supabase/templates/magic_link.html`. The default renders only a link, and the extension signs in with the code. Add your deployed origin plus `/auth/callback` to the Auth redirect URLs.

### 2. Web app

```bash
cd web && cp .env.example .env.local   # fill in URL and anon key
npm run dev -w @archive/web
```

Deploy to Vercel with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 3. Extension

```bash
cd extension && cp .env.example .env   # fill in URL and anon key
npm run build -w @archive/extension
```

Load `extension/dist` at `chrome://extensions` with Developer mode on. The Supabase origin is written into `host_permissions` at build time, so rebuild when you switch projects.

### 4. Import existing data

Export from the old version first, then:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate.mjs export.json --author you@example.com
```

Idempotent. The `service_role` key bypasses RLS — run this locally and never put it in either app.

## Use

- On a `linkedin.com/in/...` page, click the pill to save. Revisiting a saved profile refreshes it automatically; notes and tags are never touched, and the pill flashes "Updated ✓" only on a real change.
- The toolbar icon opens the viewer. The web app is the same archive.
- Notes are an append-only thread. You can edit and delete your own; the database enforces that, not the UI.

## Develop

```bash
npm test          # all workspaces
npm run typecheck
npm run build
```

## When LinkedIn breaks the parser

All scraping is in `extension/src/lib/parse.ts`. It avoids anything LinkedIn's build renames — their class names are hashed and logged-in pages carry no JSON-LD and no `<h1>`. The anchors it uses:

| Field | Anchor |
| --- | --- |
| name | `<title>` — `<Name> \| LinkedIn` |
| headline | first top-card line after the name, skipping `· 1st` badges |
| location | the line before `Contact info` |
| company | the line after `Contact info` |
| photo | top-card `img` whose src contains `profile-displayphoto` |
| about | the section headed by an `About` `<h2>` |

If a field empties out, check which anchor moved and update that rule plus its fixture in `extension/tests/parse.test.ts`.

Known limits: About is lazy-rendered and collapsed behind "see more", so it is captured only when visible. Re-saving fills in what was missing without touching notes or tags.
