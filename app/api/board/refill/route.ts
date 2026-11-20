import { route, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { select } from '@/lib/db';
import { getEnv, getProfile, getRoster } from '@/lib/workspace';
import { createTicket, BOARD_TARGET } from '@/lib/engine';
import { OPEN_STATUSES } from '@/lib/types';

// Makes at most 2 tickets per request so each request stays well inside Vercel's time limit.
export const maxDuration = 30;
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const body = await readJson(req);
  const fast = body.fast === true; // fast = template wording only (no AI), used as an automatic retry
  const started = Date.now();
  const [env, profile, roster] = await Promise.all([getEnv(user.id), getProfile(user.id), getRoster(user.id)]);
  let created = 0;
  for (let i = 0; i < 2; i++) {
    if (i > 0 && Date.now() - started > 8000) break; // stay far away from the platform time limit
    const open = await select('tickets', { user_id: user.id, season_no: profile.season_no, status: [...OPEN_STATUSES] }, { columns: 'id' });
    if (open.length >= BOARD_TARGET) break;
    const r = await createTicket(req, user.id, env, roster, profile.season_no, !fast);
    if (!r) break;
    created++;
  }
  const open = await select('tickets', { user_id: user.id, season_no: profile.season_no, status: [...OPEN_STATUSES] }, { columns: 'id' });
  return json({ created, open: open.length, target: BOARD_TARGET, done: open.length >= BOARD_TARGET });
});
