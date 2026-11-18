# What changed in this version (all four phases)

**Replace/add everything in the zip. Keep your own `.env.local`, `node_modules` and `.git`.** Then run, in the Supabase SQL Editor, `002_modes_console.sql` (if you have not yet) and the new `003_phase3_phase4.sql`. No new environment variables.

## New in Phase 3
Debrief ("End my shift") with prepared-yesterday logic, skill radar, 14 badges, runbook and lab journal export (Markdown, print to PDF).
New files: `app/debrief/page.tsx`, `app/export/page.tsx`, `components/RadarChart.tsx`, `lib/debrief.ts`, `lib/badges.ts`, `lib/export.ts`, `app/api/debrief/{route,prepare/route,list/route}.ts`, `app/api/export/route.ts`.

## New in Phase 4
Save my progress (email / Google), sign-in for saved progress, spaced weak-topic review tickets, "reply to the user" tone practice, multi-step Hard tickets with checkpoints, exam-topic tags.
New files: `components/SaveProgress.tsx`, `lib/practice.ts`, `lib/tone.ts`, `lib/checkpoints.ts`, `lib/concepts.ts`, `app/api/tickets/[id]/reply/route.ts`.

## Changed files
`app/api/tickets/[id]/submit/route.ts`, `.../messages/route.ts`, `app/api/state/route.ts`, `app/api/reset/route.ts`, `app/api/setup-check/route.ts`, `lib/engine.ts`, `lib/modes.ts`, `lib/types.ts`, `lib/points.ts`, `lib/gemini.ts`, `lib/supabase-browser.ts`, `lib/api-client.ts`, `components/TicketView.tsx`, `components/Board.tsx`, `components/NavTabs.tsx`, `components/types.ts`, `app/dashboard/page.tsx`, `app/page.tsx`, `app/globals.css`, test scripts, docs.

## Earlier versions
Version 2 added the per-ticket Pre-built lab / My own VM choice, the practice console, scripts, wizard, roster and screenshots. A later patch made `lib/gemini.ts` try thinking settings from most to least restrictive (fixes `gemini-3.8-flash`).
