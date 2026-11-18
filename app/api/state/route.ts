import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { select } from '@/lib/db';
import { getEnv, getProfile, getRoster, boardTickets } from '@/lib/workspace';
import { rankFor } from '@/lib/ranks';
import { BOARD_MIN, BOARD_TARGET } from '@/lib/engine';
import { CATEGORIES } from '@/lib/types';
import { decorate } from '@/lib/modes';
import { BADGES } from '@/lib/badges';
import { EXAM_NOTE, EXAM_TAGS } from '@/lib/concepts';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const [env, profile] = await Promise.all([getEnv(user.id), getProfile(user.id)]);
  const [badgeRows, queue] = await Promise.all([select<Row>('user_badges', { user_id: user.id }, { columns: 'badge_id,earned_at' }), select<Row>('practice_queue', { user_id: user.id, status: 'pending' }, { columns: 'due_at' })]);
  const [roster, board, resolvedAll, ledger] = await Promise.all([
    getRoster(user.id),
    boardTickets(user.id, profile.season_no),
    select<Row>('tickets', { user_id: user.id, status: 'resolved' }, { columns: 'category,points_awarded' }),
    select<Row>('points_ledger', { user_id: user.id }, { columns: 'reason,delta,created_at,ticket_id', order: 'created_at.desc', limit: 8 }),
  ]);
  const skills = Object.fromEntries(CATEGORIES.map((c) => [c, { resolved: 0, points: 0 }]));
  resolvedAll.forEach((t) => { const s = skills[t.category]; if (s) { s.resolved++; s.points += Number(t.points_awarded || 0); } });
  return json({
    profile: { points: profile.points, rank: rankFor(profile.points), streak: profile.streak, season_no: profile.season_no, resolved_total: resolvedAll.length },
    env, roster_count: roster.length, roster: roster.map((r) => ({ full_name: r.full_name, username: r.username, department: r.department, job_title: r.job_title, is_active: r.is_active })),
    tickets: board.open.map(decorate), recent_resolved: board.done.map(decorate), skills, ledger,
    account: { is_anonymous: user.isAnonymous, email: user.email },
    badges: { catalog: BADGES, earned: badgeRows }, practice: { pending: queue.length, due: queue.filter((q) => Date.parse(q.due_at) <= Date.now()).length },
    exam: { tags: EXAM_TAGS, note: EXAM_NOTE },
    board: { min: BOARD_MIN, target: BOARD_TARGET, needs_refill: board.open.length < BOARD_MIN },
  });
});
