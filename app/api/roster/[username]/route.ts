import { route, json, readJson, HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { select, update } from '@/lib/db';

export const PUT = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 200);
  const { username } = await ctx.params;
  if (typeof b.is_active !== 'boolean') throw new HttpError(400, 'is_active must be true or false.', 'validation');
  const all = await select<Record<string, any>>('lab_directory_users', { user_id: user.id }, { columns: 'username,is_active' }); // eslint-disable-line @typescript-eslint/no-explicit-any
  const me = all.find((r) => r.username === username);
  if (!me) throw new HttpError(404, 'Employee not found.', 'not_found');
  if (!b.is_active && all.filter((r) => r.is_active && r.username !== username).length < 2) throw new HttpError(409, 'Keep at least 2 active employees so tickets can be created.', 'roster');
  await update('lab_directory_users', { user_id: user.id, username }, { is_active: b.is_active });
  return json({ ok: true });
});
