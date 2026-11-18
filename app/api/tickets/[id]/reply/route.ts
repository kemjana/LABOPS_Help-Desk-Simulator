import { route, json, readJson, HttpError, str } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitGemini, limitWrites } from '@/lib/limits';
import { insert, select, selectOne } from '@/lib/db';
import { getProfile, getTicket, recomputeProfile } from '@/lib/workspace';
import { gradeTone, TONE_CRITERIA } from '@/lib/tone';
import { TONE_BONUS } from '@/lib/points';
import { evaluateBadges } from '@/lib/badges';
import { humanConcept } from '@/lib/concepts';
import { rankFor } from '@/lib/ranks';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const maxDuration = 45;

// "Reply to the user": optional tone practice after a ticket is resolved. +3 points once per ticket.
export const POST = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 3000);
  const { id } = await ctx.params;
  const key = str(b.attempt_key, 80, 8, 'attempt_key');
  const t = await getTicket(user.id, id);
  if (t.status !== 'resolved') throw new HttpError(409, 'Resolve the ticket first, then reply to the user.', 'not_resolved');
  const prior = await selectOne<Row>('ticket_replies', { user_id: user.id, attempt_key: key });
  const done = (r: Row) => ({ passed: r.passed, met: r.criteria.filter((c: Row) => c.met).length, total: r.criteria.length, review: r.criteria.filter((c: Row) => !c.met).map((c: Row) => humanConcept(c.concept)) });
  if (prior) return json({ ...done(prior), bonus: prior.passed ? TONE_BONUS : 0, replay: true });
  const passedBefore = await select<Row>('ticket_replies', { user_id: user.id, ticket_id: id, passed: true }, { columns: 'id', limit: 1 });
  if (passedBefore.length) throw new HttpError(409, 'You already earned the reply bonus on this ticket.', 'already_done');
  const reply = str(b.reply, 800, 30, 'Reply');
  await limitGemini(req, user.id);
  const g = await gradeTone(t as { subject: string; requester_name: string }, reply);
  const [row] = await insert<Row>('ticket_replies', { user_id: user.id, ticket_id: id, attempt_key: key, reply, criteria: g.results, score: g.met / TONE_CRITERIA.length, passed: g.passed });
  let new_badges: string[] = [];
  if (g.passed) {
    await insert('points_ledger', { user_id: user.id, ticket_id: id, reason: 'tone_bonus', delta: TONE_BONUS, idempotency_key: `${id}:tone` }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
    await getProfile(user.id); const p = await recomputeProfile(user.id); new_badges = await evaluateBadges(user.id).catch(() => []);
    return json({ ...done(row), bonus: TONE_BONUS, new_badges, profile: { points: p.points, rank: rankFor(p.points) } });
  }
  return json({ ...done(row), bonus: 0, new_badges });
});
