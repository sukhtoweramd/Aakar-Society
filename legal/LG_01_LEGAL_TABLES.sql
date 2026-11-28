-- LG_01 (28 Nov 2026) - legal documents and acceptance records: the foundation (PR 1 of the terms / privacy / consent series).
-- Run by hand in the Supabase SQL Editor, AFTER MT_01 - MT_20 (it needs societies, society_memberships, active_society() and is_main_admin()).
-- Try it on the TEST project ("aanganone") first. Safe to run again. It changes NO existing table and NO existing data. Undo: LG_01_UNDO.sql.
-- Then run LG_02_DOCS_SEED.sql (fills the registry), then LG_01_TEST.sql on the test project only (rolled back).
--
-- What it makes
--   public.legal_documents    = the registry of documents (platform table, not society data, so it is not in the society backup, like `societies`):
--                               key, version, status (draft / published / retired), audience (which logins), when it is due, SHA-256 of the text.
--                               A published or retired version can never be edited or deleted: a change is a NEW version.
--   public.legal_acceptances  = who accepted what, per society: society id, login id, login label (email at that time), role, flat, document key,
--                               version, hash, time. Append only: nobody can change or delete a row from the app, and an update is refused for everyone.
--                               NOT in the society backup / restore on purpose: a restore must never wipe evidence (a restored database keeps what was accepted).
--   public.accept_legal_document(key, version)  = the ONLY way an acceptance is recorded: it takes the society and the login from the session
--                               (never from the caller), checks the document is published, the latest version and meant for this login's role.
--   public.my_legal_status()  = what this login still has to accept (used by the first-login screen in a later PR).
--
-- Rules (CLAUDE.md): RLS on, the society wall on legal_acceptances, `revoke all ... from anon`, grants only as needed.
-- Reading acceptances: a login sees its OWN rows; the society owner (is_main_admin()) sees all rows of the society. The product owner login has no
-- membership, so it sees nothing and cannot accept anything. Nobody writes from the app (no insert / update / delete rule, no insert / update / delete grant).

do $$
begin
  if to_regprocedure('public.active_society()') is null or to_regprocedure('public.is_main_admin()') is null or to_regclass('public.societies') is null then
    raise exception 'Run the multi-tenant scripts first (MT_01 - MT_20): active_society(), is_main_admin() or societies is missing.';
  end if;
end $$;

-- 1. The registry ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.legal_documents (
  doc_key     text        not null,
  version     integer     not null check (version >= 1),
  status      text        not null check (status in ('draft', 'published', 'retired')),
  title       text        not null,
  audience    text[]      not null check (cardinality(audience) > 0 and audience <@ array['society_admin', 'committee', 'flat', 'tenant']::text[]),
  required_at text        not null check (required_at in ('first_login', 'onboarding')),
  sha256      text        not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now(),
  primary key (doc_key, version)
);

create or replace function public.legal_documents_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'A published document version cannot be deleted.'; end if;
    return old;
  end if;
  if old.status in ('published', 'retired') then
    if new.doc_key is distinct from old.doc_key or new.version is distinct from old.version or new.title is distinct from old.title
       or new.audience is distinct from old.audience or new.required_at is distinct from old.required_at or new.sha256 is distinct from old.sha256 then
      raise exception 'A published document version is never edited: add a new version instead.';
    end if;
    if old.status = 'retired' and new.status <> 'retired' then raise exception 'A retired document version cannot be published again.'; end if;
    if new.status = 'draft' then raise exception 'A published document version cannot go back to draft.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists legal_documents_guard on public.legal_documents;
create trigger legal_documents_guard before update or delete on public.legal_documents for each row execute function public.legal_documents_guard();

alter table public.legal_documents enable row level security;
drop policy if exists legal_documents_read on public.legal_documents;
create policy legal_documents_read on public.legal_documents for select to authenticated using (status in ('published', 'retired'));   -- drafts stay hidden from every login

revoke all on public.legal_documents from anon;
grant select on public.legal_documents to authenticated;
grant select, insert, update, delete on public.legal_documents to service_role;

-- 2. The acceptance records -----------------------------------------------------------------------------------------------------------
create table if not exists public.legal_acceptances (
  id          uuid        primary key default gen_random_uuid(),
  society_id  uuid        not null default public.active_society() references public.societies(id),
  user_id     uuid        not null default auth.uid(),            -- no foreign key on purpose: the record outlives a deleted login
  login_label text,                                               -- the login's email when it accepted (flat logins look like a101@flats...)
  role        text        not null check (role in ('society_admin', 'committee', 'flat', 'tenant')),
  flat_id     text,
  doc_key     text        not null,
  version     integer     not null,
  doc_sha256  text        not null,
  accepted_at timestamptz not null default now(),
  method      text        not null default 'tick' check (method in ('tick')),
  foreign key (doc_key, version) references public.legal_documents (doc_key, version),
  unique (society_id, user_id, doc_key, version)
);
create index if not exists legal_acceptances_society_user_idx on public.legal_acceptances (society_id, user_id);

create or replace function public.legal_acceptances_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then raise exception 'An acceptance record is never changed.'; end if;
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then raise exception 'An acceptance record cannot be deleted from the app.'; end if;
  return old;
end $$;
drop trigger if exists legal_acceptances_guard on public.legal_acceptances;
create trigger legal_acceptances_guard before update or delete on public.legal_acceptances for each row execute function public.legal_acceptances_guard();

