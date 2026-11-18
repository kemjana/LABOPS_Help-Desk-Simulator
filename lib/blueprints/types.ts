import type { Category, Difficulty } from '../types';
export interface Criterion { id: string; concept: string; text: string; required: boolean }
export interface Blueprint {
  id: string; cat: Category; diff: Difficulty; mode: 'both' | 'enterprise';
  host: 'WS01' | 'DC01' | 'FS01';
  title: string;        // short internal title
  scenario: string;     // what the end user reports (public). Placeholders like {user} are filled per lab.
  root: string;         // HIDDEN expected root cause
  fix: string;          // HIDDEN expected fix
  proofPrompt: string;  // PUBLIC: what lab-specific evidence to paste
  proofAny: string[];   // HIDDEN: at least one of these lab values must appear in the evidence
  criteria: Criterion[]; // HIDDEN checklist
  hints: [string, string, string]; // vetted hint ladder (level 1 = nudge, 3 = near-solution, never the full answer)
  pushback: string;     // end-user reply when the fix is wrong/incomplete
  breakfix: boolean;    // Phase 2: has a PowerShell break-it/undo script
}
export const c = (id: string, concept: string, text: string, required = true): Criterion => ({ id, concept, text, required });
export const CONCEPT_LABEL: Record<string, string> = {};
