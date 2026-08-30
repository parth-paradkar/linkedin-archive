-- Behaviour tests. Run against a Supabase instance with both migrations applied:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/behaviour.sql
--
-- Every assertion raises on failure, so a clean exit means everything passed.
-- The whole file runs in one transaction and rolls back; it leaves no data.

begin;

-- Two fake members and one stranger. auth.users rows are needed because
-- profiles.saved_by and notes.author reference them.
insert into auth.users (id, email, instance_id, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'member-a@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'member-b@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
on conflict (id) do nothing;

insert into public.allowed_emails (email)
values ('member-a@example.com'), ('member-b@example.com')
on conflict do nothing;

-- Act as member A.
create or replace procedure pg_temp.act_as(p_email text, p_uid text)
  language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', p_email, 'sub', p_uid, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end;
$$;

call pg_temp.act_as('member-a@example.com', '11111111-1111-1111-1111-111111111111');

do $$
declare
  v_changed  boolean;
  v_updated  timestamptz;
  v_updated2 timestamptz;
  v_about    text;
  v_tags     text[];
  v_count    integer;
begin
  ---------------------------------------------------------------- upsert_profile

  v_changed := public.upsert_profile(
    'jane', 'https://www.linkedin.com/in/jane', 'Jane Doe',
    'Staff Engineer', 'Acme', '', 'Berlin', 'Systems.', 'https://cdn/jane.jpg');
  if not v_changed then
    raise exception 'FAIL: a first insert must report changed';
  end if;

  select updated_at into v_updated from public.profiles where slug = 'jane';

  -- Rule 2: an identical scrape writes nothing and reports no change.
  v_changed := public.upsert_profile(
    'jane', 'https://www.linkedin.com/in/jane', 'Jane Doe',
    'Staff Engineer', 'Acme', '', 'Berlin', 'Systems.', 'https://cdn/jane.jpg');
  if v_changed then
    raise exception 'FAIL: an unchanged scrape must report no change';
  end if;
  select updated_at into v_updated2 from public.profiles where slug = 'jane';
  if v_updated2 <> v_updated then
    raise exception 'FAIL: an unchanged scrape must not bump updated_at';
  end if;

  -- Rule 1: a field that scraped empty must not wipe stored text.
  v_changed := public.upsert_profile(
    'jane', 'https://www.linkedin.com/in/jane', 'Jane Doe',
    'Staff Engineer', 'Acme', '', 'Berlin', '', 'https://cdn/jane.jpg');
  select about into v_about from public.profiles where slug = 'jane';
  if v_about <> 'Systems.' then
    raise exception 'FAIL: an empty About wiped stored text (got %)', v_about;
  end if;
  if v_changed then
    raise exception 'FAIL: an empty field is not a change';
  end if;

  -- A real change is reported and does bump updated_at.
  v_changed := public.upsert_profile(
    'jane', 'https://www.linkedin.com/in/jane', 'Jane Doe',
    'Founder', 'Acme', '', 'Berlin', 'Systems.', 'https://cdn/jane.jpg');
  if not v_changed then
    raise exception 'FAIL: a changed headline must report changed';
  end if;
  select updated_at into v_updated2 from public.profiles where slug = 'jane';
  if v_updated2 <= v_updated then
    raise exception 'FAIL: a real change must bump updated_at';
  end if;

  -- A missing name falls back to the slug rather than storing nothing.
  perform public.upsert_profile('ghost', 'https://www.linkedin.com/in/ghost',
    '', '', '', '', '', '', '');
  if (select name from public.profiles where slug = 'ghost') <> 'ghost' then
    raise exception 'FAIL: a nameless profile must fall back to its slug';
  end if;

  ---------------------------------------------------------------------- tags

  v_tags := public.add_tag('jane', '  Founders ');
  if v_tags <> array['founders'] then
    raise exception 'FAIL: add_tag must trim and lowercase (got %)', v_tags;
  end if;

  v_tags := public.add_tag('jane', 'founders');
  if array_length(v_tags, 1) <> 1 then
    raise exception 'FAIL: add_tag must be idempotent (got %)', v_tags;
  end if;

  v_tags := public.add_tag('jane', 'berlin');
  if v_tags <> array['founders', 'berlin'] then
    raise exception 'FAIL: add_tag must append in order (got %)', v_tags;
  end if;

  v_tags := public.remove_tag('jane', 'founders');
  if v_tags <> array['berlin'] then
    raise exception 'FAIL: remove_tag must remove only the named tag (got %)', v_tags;
  end if;

  v_tags := public.add_tag('jane', '   ');
  if v_tags is not null and array_length(v_tags, 1) <> 1 then
    raise exception 'FAIL: a blank tag must not be stored (got %)', v_tags;
  end if;

  --------------------------------------------------------------------- notes

  insert into public.notes (slug, body) values ('jane', 'met at the conference');
  select count(*) into v_count from public.notes where slug = 'jane';
  if v_count <> 1 then
    raise exception 'FAIL: expected one note, got %', v_count;
  end if;
  if (select author from public.notes where slug = 'jane')
     <> '11111111-1111-1111-1111-111111111111'::uuid then
    raise exception 'FAIL: a note must be attributed to its writer';
  end if;
end;
$$;

-- Member B may read A's note and add their own, but may not rewrite A's.
call pg_temp.act_as('member-b@example.com', '22222222-2222-2222-2222-222222222222');

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.notes where slug = 'jane';
  if v_count <> 1 then
    raise exception 'FAIL: a member must see another member''s notes';
  end if;

  insert into public.notes (slug, body) values ('jane', 'spoke last week');
  select count(*) into v_count from public.notes where slug = 'jane';
  if v_count <> 2 then
    raise exception 'FAIL: a member must be able to append a note';
  end if;

  -- The note thread is append-only across members.
  update public.notes set body = 'tampered'
   where author = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL: a member rewrote another member''s note';
  end if;

  delete from public.notes where author = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL: a member deleted another member''s note';
  end if;
end;
$$;

------------------------------------------------------------------------------
-- THE SECURITY BOUNDARY. The anon key is public, so this is the only thing
-- keeping a stranger out. If this section ever fails, the archive is exposed.
------------------------------------------------------------------------------

call pg_temp.act_as('stranger@example.com', '33333333-3333-3333-3333-333333333333');

do $$
declare v_count integer;
begin
  if public.is_member() then
    raise exception 'SECURITY FAIL: a non-allowlisted email passed is_member()';
  end if;

  select count(*) into v_count from public.profiles;
  if v_count <> 0 then
    raise exception 'SECURITY FAIL: a stranger read % profile rows', v_count;
  end if;

  select count(*) into v_count from public.notes;
  if v_count <> 0 then
    raise exception 'SECURITY FAIL: a stranger read % note rows', v_count;
  end if;

  select count(*) into v_count from public.allowed_emails;
  if v_count <> 0 then
    raise exception 'SECURITY FAIL: a stranger read the member list';
  end if;

  begin
    insert into public.profiles (slug, url) values ('intruder', 'https://x');
    raise exception 'SECURITY FAIL: a stranger inserted a profile';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.allowed_emails (email) values ('stranger@example.com');
    raise exception 'SECURITY FAIL: a stranger added themselves to the allowlist';
  exception when insufficient_privilege then null;
  end;

  -- upsert_profile is security invoker, so RLS must still stop it.
  begin
    perform public.upsert_profile('intruder2', 'https://x', 'X',
      '', '', '', '', '', '');
    raise exception 'SECURITY FAIL: a stranger wrote through upsert_profile';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;

\echo 'ALL BEHAVIOUR TESTS PASSED'
