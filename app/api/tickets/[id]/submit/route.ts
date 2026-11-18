import { route, json, readJson, HttpError, str, localDay } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitGemini, limitWrites } from '@/lib/limits';
import { insert, select, selectOne, update } from '@/lib/db';
import { getProfile, getTicket, recomputeProfile, nextStreak } from '@/lib/workspace';
import { byId, conceptLabel } from '@/lib/blueprints';
import { fill, type Ctx } from '@/lib/lab';
import { decide, gradeWithGemini, proofOk, type CritIn } from '@/lib/grading';
import { computePoints, sumLines } from '@/lib/points';
import { rankFor } from '@/lib/ranks';
import { SCENARIOS } from '@/lib/sim/scenarios';
import { cpsFor } from '@/lib/checkpoints';
import { evaluateBadges } from '@/lib/badges';
import { onResolved, scheduleReview } from '@/lib/practice';
import type { HistoryEntry, SimState, SimVars } from '@/lib/sim/types';
import { OPEN_STATUSES, type TicketStatus } from '@/lib/types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const maxDuration = 45;

// Finalizing is safe to run twice: ledger rows have unique keys and the ticket update is conditional.
async function finalize(userId: string, day: string, ticket: Row, attempt: Row, rows: Row[]) {
  const passed = !!attempt.passed;
  const mode: 'console' | 'vm' = attempt.mode === 'vm' ? 'vm' : 'console';
  const bp = byId(ticket.blueprint_id);
  const cps = cpsFor(ticket.blueprint_id);
  const cp = cps?.find((c) => c.id === attempt.checkpoint) ?? null;
  let doneIds: string[] = ticket.checkpoints_done ?? [];
  if (cps && passed && cp) doneIds = Array.from(new Set([...doneIds, cp.id]));
  const allDone = cps ? cps.every((c) => doneIds.includes(c.id)) : true;
  const resolvedNow = passed && allDone;
  // multi-step tickets: "first try" means no failed checkpoint attempts at all
  const effAttempt = cps ? (attempt.attempt_no === cps.length ? 1 : 2) : attempt.attempt_no;
  const lines = computePoints(ticket.difficulty, effAttempt, ticket.max_hint_level, mode);
  const total = sumLines(lines);
  if (resolvedNow) {
    const raw = lines.reduce((a, l) => a + l.delta, 0);
    const ledgerLines = raw < 1 ? [...lines, { reason: 'floor', delta: 1 - raw }] : lines; // minimum 1 point
    await insert('points_ledger', ledgerLines.map((l) => ({
      user_id: userId, ticket_id: ticket.id, attempt_id: attempt.id, reason: l.reason, delta: l.delta, idempotency_key: `${attempt.id}:${l.reason}`,
    })), { onConflict: 'idempotency_key', ignoreDuplicates: true });
  }
  const failedConcepts = Array.from(new Set(rows.filter((r) => !r.met).map((r) => String(r.concept))));
  const sec = await selectOne<Row>('ticket_secrets', { ticket_id: ticket.id, user_id: userId }, 'vars');
  const extra = attempt.proof_ok ? '' : mode === 'console' ? 'Also: when I look at my computer, the problem is still there.' : 'Also: please paste real output from YOUR lab VM so I can see it is your environment.';
  const baseMsg = cp ? fill(cp.pushback, (sec?.vars ?? {}) as Ctx) : bp && sec ? fill(bp.pushback, sec.vars as Ctx) : 'It is still not working for me.';
  const pushback = passed ? null : [baseMsg, extra].filter(Boolean).join(' ');
  const feedback = passed
    ? (cps && !allDone ? `Checkpoint "${cp?.title}" passed (${doneIds.length} of ${cps.length}). Next step unlocked.` : `All required checks passed (${rows.filter((r) => r.met).length}/${rows.length}). Nice work.`)
    : `${rows.filter((r) => r.met).length} of ${rows.length} checks passed. Review: ${failedConcepts.map(conceptLabel).join(', ')}.`;
  const status = resolvedNow ? 'resolved' : passed ? 'in_progress' : 'reopened';
  const patch: Row = { attempts_count: attempt.attempt_no, status, ai_feedback: feedback, reopen_message: pushback, updated_at: new Date().toISOString() };
  if (cps) patch.checkpoints_done = doneIds;
  if (resolvedNow) { patch.resolved_at = new Date().toISOString(); patch.points_awarded = total; patch.solved_mode = mode; }
  // Ordered save: only apply if the ticket has not already recorded this (or a later) attempt.
  const earlier = Array.from({ length: attempt.attempt_no }, (_, i) => i);
  const moved = await update('tickets', { id: ticket.id, user_id: userId, status: [...OPEN_STATUSES], attempts_count: earlier }, patch);
  if (moved.length && !passed) await scheduleReview(userId, failedConcepts, ticket.blueprint_id).catch(() => 0); // spaced practice for weak topics
  if (moved.length && resolvedNow) await onResolved(userId, ticket.blueprint_id, effAttempt === 1).catch(() => undefined);
  let profile = await getProfile(userId);
  const extraProfile = resolvedNow && moved.length > 0 ? nextStreak(profile, day) : {};
  profile = await recomputeProfile(userId, extraProfile);
  const new_badges = resolvedNow ? await evaluateBadges(userId).catch(() => []) : [];
  return {
    status, passed, resolved: resolvedNow, mode, attempt_no: attempt.attempt_no, feedback, pushback,
    checks: { met: rows.filter((r) => r.met).length, total: rows.length }, review: failedConcepts.map(conceptLabel),
    checkpoint: cps ? { id: cp?.id ?? null, title: cp?.title ?? null, done: doneIds.length, total: cps.length } : null,
    points: resolvedNow ? { total, lines } : null, new_badges,
    profile: { points: profile.points, rank: rankFor(profile.points), streak: profile.streak },
  };
}

