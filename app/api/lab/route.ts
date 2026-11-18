import { route, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { update } from '@/lib/db';
import { validateLab } from '@/lib/lab';

export const PUT = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const patch = validateLab(await readJson(req));
  if (!Object.keys(patch).length) return json({ ok: true });
  const rows = await update('lab_environments', { user_id: user.id }, patch);
  return json({ ok: true, env: rows[0] });
});
