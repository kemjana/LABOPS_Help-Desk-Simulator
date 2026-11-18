import { route, json, readJson, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { insert, update } from '@/lib/db';
import { getTicket } from '@/lib/workspace';

export const POST = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req);
  const { id } = await ctx.params;
  await getTicket(user.id, id);
  const reason = str(b.reason, 500, 5, 'Reason');
  await insert('ticket_reports', { user_id: user.id, ticket_id: id, reason });
  await update('tickets', { id, user_id: user.id }, { reported: true });
  return json({ ok: true });
});