export const POST = route(async (req, ctx) => {
  const user = await requireUser(req);
  await limitWrites(req, user.id);
  const b = await readJson(req, 12000);
  const { id } = await ctx.params;
  const key = str(b.attempt_key, 80, 8, 'attempt_key');
  const day = localDay(req, b);
  const ticket = await getTicket(user.id, id);

  // Idempotency: same attempt_key = same attempt, never graded or paid twice.
  const existing = await selectOne<Row>('ticket_attempts', { user_id: user.id, attempt_key: key });
  if (existing) {
    if (existing.ticket_id !== id) throw new HttpError(409, 'That attempt belongs to another ticket.', 'attempt_conflict');
    const rows = await select<Row>('attempt_criteria', { attempt_id: existing.id });
    return json(await finalize(user.id, day, ticket, existing, rows));
  }
  if (!OPEN_STATUSES.includes(ticket.status as TicketStatus)) throw new HttpError(409, 'This ticket is already closed.', 'closed');
  if (ticket.play_mode !== 'console' && ticket.play_mode !== 'vm') throw new HttpError(409, 'First choose how to work this ticket: pre-built lab or your own VM.', 'no_mode');
  const mode = ticket.play_mode as 'console' | 'vm';
  const root = str(b.root_cause, 1500, 15, 'Root cause');
  const sec = await selectOne<Row>('ticket_secrets', { ticket_id: id, user_id: user.id });
  if (!sec) throw new HttpError(500, 'Grading data is missing for this ticket. Please report it.', 'no_secret');
  let criteria = sec.rubric as CritIn[];

  // multi-step (checkpoint) tickets: grade one stage at a time, in order
  const cps = cpsFor(ticket.blueprint_id);
  const next = cps ? cps.find((c) => !(ticket.checkpoints_done ?? []).includes(c.id)) ?? null : null;
  if (cps) {
    if (!next) throw new HttpError(409, 'All checkpoints are already done.', 'closed');
    if (str(b.checkpoint, 10, 1, 'checkpoint') !== next.id) throw new HttpError(409, `Finish checkpoint "${next.title}" first.`, 'checkpoint_order');
    criteria = criteria.filter((c) => next.criteria.includes(c.id));
  }
  const needsProof = cps ? !!next?.proof : true;

  let steps: string; let evidence: string; let labOk: boolean; let screenshot: string | null = null;
  if (mode === 'console') {
    // The fake lab lives on the server, so the browser cannot claim the problem is fixed.
    const sc = SCENARIOS[ticket.blueprint_id]; const sess = await selectOne<Row>('console_sessions', { ticket_id: id, user_id: user.id });
    if (!sc || !sess) throw new HttpError(409, 'The pre-built lab is not ready. Open the ticket and press Start again.', 'no_session');
    const history = sess.history as HistoryEntry[];
    if (!history.length) throw new HttpError(400, 'Run at least one command in the console first, then submit.', 'no_commands');
    const check = sc.check(sess.state as SimState, sec.vars as SimVars);
    steps = history.map((h) => `[${h.m}] ${h.c}`).join('\n').slice(0, 2500);
    evidence = `Console lab state after the student's commands: ${check.facts.join('; ')}.`; labOk = check.ok;
  } else {
    steps = str(b.steps, 2500, 5, 'Steps taken');
    evidence = str(b.proof_value, 1500, needsProof ? 3 : 0, 'Lab evidence');
    labOk = needsProof ? proofOk(evidence, sec.proof_tokens as string[]) : true;
    if (b.screenshot_path) {
      const p = String(b.screenshot_path);
      if (!new RegExp(`^${user.id}/${id}/[0-9a-f-]{36}\\.webp$`).test(p)) throw new HttpError(400, 'Invalid screenshot reference.', 'validation');
      screenshot = p;
    }
  }
  await limitGemini(req, user.id, 2);
  const results = await gradeWithGemini(ticket, criteria, { root, steps, proof: evidence || '(no evidence for this step)' });
  const verdict = decide(criteria, results, labOk);

  const attemptNo = ticket.attempts_count + 1;
  let attempt: Row;
  try {
    [attempt] = await insert<Row>('ticket_attempts', {
      user_id: user.id, ticket_id: id, attempt_no: attemptNo, attempt_key: key, root_cause: root, steps, proof_value: evidence, proof_ok: labOk,
      screenshot_path: screenshot, mode, checkpoint: next?.id ?? null, passed: verdict.passed, score: verdict.score, feedback: '',
    });
  } catch (e) {
    if (/23505|duplicate/i.test(String((e as HttpError).detail || e))) throw new HttpError(409, 'Another submission for this ticket is being graded. Reload and check the ticket.', 'attempt_conflict');
    throw e;
  }
  const labId = mode === 'console' ? 'lab-state' : 'lab-proof';
  const critRows = [...results.map((r) => ({ criterion_id: r.id, concept: r.concept, met: r.met, quote: r.quote })), ...(needsProof ? [{ criterion_id: labId, concept: labId, met: labOk, quote: '' }] : [])];
  const saved = await insert<Row>('attempt_criteria', critRows.map((r) => ({ ...r, attempt_id: attempt.id, user_id: user.id, ticket_id: id })), { onConflict: 'attempt_id,criterion_id', ignoreDuplicates: true });
  return json(await finalize(user.id, day, ticket, attempt, saved as Row[]));
});
