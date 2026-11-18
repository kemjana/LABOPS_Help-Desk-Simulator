-- LabOps update 2: per-ticket mode (pre-built lab console OR your own VM), console sessions, VM bonus points.
-- Paste ALL of this into Supabase -> SQL Editor -> New query -> Run (after 001). Safe to run again.

alter table public.tickets add column if not exists play_mode text check (play_mode in ('console','vm'));
alter table public.tickets add column if not exists solved_mode text check (solved_mode in ('console','vm'));
alter table public.ticket_attempts add column if not exists mode text not null default 'vm' check (mode in ('console','vm'));

-- Practice Console state lives on the SERVER only (no browser policy), so a guest cannot edit the fake lab to "fix" a ticket.
create table if not exists public.console_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  ticket_id uuid not null unique references public.tickets(id),
  state jsonb not null,
  history jsonb not null default '[]'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.console_sessions enable row level security;
revoke all on public.console_sessions from anon, authenticated;

-- allow the extra bonus for doing a ticket in your own VM
alter table public.points_ledger drop constraint if exists points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('base','first_try_bonus','no_hint_bonus','hint_penalty','floor','adjustment','own_vm_bonus'));
