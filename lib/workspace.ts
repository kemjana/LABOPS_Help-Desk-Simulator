import { insert, select, selectOne, update } from './db';
import { DEFAULT_LAB, ROSTER_SEED, ouPathFor } from './lab';
import { HttpError } from './http';
import { rankFor } from './ranks';
import { PUBLIC_TICKET_COLUMNS, OPEN_STATUSES, type LabEnv, type RosterUser } from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function ensureWorkspace(userId: string) {
  await insert('profiles', { user_id: userId, season_no: 1 }, { onConflict: 'user_id', ignoreDuplicates: true });
  await insert('lab_environments', { user_id: userId, ...DEFAULT_LAB }, { onConflict: 'user_id', ignoreDuplicates: true });
  const env = await selectOne<LabEnv>('lab_environments', { user_id: userId });
  if (!env) throw new HttpError(500, 'Could not create your lab.', 'bootstrap');
  const have = await select<Row>('lab_directory_users', { user_id: userId }, { columns: 'id', limit: 1 });
  if (!have.length) {
    await insert('lab_directory_users', ROSTER_SEED.map(([full_name, username, department, job_title]) => ({
      user_id: userId, env_id: env.id, full_name, username, department, job_title, ou_path: ouPathFor(env.domain_name, department), is_active: true,
    })), { onConflict: 'env_id,username', ignoreDuplicates: true });
  }
  const profile = await selectOne<Row>('profiles', { user_id: userId });
  return { profile: profile as Row, env };
}

export async function getEnv(userId: string): Promise<LabEnv> {
  const env = await selectOne<LabEnv>('lab_environments', { user_id: userId });
  if (!env) throw new HttpError(409, 'Workspace not started yet. Reload the page.', 'no_workspace');
  return env;
}
export async function getProfile(userId: string): Promise<Row> {
  const p = await selectOne<Row>('profiles', { user_id: userId });
  if (!p) throw new HttpError(409, 'Workspace not started yet. Reload the page.', 'no_workspace');
  return p;
}
export async function getRoster(userId: string): Promise<RosterUser[]> {
  return select<RosterUser>('lab_directory_users', { user_id: userId }, { order: 'full_name.asc' });
}
export async function getTicket(userId: string, id: string): Promise<Row> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, 'Ticket not found.', 'not_found');
  const t = await selectOne<Row>('tickets', { id, user_id: userId });
  if (!t) throw new HttpError(404, 'Ticket not found.', 'not_found');
  return t;
}
export async function publicTicket(userId: string, id: string): Promise<Row> {
  const t = await selectOne<Row>('tickets', { id, user_id: userId }, PUBLIC_TICKET_COLUMNS);
  if (!t) throw new HttpError(404, 'Ticket not found.', 'not_found');
  return t;
}
export async function boardTickets(userId: string, season: number) {
  const open = await select<Row>('tickets', { user_id: userId, season_no: season, status: [...OPEN_STATUSES] }, { columns: PUBLIC_TICKET_COLUMNS, order: 'created_at.asc' });
  const done = await select<Row>('tickets', { user_id: userId, season_no: season, status: 'resolved' }, { columns: PUBLIC_TICKET_COLUMNS, order: 'resolved_at.desc', limit: 15 });
  return { open, done };
}
export async function recomputeProfile(userId: string, patch: Row = {}) {
  const ledger = await select<Row>('points_ledger', { user_id: userId }, { columns: 'delta' });
  const points = ledger.reduce((a, r) => a + Number(r.delta), 0);
  const rank = rankFor(points).name;
  const rows = await update<Row>('profiles', { user_id: userId }, { points, rank, updated_at: new Date().toISOString(), ...patch });
  return rows[0];
}
export function nextStreak(profile: Row, day: string): { streak: number; last_active_day: string } {
  const last: string | null = profile.last_active_day || null;
  if (last === day) return { streak: Math.max(1, profile.streak || 1), last_active_day: day };
  const prev = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  if (last === prev) return { streak: (profile.streak || 0) + 1, last_active_day: day };
  if (last && last > day) return { streak: profile.streak || 1, last_active_day: last }; // clock went backwards: ignore
  return { streak: 1, last_active_day: day };
}
