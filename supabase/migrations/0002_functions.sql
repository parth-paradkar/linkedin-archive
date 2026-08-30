-- Write paths for the extension and web app.
--
-- security invoker throughout: these run as the caller, so RLS still applies.
-- A non-member calling them writes nothing.

-- Store a scrape. Returns true only if something actually changed.
--
-- Two rules carried over from the local version, both learned the hard way:
--
--   1. A field that scraped empty must not overwrite stored text. LinkedIn
--      lazy-renders the About card, so revisits routinely scrape it blank.
--      Hence coalesce(nullif(excluded.col, ''), existing.col) on every column.
--
--   2. A scrape identical to what is stored must not bump updated_at, and must
--      report false so the extension does not flash "Updated" over a no-op.
--      Hence the WHERE guard on DO UPDATE: it suppresses the write entirely,
--      leaving ROW_COUNT at 0.
create function public.upsert_profile(
  p_slug      text,
  p_url       text,
  p_name      text,
  p_headline  text,
  p_company   text,
  p_role      text,
  p_location  text,
  p_about     text,
  p_photo_url text
) returns boolean
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  insert into public.profiles as pr (
    slug, url, name, headline, company, role, location, about, photo_url, saved_by
  ) values (
    p_slug,
    p_url,
    -- The slug is a poor name, but a row must never be unidentifiable.
    coalesce(nullif(p_name, ''), p_slug),
    p_headline, p_company, p_role, p_location, p_about, p_photo_url,
    auth.uid()
  )
  on conflict (slug) do update set
    url        = coalesce(nullif(excluded.url, ''),       pr.url),
    name       = coalesce(nullif(excluded.name, ''),      pr.name),
    headline   = coalesce(nullif(excluded.headline, ''),  pr.headline),
    company    = coalesce(nullif(excluded.company, ''),   pr.company),
    role       = coalesce(nullif(excluded.role, ''),      pr.role),
    location   = coalesce(nullif(excluded.location, ''),  pr.location),
    about      = coalesce(nullif(excluded.about, ''),     pr.about),
    photo_url  = coalesce(nullif(excluded.photo_url, ''), pr.photo_url),
    updated_at = clock_timestamp()
  where (
    pr.url, pr.name, pr.headline, pr.company,
    pr.role, pr.location, pr.about, pr.photo_url
  ) is distinct from (
    coalesce(nullif(excluded.url, ''),       pr.url),
    coalesce(nullif(excluded.name, ''),      pr.name),
    coalesce(nullif(excluded.headline, ''),  pr.headline),
    coalesce(nullif(excluded.company, ''),   pr.company),
    coalesce(nullif(excluded.role, ''),      pr.role),
    coalesce(nullif(excluded.location, ''),  pr.location),
    coalesce(nullif(excluded.about, ''),     pr.about),
    coalesce(nullif(excluded.photo_url, ''), pr.photo_url)
  );

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Tags are shared, so two members editing the same profile must not clobber
-- each other. These change one element against the current row rather than
-- writing back a whole array the caller read some time ago.
create function public.add_tag(p_slug text, p_tag text) returns text[]
  language sql
  security invoker
  set search_path = public, pg_temp
as $$
  update public.profiles
     set tags = case
                  when lower(trim(p_tag)) = any (tags) then tags
                  else array_append(tags, lower(trim(p_tag)))
                end,
         updated_at = clock_timestamp()
   where slug = p_slug
     and trim(p_tag) <> ''
  returning tags;
$$;

create function public.remove_tag(p_slug text, p_tag text) returns text[]
  language sql
  security invoker
  set search_path = public, pg_temp
as $$
  update public.profiles
     set tags = array_remove(tags, lower(trim(p_tag))),
         updated_at = clock_timestamp()
   where slug = p_slug
  returning tags;
$$;
