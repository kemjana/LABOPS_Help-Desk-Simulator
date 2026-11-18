import { route, json, readJson, HttpError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { insert, update } from '@/lib/db';
import { getProfile } from '@/lib/workspace';
import { OPEN_STATUSES } from '@/lib/types';
import { releaseServed } from '@/lib/practice';

// "Reset Workspace" NEVER deletes anything. It archives the unresolved tickets and starts a new season.
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req);
  if (str(b.confirm, 40) !== 'RESET WORKSPACE') throw new HttpError(400, 'Type RESET WORKSPACE exactly to confirm.', 'confirm');
  const profile = await getProfile(user.id);
  const from = Number(b.from_season);
  if (Number.isFinite(from) && from !== profile.season_no) return json({ ok: true, season_no: profile.season_no, already: true });
  const moved = await update('profiles', { user_id: user.id, season_no: profile.season_no }, { season_no: profile.season_no + 1, updated_at: new Date().toISOString() });
  if (!moved.length) return json({ ok: true, season_no: profile.season_no + 1, already: true });
  await insert('seasons', { user_id: user.id, season_no: profile.season_no, points_at_end: profile.points }, { onConflict: 'user_id,season_no', ignoreDuplicates: true });
  await update('tickets', { user_id: user.id, season_no: profile.season_no, status: [...OPEN_STATUSES] }, { status: 'archived' });
  await releaseServed(user.id).catch(() => undefined);
  return json({ ok: true, season_no: profile.season_no + 1 });
});
