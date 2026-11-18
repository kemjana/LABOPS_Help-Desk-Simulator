// Spaced practice for weak topics (a simple 3-box schedule: review after 1, 3, then 7 days).
import { insert, select, update } from './db';
import { BLUEPRINTS } from './blueprints';
import { blueprintsWithConcept } from './concepts';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const DAY = 86400000;
const GAPS = [1, 3, 7];
const SKIP = new Set(['lab-proof', 'lab-state']);

export async function scheduleReview(userId: string, concepts: string[], exceptBlueprint: string | null, dueInDays = 1) {
  const existing = await select<Row>('practice_queue', { user_id: userId }, { columns: 'blueprint_id,status' });
  const have = new Set(existing.map((r) => r.blueprint_id));
  if (existing.filter((r) => r.status === 'pending').length >= 12) return 0;
  const rows: Row[] = [];
  for (const c of Array.from(new Set(concepts)).filter((x) => !SKIP.has(x) && !x.startsWith('tone-'))) {
    const pool = blueprintsWithConcept(c).filter((b) => b.id !== exceptBlueprint && !have.has(b.id)).slice(0, 2);
    for (const b of pool) { have.add(b.id); rows.push({ user_id: userId, blueprint_id: b.id, concept: c, box: 1, due_at: new Date(Date.now() + dueInDays * DAY).toISOString() }); }
  }
  if (!rows.length) return 0;
  const r = await insert('practice_queue', rows, { onConflict: 'user_id,blueprint_id', ignoreDuplicates: true });
  return r.length;
}

/** A resolved review ticket moves up a box (or back to box 1 if it needed several tries). */
export async function onResolved(userId: string, blueprintId: string, firstTry: boolean) {
  const [row] = await select<Row>('practice_queue', { user_id: userId, blueprint_id: blueprintId }, { limit: 1 });
  if (!row) return;
  const box = firstTry ? row.box + 1 : 1;
  const patch: Row = box > GAPS.length ? { status: 'mastered', box: GAPS.length } : { status: 'pending', box, due_at: new Date(Date.now() + GAPS[box - 1] * DAY).toISOString() };
  await update('practice_queue', { id: row.id }, { ...patch, updated_at: new Date().toISOString() });
}

/** The most overdue review that can be served now (not on the board, allowed for the lab mode). */
export async function pickDue(userId: string, eligibleIds: Set<string>, onBoard: Set<string>): Promise<{ id: string; blueprint_id: string } | null> {
  const rows = await select<Row>('practice_queue', { user_id: userId, status: 'pending' }, { order: 'due_at.asc' });
  const now = Date.now();
  const hit = rows.find((r) => Date.parse(r.due_at) <= now && eligibleIds.has(r.blueprint_id) && !onBoard.has(r.blueprint_id));
  return hit ? { id: hit.id, blueprint_id: hit.blueprint_id } : null;
}
export const markServed = (queueId: string, ticketId: string) => update('practice_queue', { id: queueId }, { status: 'served', last_ticket_id: ticketId, updated_at: new Date().toISOString() });
/** After "Reset workspace", reviews that were on the old board become available again. */
export const releaseServed = (userId: string) => update('practice_queue', { user_id: userId, status: 'served' }, { status: 'pending', updated_at: new Date().toISOString() });
export const BLUEPRINT_COUNT = BLUEPRINTS.length;
