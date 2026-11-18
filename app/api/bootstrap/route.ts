import { route, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { ensureWorkspace } from '@/lib/workspace';

export const POST = route(async (req) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  await readJson(req);
  const { profile, env } = await ensureWorkspace(user.id);
  return json({ ok: true, season_no: profile.season_no, env_id: env.id });
});
