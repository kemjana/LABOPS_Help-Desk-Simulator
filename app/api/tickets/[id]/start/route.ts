import { route, json, readJson, HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitWrites } from '@/lib/limits';
import { insert, selectOne, update } from '@/lib/db';
import { getEnv, getRoster, getTicket, publicTicket } from '@/lib/workspace';
import { decorate, simInputs } from '@/lib/modes';
import { CONSOLE_READY, createSession } from '@/lib/sim/scenarios';
import { OPEN_STATUSES, type TicketStatus } from '@/lib/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// "Accepting" a ticket = choosing HOW to work it: the pre-built lab (console) or your own VM.
export const POST = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req);
  const { id } = await ctx.params;
  const t = await getTicket(user.id, id);
  if (!OPEN_STATUSES.includes(t.status as TicketStatus)) throw new HttpError(409, 'This ticket is already closed.', 'closed');
  const mode = b.mode === 'console' || b.mode === 'vm' ? (b.mode as 'console' | 'vm') : null;
  if (!mode) throw new HttpError(400, 'Choose how you want to work this ticket: pre-built lab or your own VM.', 'validation');
  if (t.play_mode && t.play_mode !== mode && t.attempts_count > 0) throw new HttpError(409, 'You already submitted an answer, so the mode is locked for this ticket.', 'mode_locked');
  if (mode === 'console' && !CONSOLE_READY.has(t.blueprint_id)) throw new HttpError(400, 'The pre-built lab is not available for this ticket yet. Choose My own VM.', 'no_console');
  if (mode === 'console') {
    const sec = await selectOne<Row>('ticket_secrets', { ticket_id: id, user_id: user.id }, 'vars');
    if (!sec) throw new HttpError(500, 'Ticket data is missing. Please report this ticket.', 'no_secret');
    const [env, roster] = await Promise.all([getEnv(user.id), getRoster(user.id)]);
    const { base, sv } = simInputs(env, roster, sec.vars);
    const state = createSession(t.blueprint_id, base, sv);
    await insert('console_sessions', { user_id: user.id, ticket_id: id, state, history: [] }, { onConflict: 'ticket_id', ignoreDuplicates: true });
  }
  const patch: Row = { play_mode: mode, updated_at: new Date().toISOString() };
  if (t.status === 'open') patch.status = 'in_progress';
  if (!t.started_at) patch.started_at = new Date().toISOString();
  await update('tickets', { id, user_id: user.id, status: [...OPEN_STATUSES] }, patch);
  return json({ ticket: decorate(await publicTicket(user.id, id)) });
});
