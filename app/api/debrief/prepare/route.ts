import { route, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { ensureDebrief, parseDay, prevDay } from '@/lib/debrief';

export const maxDuration = 45;
// Called when the app opens: prepares YESTERDAY's debrief if there was activity (no background jobs needed).
export const POST = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 500);
  const { day: today, tz } = parseDay(b.today, b.tz);
  const day = prevDay(today);
  const r = await ensureDebrief(req, user.id, day, tz, { onlyIfActive: true });
  return json({ day, ready: !!r.row, created: r.created });
});