alter table public.legal_acceptances enable row level security;
drop policy if exists society_wall on public.legal_acceptances;
create policy society_wall on public.legal_acceptances as restrictive for all to authenticated
  using (society_id = (select public.active_society())) with check (society_id = (select public.active_society()));
drop policy if exists legal_acceptances_read on public.legal_acceptances;
create policy legal_acceptances_read on public.legal_acceptances for select to authenticated
  using (user_id = auth.uid() or (select public.is_main_admin()));

revoke all on public.legal_acceptances from anon;
revoke all on public.legal_acceptances from authenticated;
grant select on public.legal_acceptances to authenticated;                                  -- read only: rows are written by accept_legal_document()
grant select, insert, update, delete on public.legal_acceptances to service_role;

-- 3. Recording an acceptance (the only way) --------------------------------------------------------------------------------------------
create or replace function public.accept_legal_document(p_doc_key text, p_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_soc  uuid := (select public.active_society());
  v_role text;
  v_flat text;
  d      public.legal_documents;
  a      public.legal_acceptances;
begin
  if auth.uid() is null or v_soc is null then raise exception 'You are not signed in to a society.'; end if;
  select m.role, m.flat_id into v_role, v_flat from public.society_memberships m where m.user_id = auth.uid() and m.society_id = v_soc;
  if v_role is null then raise exception 'You are not signed in to a society.'; end if;

  select * into d from public.legal_documents x where x.doc_key = p_doc_key and x.version = p_version;
  if not found then raise exception 'Unknown document or version.'; end if;
  if d.status <> 'published' then raise exception 'This document is not published yet.'; end if;
  if not (v_role = any (d.audience)) then raise exception 'This document is not meant for your login.'; end if;
  if p_version <> (select max(x.version) from public.legal_documents x where x.doc_key = p_doc_key and x.status = 'published') then
    raise exception 'A newer version of this document exists. Please read the new version.';
  end if;

  insert into public.legal_acceptances (society_id, user_id, login_label, role, flat_id, doc_key, version, doc_sha256)
  values (v_soc, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()), v_role, v_flat, d.doc_key, d.version, d.sha256)
  on conflict (society_id, user_id, doc_key, version) do nothing;

  select * into a from public.legal_acceptances x where x.society_id = v_soc and x.user_id = auth.uid() and x.doc_key = d.doc_key and x.version = d.version;
  return jsonb_build_object('doc_key', a.doc_key, 'version', a.version, 'accepted_at', a.accepted_at);
end $$;
revoke all on function public.accept_legal_document(text, integer) from public, anon;
grant execute on function public.accept_legal_document(text, integer) to authenticated, service_role;

-- 4. What this login still has to accept -----------------------------------------------------------------------------------------------
create or replace function public.my_legal_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_soc  uuid := (select public.active_society());
  v_role text;
begin
  if auth.uid() is null or v_soc is null then return '[]'::jsonb; end if;
  select m.role into v_role from public.society_memberships m where m.user_id = auth.uid() and m.society_id = v_soc;
  if v_role is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('doc_key', d.doc_key, 'version', d.version, 'title', d.title, 'required_at', d.required_at,
                                        'accepted', a.id is not null, 'accepted_at', a.accepted_at) order by d.doc_key)
      from public.legal_documents d
      left join public.legal_acceptances a
             on a.society_id = v_soc and a.user_id = auth.uid() and a.doc_key = d.doc_key and a.version = d.version
     where d.status = 'published' and v_role = any (d.audience)
       and d.version = (select max(x.version) from public.legal_documents x where x.doc_key = d.doc_key and x.status = 'published')
  ), '[]'::jsonb);
end $$;
revoke all on function public.my_legal_status() from public, anon;
grant execute on function public.my_legal_status() to authenticated, service_role;

-- 5. Check. Expect: both tables exist with RLS on; anon can read neither; authenticated can only select; the wall is restrictive;
--    the three functions exist and anon cannot run them. (legal_documents is empty until LG_02_DOCS_SEED.sql is run.)
select 'tables exist (expect 2)' as what, count(*)::text as value from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('legal_documents', 'legal_acceptances')
union all select 'RLS on both (expect 2)', count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('legal_documents', 'legal_acceptances') and c.relrowsecurity
union all select 'anon can read either? (expect false)', (has_table_privilege('anon', 'public.legal_documents', 'select') or has_table_privilege('anon', 'public.legal_acceptances', 'select'))::text
union all select 'authenticated can write acceptances? (expect false)', (has_table_privilege('authenticated', 'public.legal_acceptances', 'insert') or has_table_privilege('authenticated', 'public.legal_acceptances', 'update') or has_table_privilege('authenticated', 'public.legal_acceptances', 'delete'))::text
union all select 'society wall is restrictive (expect true)', coalesce((select (not p.permissive)::text from pg_policies p where p.schemaname = 'public' and p.tablename = 'legal_acceptances' and p.policyname = 'society_wall'), 'MISSING')
union all select 'functions exist (expect 3)', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('accept_legal_document', 'my_legal_status', 'legal_documents_guard'))
union all select 'anon can run accept_legal_document? (expect false)', has_function_privilege('anon', 'public.accept_legal_document(text, integer)', 'execute')::text;
