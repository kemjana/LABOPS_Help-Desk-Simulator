import { route, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { ensureDebrief, parseDay } from '@/lib/debrief';
import { evaluateBadges } from '@/lib/badges';

export const maxDuration = 45;
// "End my shift": creates (or returns) the debrief for ONE local day. Idempotent: the same day gives the same row.
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 500);
  const { day, tz } = parseDay(b.day, b.tz);
  const r = await ensureDebrief(req, user.id, day, tz, { refresh: b.refresh === true });
  const new_badges = await evaluateBadges(user.id).catch(() => []);
  return json({ debrief: { day, stats: r.row!.stats, narrative: r.row!.narrative }, created: r.created, narrative_error: r.narrative_error ?? null, new_badges });
});
