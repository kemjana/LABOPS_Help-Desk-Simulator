import { route, json, readJson, HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { update } from '@/lib/db';
import { getEnv } from '@/lib/workspace';

// Saves the 9-step setup checklist. Saves are idempotent (the same step + value can be sent twice).
export const PUT = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 200);
  const step = Number(b.step);
  if (!Number.isInteger(step) || step < 1 || step > 9 || typeof b.done !== 'boolean') throw new HttpError(400, 'step must be 1-9 and done true/false.', 'validation');
  const env = await getEnv(user.id);
  const progress = { ...(env.setup_progress || {}), [String(step)]: b.done };
  const completed = [1, 2, 3, 4, 5, 6, 7, 8, 9].every((n) => progress[String(n)] === true);
  const rows = await update('lab_environments', { user_id: user.id }, { setup_progress: progress, setup_completed: completed });
  return json({ setup_progress: progress, setup_completed: completed, env: rows[0] });
});
