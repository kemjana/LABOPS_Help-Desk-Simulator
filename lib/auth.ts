import { HttpError } from './http';
import { sbUrl } from './db';

export interface AuthUser { id: string; token: string; isAnonymous: boolean; email: string | null }

/** Verifies the browser's access token with Supabase Auth. Every write route calls this first. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Please start your workspace first (sign-in missing).', 'no_token');
  const apikey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim();
  let res: Response;
  try {
    res = await fetch(`${sbUrl()}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` }, cache: 'no-store' });
  } catch (e) { throw new HttpError(502, 'Could not reach Supabase Auth.', 'auth_unreachable', String(e)); }
  if (!res.ok) throw new HttpError(401, 'Your session expired. Reload the page to start a new one.', 'bad_token');
  const u = (await res.json()) as { id?: string; is_anonymous?: boolean; email?: string | null };
  if (!u.id) throw new HttpError(401, 'Invalid session.', 'bad_token');
  return { id: u.id, token, isAnonymous: !!u.is_anonymous, email: u.email ?? null };
}
