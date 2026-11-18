import type { Difficulty } from './types';
export const BASE_POINTS: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 40 };
export const FIRST_TRY_BONUS: Record<Difficulty, number> = { easy: 5, medium: 10, hard: 20 };
export const NO_HINT_BONUS: Record<Difficulty, number> = { easy: 3, medium: 5, hard: 10 };
/** Share of base points lost, by the highest hint level used (0 = none). */
export const HINT_PENALTY_PCT = [0, 10, 25, 50];
/** Small extra for doing a ticket in your own real VM (more effort than the pre-built lab). */
export const VM_BONUS: Record<Difficulty, number> = { easy: 3, medium: 5, hard: 10 };
export const TONE_BONUS = 3;
export const SUGGESTED_MINUTES: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 35 };

export interface PointLine { reason: 'base' | 'first_try_bonus' | 'no_hint_bonus' | 'hint_penalty' | 'own_vm_bonus' | 'floor' | 'tone_bonus'; delta: number }

export function computePoints(diff: Difficulty, attemptNo: number, maxHint: number, mode: 'console' | 'vm' = 'console'): PointLine[] {
  const base = BASE_POINTS[diff];
  const lines: PointLine[] = [{ reason: 'base', delta: base }];
  const hint = Math.max(0, Math.min(3, maxHint));
  if (hint > 0) lines.push({ reason: 'hint_penalty', delta: -Math.round((base * HINT_PENALTY_PCT[hint]) / 100) });
  if (attemptNo === 1) lines.push({ reason: 'first_try_bonus', delta: FIRST_TRY_BONUS[diff] });
  if (hint === 0) lines.push({ reason: 'no_hint_bonus', delta: NO_HINT_BONUS[diff] });
  if (mode === 'vm') lines.push({ reason: 'own_vm_bonus', delta: VM_BONUS[diff] });
  return lines;
}
export const sumLines = (l: PointLine[]) => Math.max(1, l.reduce((a, b) => a + b.delta, 0));
