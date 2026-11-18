// Tiny Supabase REST (PostgREST) client for SERVER code only. Uses the secret key.
// The secret key (sb_secret_...) goes ONLY in the "apikey" header. Old JWT keys (eyJ...) also need Authorization.
import { HttpError } from './http';

type Filter = string | number | boolean | null | Array<string | number>;
export type Filters = Record<string, Filter>;

export function sbUrl(): string {
  const u = (process.env.SUPABASE_URL || '').trim();
  if (!u) throw new HttpError(500, 'SUPABASE_URL is missing. Check .env.local, then restart npm run dev.', 'config');
  if (!/^https?:\/\/[^/]+$/.test(u)) throw new HttpError(500, 'SUPABASE_URL must be exactly https://PROJECT-ID.supabase.co with no path or trailing slash.', 'config');
  return u;
}
function secretKey(): string {
  const k = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (!k) throw new HttpError(500, 'SUPABASE_SECRET_KEY is missing. Check .env.local, then restart npm run dev.', 'config');
  return k;
}
export function dbHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`; // legacy JWT-style keys only
  return h;
}
function filterQs(f: Filters): string[] {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v)) parts.push(`${k}=in.(${v.map((x) => encodeURIComponent(String(x))).join(',')})`);
    else if (v === null) parts.push(`${k}=is.null`);
    else parts.push(`${k}=eq.${encodeURIComponent(String(v))}`);
  }
  return parts;
}
async function call(path: string, init: RequestInit & { prefer?: string }): Promise<unknown> {
  const url = `${sbUrl()}${path}`;
  const headers = dbHeaders(secretKey(), init.prefer ? { Prefer: init.prefer } : {});
  let res: Response;
  try { res = await fetch(url, { ...init, headers, cache: 'no-store' }); }
  catch (e) { throw new HttpError(502, 'Could not reach Supabase. Check SUPABASE_URL.', 'db_unreachable', String(e)); }
  const text = await res.text();
  if (!res.ok) {
    let msg = text; try { msg = JSON.parse(text).message || text; } catch { /* keep text */ }
    throw new HttpError(500, `Database error (${res.status}). Did you run the SQL migration?`, 'db_error', `${res.status} ${path.split('?')[0]}: ${msg}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function select<T = Record<string, unknown>>(table: string, f: Filters = {}, o: { columns?: string; order?: string; limit?: number } = {}): Promise<T[]> {
  const qs = [`select=${o.columns || '*'}`, ...filterQs(f)];
  if (o.order) qs.push(`order=${o.order}`);
  if (o.limit) qs.push(`limit=${o.limit}`);
  return (await call(`/rest/v1/${table}?${qs.join('&')}`, { method: 'GET' })) as T[];
}
export async function selectOne<T = Record<string, unknown>>(table: string, f: Filters, columns?: string): Promise<T | null> {
  const rows = await select<T>(table, f, { columns, limit: 1 });
  return rows[0] ?? null;
}
export async function insert<T = Record<string, unknown>>(table: string, rows: object | object[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}): Promise<T[]> {
  const qs = o.onConflict ? `?on_conflict=${o.onConflict}` : '';
  const res = o.onConflict ? (o.ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates') : '';
  const prefer = ['return=representation', res].filter(Boolean).join(',');
  return (await call(`/rest/v1/${table}${qs}`, { method: 'POST', body: JSON.stringify(rows), prefer })) as T[];
}
export async function update<T = Record<string, unknown>>(table: string, f: Filters, patch: object): Promise<T[]> {
  return (await call(`/rest/v1/${table}?${filterQs(f).join('&')}`, { method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=representation' })) as T[];
}
export async function rpc<T = unknown>(fn: string, args: object): Promise<T> {
  return (await call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })) as T;
}
// NOTE: there is intentionally NO delete helper. Tickets, attempts and the points ledger are never deleted.
