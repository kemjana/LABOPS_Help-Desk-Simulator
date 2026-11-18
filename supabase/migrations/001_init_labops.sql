-- LabOps schema (Phase 1, includes tables for later phases so you only run this once).
-- Paste ALL of this into Supabase -> SQL Editor -> New query -> Run. It is safe to run again.
-- Design rules:
--   * Row Level Security (RLS) is ON for every table.
--   * The browser can only READ its own rows. ALL writes come from server routes (secret key).
--   * Hidden answers live in ticket_secrets / ticket_blueprints, which have NO browser policy at all.
--   * Tickets, attempts, ledger and seasons can never be deleted (a trigger blocks it).

create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id),
  season_no int not null default 1,
  points int not null default 0,
  rank text not null default 'Help Desk Intern',
  streak int not null default 0,
  last_active_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_environments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id),
  lab_name text not null default 'My LabOps Lab',
  domain_name text not null default 'corp.local',
  subnet_cidr text not null default '10.0.10.0/24',
  gateway_ip text not null default '10.0.10.1',
  dc_ip text not null default '10.0.10.10',
  fs_ip text not null default '10.0.10.20',
  lab_mode text not null default 'lightweight' check (lab_mode in ('lightweight','enterprise')),
  setup_completed boolean not null default false,
  setup_progress jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.lab_directory_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  env_id uuid not null references public.lab_environments(id),
  full_name text not null,
  username text not null,
  department text not null,
  job_title text not null default '',
  ou_path text not null default '',
  is_active boolean not null default true,
  unique (env_id, username)
);

create table if not exists public.seasons (
  user_id uuid not null references auth.users(id),
  season_no int not null,
  points_at_end int not null default 0,
  ended_at timestamptz not null default now(),
  primary key (user_id, season_no)
);

create table if not exists public.ticket_blueprints (   -- server-only metadata copy (no browser policy)
  id text primary key,
  category text not null,
  difficulty text not null,
  lab_mode text not null,
  title text not null,
  concepts text[] not null default '{}',
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  env_id uuid not null references public.lab_environments(id),
  season_no int not null default 1,
  ticket_code text not null,
  blueprint_id text not null,
  category text not null check (category in ('AD_ACCOUNTS','GPO','DNS_DHCP','FILE_SHARES','SECURITY')),
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  tier text not null,
  priority text not null check (priority in ('Low','Medium','High','Critical')),
  points int not null,
  suggested_minutes int not null,
  requester_name text not null,
  requester_username text not null,
  department text not null,
  affected_host text not null,
  subject text not null,
  description text not null,
  proof_prompt text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','reopened','resolved','archived')),
  attempts_count int not null default 0,
  max_hint_level int not null default 0 check (max_hint_level between 0 and 3),
  ai_feedback text,
  reopen_message text,
  points_awarded int not null default 0,
  reported boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, ticket_code)
);
create index if not exists tickets_board_idx on public.tickets (user_id, season_no, status);

create table if not exists public.ticket_secrets (       -- HIDDEN answers. No browser policy on purpose.
  ticket_id uuid primary key references public.tickets(id),
  user_id uuid not null references auth.users(id),
  blueprint_id text not null,
  expected_root_cause text not null,
  expected_fix text not null,
  rubric jsonb not null,
  proof_tokens text[] not null default '{}',
  vars jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ticket_id uuid not null references public.tickets(id),
  attempt_no int not null,
  attempt_key text not null,
  root_cause text not null,
  steps text not null,
  proof_value text not null,
  proof_ok boolean not null default false,
  screenshot_path text,
  passed boolean not null default false,
  score numeric not null default 0,
  feedback text not null default '',
  created_at timestamptz not null default now(),
  unique (ticket_id, attempt_no),
  unique (user_id, attempt_key)
);

create table if not exists public.attempt_criteria (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.ticket_attempts(id),
  user_id uuid not null references auth.users(id),
  ticket_id uuid not null references public.tickets(id),
  criterion_id text not null,
  concept text not null,
  met boolean not null,
  quote text not null default '',
  unique (attempt_id, criterion_id)
);
create index if not exists attempt_criteria_user_idx on public.attempt_criteria (user_id, concept);

