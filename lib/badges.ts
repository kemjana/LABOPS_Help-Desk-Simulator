import { insert, select } from './db';
import { cpsFor } from './checkpoints';
import { CATEGORIES } from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const BADGES = [
  { id: 'first_fix', name: 'First fix', desc: 'Resolve your first ticket.', icon: '1' },
  { id: 'ten_fixes', name: 'Ten fixes', desc: 'Resolve 10 tickets.', icon: '10' },
  { id: 'first_try_3', name: 'Clean hands', desc: 'Resolve 3 tickets on the first try.', icon: 'FT' },
  { id: 'no_hints_5', name: 'No training wheels', desc: 'Resolve 5 tickets without any hint.', icon: 'NH' },
  { id: 'hard_hero', name: 'Hard hero', desc: 'Resolve a Tier 3 ticket.', icon: 'T3' },
  { id: 'all_rounder', name: 'All-rounder', desc: 'Resolve at least one ticket in every category.', icon: '5C' },
  { id: 'own_vm', name: 'Real lab', desc: 'Resolve a ticket in your own VM.', icon: 'VM' },
  { id: 'lab_pro', name: 'Console regular', desc: 'Resolve 5 tickets in the pre-built lab.', icon: 'PL' },
  { id: 'streak_3', name: '3-day streak', desc: 'Resolve a ticket 3 days in a row.', icon: '3d' },
  { id: 'streak_7', name: '7-day streak', desc: 'Resolve a ticket 7 days in a row.', icon: '7d' },
  { id: 'points_100', name: '100 points', desc: 'Earn 100 points.', icon: '100' },
  { id: 'points_500', name: '500 points', desc: 'Earn 500 points.', icon: '500' },
  { id: 'tone_pro', name: 'Friendly voice', desc: 'Write 3 good replies to users.', icon: 'RP' },
  { id: 'review_ace', name: 'Review ace', desc: 'Resolve 3 spaced-practice review tickets.', icon: 'SR' },
];

/** Awards any newly earned badges (idempotent) and returns the ids that are new. */
export async function evaluateBadges(userId: string): Promise<string[]> {
  const [tickets, profile, replies] = await Promise.all([
    select<Row>('tickets', { user_id: userId, status: 'resolved' }, { columns: 'category,difficulty,attempts_count,max_hint_level,solved_mode,source,blueprint_id' }),
    select<Row>('profiles', { user_id: userId }, { columns: 'points,streak' }),
    select<Row>('ticket_replies', { user_id: userId, passed: true }, { columns: 'id' }),
  ]);
  const p = profile[0] ?? { points: 0, streak: 0 };
  const firstTry = tickets.filter((t) => t.attempts_count === (cpsFor(t.blueprint_id)?.length ?? 1)).length;
  const cats = new Set(tickets.map((t) => t.category));
  const earned: Record<string, boolean> = {
    first_fix: tickets.length >= 1, ten_fixes: tickets.length >= 10, first_try_3: firstTry >= 3,
    no_hints_5: tickets.filter((t) => t.max_hint_level === 0).length >= 5, hard_hero: tickets.some((t) => t.difficulty === 'hard'),
    all_rounder: CATEGORIES.every((c) => cats.has(c)), own_vm: tickets.some((t) => t.solved_mode === 'vm'),
    lab_pro: tickets.filter((t) => t.solved_mode === 'console').length >= 5, streak_3: p.streak >= 3, streak_7: p.streak >= 7,
    points_100: p.points >= 100, points_500: p.points >= 500, tone_pro: replies.length >= 3, review_ace: tickets.filter((t) => t.source === 'spaced').length >= 3,
  };
  const ids = BADGES.map((b) => b.id).filter((id) => earned[id]);
  if (!ids.length) return [];
  const fresh = await insert<Row>('user_badges', ids.map((badge_id) => ({ user_id: userId, badge_id })), { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
  return fresh.map((r) => r.badge_id as string);
}
