import type { PublicTicket, LabEnv } from '@/lib/types';
export interface AppState {
  profile: { points: number; rank: { name: string; index: number; next: { name: string; at: number } | null; floor: number }; streak: number; season_no: number; resolved_total: number };
  env: LabEnv; roster_count: number; roster: { full_name: string; username: string; department: string; is_active: boolean }[];
  tickets: PublicTicket[]; recent_resolved: PublicTicket[];
  skills: Record<string, { resolved: number; points: number }>;
  ledger: { reason: string; delta: number; created_at: string }[];
  board: { min: number; target: number; needs_refill: boolean };
  account: { is_anonymous: boolean; email: string | null };
  badges: { catalog: { id: string; name: string; desc: string; icon: string }[]; earned: { badge_id: string; earned_at: string }[] };
  practice: { pending: number; due: number }; exam: { tags: string[]; note: string };
}
export interface Msg { id: string; role: 'user' | 'assistant'; content: string; hint_level: number | null; kind: 'chat' | 'hint' }
export interface Checkpoint { id: string; title: string; prompt: string; proof: boolean }
export interface Detail { ticket: PublicTicket; checkpoints: Checkpoint[] | null; reply: { passed: boolean; tries: number }; messages: Msg[]; attempts: { id: string; attempt_no: number; passed: boolean; feedback: string; mode: 'console' | 'vm'; screenshot_path: string | null }[] }
export interface SubmitResult {
  status: 'resolved' | 'reopened' | 'in_progress'; passed: boolean; resolved: boolean; mode: 'console' | 'vm'; new_badges: string[]; checkpoint: { id: string | null; title: string | null; done: number; total: number } | null; attempt_no: number; feedback: string; pushback: string | null;
  checks: { met: number; total: number }; review: string[]; points: { total: number; lines: { reason: string; delta: number }[] } | null;
  profile: { points: number; rank: { name: string }; streak: number };
}
export const REASON_LABEL: Record<string, string> = { tone_bonus: 'Friendly reply', base: 'Base points', own_vm_bonus: 'Own-VM bonus', first_try_bonus: 'First-try bonus', no_hint_bonus: 'No-hints bonus', hint_penalty: 'Hint cost', floor: 'Minimum' };
