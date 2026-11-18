import { route, readJson, HttpError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { getEnv, getRoster } from '@/lib/workspace';
import { rosterScript } from '@/lib/scripts';
import { NextResponse } from 'next/server';

// The lab-only password is used to build the script and is NOT stored or logged anywhere.
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 500);
  const pw = str(b.password, 64, 8, 'Password');
  if (!/^[A-Za-z0-9!@#%^&*()_+=.,?-]+$/.test(pw)) throw new HttpError(400, 'Use only letters, numbers and these symbols: ! @ # % ^ & * ( ) _ + = . , ? -', 'validation');
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length < 3) throw new HttpError(400, 'Use at least 3 of: lowercase, uppercase, number, symbol (Windows password rules).', 'validation');
  const [env, roster] = await Promise.all([getEnv(user.id), getRoster(user.id)]);
  const dn = env.domain_name.split('.').map((p) => `DC=${p}`).join(',');
  const body = rosterScript(env.domain_name, dn, roster, pw);
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="Sync-LabRoster.ps1"' } });
});
