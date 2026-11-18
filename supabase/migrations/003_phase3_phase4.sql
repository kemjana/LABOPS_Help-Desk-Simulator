-- LabOps update 3: daily debrief extras, badges, spaced practice, tone replies, multi-step (checkpoint) tickets.
-- Paste ALL of this into Supabase -> SQL Editor -> New query -> Run (after 001 and 002). Safe to run again.

alter table public.tickets add column if not exists source text not null default 'normal' check (source in ('normal','spaced'));
alter table public.tickets add column if not exists checkpoints_done text[] not null default '{}';
alter table public.ticket_attempts add column if not exists checkpoint text;

create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id),
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- spaced practice queue: SERVER-ONLY (no browser policy)
create table if not exists public.practice_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  blueprint_id text not null,
  concept text not null,
  box int not null default 1,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','served','mastered')),
  last_ticket_id uuid references public.tickets(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, blueprint_id)
);

create table if not exists public.ticket_replies (      -- "reply to the user" tone practice
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ticket_id uuid not null references public.tickets(id),
  attempt_key text not null,
  reply text not null,
  criteria jsonb not null default '[]'::jsonb,
  score numeric not null default 0,
  passed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, attempt_key)
);

alter table public.user_badges enable row level security;
alter table public.practice_queue enable row level security;
alter table public.ticket_replies enable row level security;
revoke all on public.user_badges, public.practice_queue, public.ticket_replies from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['user_badges','ticket_replies'] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "own rows read" on public.%I', t);
    execute format('create policy "own rows read" on public.%I for select to authenticated using (auth.uid() = user_id)', t);
  end loop;
end $$;

drop trigger if exists no_delete_replies on public.ticket_replies;
create trigger no_delete_replies before delete on public.ticket_replies for each row execute function public.forbid_delete();

alter table public.points_ledger drop constraint if exists points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('base','first_try_bonus','no_hint_bonus','hint_penalty','floor','adjustment','own_vm_bonus','tone_bonus'));
