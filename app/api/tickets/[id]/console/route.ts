import { route, json, readJson, HttpError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitConsole } from '@/lib/limits';
import { selectOne, update } from '@/lib/db';
import { getEnv, getRoster, getTicket } from '@/lib/workspace';
import { SCENARIOS, createSession, fillGuide } from '@/lib/sim/scenarios';
import { completionData, prompt, runLine } from '@/lib/sim';
import type { HistoryEntry, Machine, SimState } from '@/lib/sim/types';
import { OPEN_STATUSES, type TicketStatus } from '@/lib/types';
import { simInputs } from '@/lib/modes';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const MACHINES: Machine[] = ['DC01', 'WS01'];

async function load(userId: string, id: string) {
  const t = await getTicket(userId, id);
  if (t.play_mode !== 'console') throw new HttpError(409, 'This ticket is not in pre-built lab mode. Choose "Pre-built lab" first.', 'not_console');
  const sc = SCENARIOS[t.blueprint_id]; if (!sc) throw new HttpError(400, 'No pre-built lab for this ticket.', 'no_console');
  const sess = await selectOne<Row>('console_sessions', { ticket_id: id, user_id: userId });
  if (!sess) throw new HttpError(409, 'The console is not ready. Press "Start" again on the ticket.', 'no_session');
  const sec = await selectOne<Row>('ticket_secrets', { ticket_id: id, user_id: userId }, 'vars');
  return { t, sc, sess, vars: sec!.vars as Row };
}
const view = (t: Row, sc: (typeof SCENARIOS)[string], s: SimState, history: HistoryEntry[], vars: Row, closed: boolean) => {
  const { sv } = { sv: vars };
  return {
    machines: MACHINES, start: sc.start, prompts: { DC01: prompt(s, 'DC01'), WS01: prompt(s, 'WS01') }, history: history.slice(-120),
    guide: sc.guide.map((g) => ({ ...g, why: fillGuide(g.why, sv as never, s), example: fillGuide(g.example, sv as never, s) })),
    completion: { DC01: completionData('DC01'), WS01: completionData('WS01') }, closed, reality: closed ? sc.reality : null,
  };
};

export const GET = route(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const { t, sc, sess, vars } = await load(user.id, id);
  return json(view(t, sc, sess.state as SimState, sess.history as HistoryEntry[], vars, !OPEN_STATUSES.includes(t.status as TicketStatus)));
});

export const POST = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitConsole(req, user.id);
  const b = await readJson(req, 2000);
  const { id } = await ctx.params;
  const { t, sc, sess, vars } = await load(user.id, id);
  if (!OPEN_STATUSES.includes(t.status as TicketStatus)) throw new HttpError(409, 'This ticket is closed.', 'closed');
  if (b.reset === true) {
    const [env, roster] = await Promise.all([getEnv(user.id), getRoster(user.id)]);
    const { base, sv } = simInputs(env, roster, vars);
    const fresh = createSession(t.blueprint_id, base, sv);
    const rows = await update<Row>('console_sessions', { ticket_id: id, user_id: user.id, version: sess.version }, { state: fresh, history: [], version: sess.version + 1, updated_at: new Date().toISOString() });
    if (!rows.length) throw new HttpError(409, 'The console was busy. Try again.', 'busy');
    return json({ ...view(t, sc, fresh, [], vars, false), reset: true });
  }
  const machine = str(b.machine, 4, 4, 'machine') as Machine;
  if (!MACHINES.includes(machine)) throw new HttpError(400, 'Unknown machine.', 'validation');
  const command = str(b.command, 400, 1, 'command');
  const s = sess.state as SimState;
  const r = runLine(s, machine, command);
  const hist = (sess.history as HistoryEntry[]).concat({ m: machine, c: command, o: r.clear ? '' : r.out.slice(0, 3500) }).slice(-250);
  const rows = await update<Row>('console_sessions', { ticket_id: id, user_id: user.id, version: sess.version }, { state: s, history: hist, version: sess.version + 1, updated_at: new Date().toISOString() });
  if (!rows.length) throw new HttpError(409, 'Another command was running. Please run it again.', 'busy'); // ordered saves: never overwrite a newer state
  return json({ out: r.out, error: r.error, clear: r.clear, prompts: { DC01: prompt(s, 'DC01'), WS01: prompt(s, 'WS01') } });
});