create table if not exists public.points_ledger (       -- append-only
  id bigserial primary key,
  user_id uuid not null references auth.users(id),
  ticket_id uuid references public.tickets(id),
  attempt_id uuid references public.ticket_attempts(id),
  reason text not null check (reason in ('base','first_try_bonus','no_hint_bonus','hint_penalty','floor','adjustment')),
  delta int not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists points_ledger_user_idx on public.points_ledger (user_id, created_at desc);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ticket_id uuid not null references public.tickets(id),
  role text not null check (role in ('user','assistant')),
  kind text not null default 'chat' check (kind in ('chat','hint')),
  hint_level int,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_idx on public.ticket_messages (ticket_id, created_at);

create table if not exists public.ticket_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ticket_id uuid not null references public.tickets(id),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_debriefs (      -- used from Phase 3
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  local_day date not null,
  stats jsonb not null default '{}'::jsonb,
  narrative jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, local_day)
);

create table if not exists public.rate_limit_hits (
  key text not null,
  bucket text not null,
  count int not null default 0,
  primary key (key, bucket)
);

-- atomic counter used by the server for rate limits
create or replace function public.rl_hit(p_key text, p_bucket text) returns int
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into public.rate_limit_hits as r (key, bucket, count) values (p_key, p_bucket, 1)
  on conflict (key, bucket) do update set count = r.count + 1
  returning r.count into c;
  return c;
end $$;
revoke all on function public.rl_hit(text, text) from public, anon, authenticated;
grant execute on function public.rl_hit(text, text) to service_role;

-- ---------- never delete / append-only ----------
create or replace function public.forbid_delete() returns trigger language plpgsql as $$
begin raise exception 'Deleting from % is not allowed in LabOps (history is kept).', tg_table_name; end $$;
create or replace function public.forbid_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only.', tg_table_name; end $$;

drop trigger if exists no_delete_tickets on public.tickets;
create trigger no_delete_tickets before delete on public.tickets for each row execute function public.forbid_delete();
drop trigger if exists no_delete_attempts on public.ticket_attempts;
create trigger no_delete_attempts before delete on public.ticket_attempts for each row execute function public.forbid_delete();
drop trigger if exists no_delete_criteria on public.attempt_criteria;
create trigger no_delete_criteria before delete on public.attempt_criteria for each row execute function public.forbid_delete();
drop trigger if exists no_delete_seasons on public.seasons;
create trigger no_delete_seasons before delete on public.seasons for each row execute function public.forbid_delete();
drop trigger if exists ledger_append_only on public.points_ledger;
create trigger ledger_append_only before update or delete on public.points_ledger for each row execute function public.forbid_change();

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.lab_environments enable row level security;
alter table public.lab_directory_users enable row level security;
alter table public.seasons enable row level security;
alter table public.ticket_blueprints enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_secrets enable row level security;
alter table public.ticket_attempts enable row level security;
alter table public.attempt_criteria enable row level security;
alter table public.points_ledger enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_reports enable row level security;
alter table public.daily_debriefs enable row level security;
alter table public.rate_limit_hits enable row level security;

-- browsers get NO write rights and no access to hidden tables
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- read-only, own rows only (an anonymous guest is the role "authenticated" with auth.uid() set)
do $$
declare t text;
begin
  foreach t in array array['profiles','lab_environments','lab_directory_users','seasons','tickets','ticket_attempts',
                           'attempt_criteria','points_ledger','ticket_messages','ticket_reports','daily_debriefs'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "own rows read" on public.%I', t);
    execute format('create policy "own rows read" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;
-- ticket_secrets, ticket_blueprints, rate_limit_hits: RLS on, no policy, no grant = invisible to browsers.

create or replace view public.skill_stats with (security_invoker = true) as
  select user_id, category,
         count(*) filter (where status = 'resolved')::int as resolved,
         coalesce(sum(points_awarded) filter (where status = 'resolved'), 0)::int as points
  from public.tickets group by user_id, category;
revoke all on public.skill_stats from anon, authenticated;
grant select on public.skill_stats to authenticated;

-- ---------- private bucket for proof screenshots (used from Phase 2) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 307200, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 307200, allowed_mime_types = array['image/webp'];

drop policy if exists "proofs insert own folder" on storage.objects;
create policy "proofs insert own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "proofs read own folder" on storage.objects;
create policy "proofs read own folder" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
-- no update and no delete policies on purpose.
