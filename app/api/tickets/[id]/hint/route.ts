import { route, json, readJson, HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { insert, selectOne, update } from '@/lib/db';
import { getTicket } from '@/lib/workspace';
import { byId } from '@/lib/blueprints';
import { fill, type Ctx } from '@/lib/lab';
import { HINT_PENALTY_PCT } from '@/lib/points';
import { OPEN_STATUSES, type TicketStatus } from '@/lib/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Hint ladder. Hints are vetted (written by us per blueprint), so they cost no AI quota and never leak the full answer.
export const POST = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req);
  const { id } = await ctx.params;
  const t = await getTicket(user.id, id);
  if (!OPEN_STATUSES.includes(t.status as TicketStatus)) throw new HttpError(409, 'This ticket is already closed.', 'closed');
  const level = Number(b.level);
  if (!Number.isInteger(level) || level < 1 || level > 3) throw new HttpError(400, 'Hint level must be 1, 2 or 3.', 'validation');
  if (level > t.max_hint_level + 1) throw new HttpError(400, `Take hint ${t.max_hint_level + 1} first.`, 'hint_order');
  const bp = byId(t.blueprint_id);
  const sec = await selectOne<Row>('ticket_secrets', { ticket_id: id, user_id: user.id }, 'vars');
  if (!bp || !sec) throw new HttpError(500, 'Hint data is missing for this ticket.', 'no_hint');
  const text = fill(bp.hints[level - 1], sec.vars as Ctx);
  if (level > t.max_hint_level) {
    const moved = await update('tickets', { id, user_id: user.id, max_hint_level: t.max_hint_level }, { max_hint_level: level });
    if (moved.length) await insert('ticket_messages', { user_id: user.id, ticket_id: id, role: 'assistant', kind: 'hint', hint_level: level, content: text });
  }
  return json({ level, hint: text, cost_pct: HINT_PENALTY_PCT[level], max_hint_level: Math.max(level, t.max_hint_level) });
});
