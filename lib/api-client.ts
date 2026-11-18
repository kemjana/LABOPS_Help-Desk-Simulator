'use client';
import { ensureSession, sb } from './supabase-browser';

export class ApiError extends Error {
  status: number; code: string; detail?: string;
  constructor(status: number, message: string, code: string, detail?: string) { super(message); this.status = status; this.code = code; this.detail = detail; }
}
export function localDayString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const tzOffset = () => new Date().getTimezoneOffset();

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await ensureSession(false);
    if (!token) throw new ApiError(401, 'No session. Go to the home page and press Launch.', 'no_session');
    let res: Response;
    try {
      res = await fetch(path, {
        method: opts.method || (opts.body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-local-day': localDayString() },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch { throw new ApiError(0, 'Network problem. Check your internet and try again.', 'network'); }
    if (res.status === 401 && attempt === 0) { await sb().auth.refreshSession(); continue; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`, data.code || 'error', data.detail);
    return data as T;
  }
  throw new ApiError(401, 'Your session expired. Go to the home page and press Launch.', 'bad_token');
}
