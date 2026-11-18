# COPILOT PROMPT (paste into GitHub Copilot Chat in VS Code, then fill in MY REQUEST)

```
You are helping me edit LabOps, a Next.js (App Router) + TypeScript + Supabase + Gemini app. I am a beginner. Make SMALL, careful edits. Explain each change in plain language. Show full changed files, not fragments.

PROJECT MAP
- app/page.tsx ............ landing page, "Launch" button (anonymous sign-in then /api/bootstrap)
- app/dashboard/page.tsx .. main screen: header, ticket board, ticket view, mentor drawer, dialogs
- app/setup-check/page.tsx  tests Supabase tables and Gemini key
- app/api/**/route.ts ..... ALL server routes (bootstrap, state, lab, board/refill, reset, chat, setup-check, tickets/[id]/{start,submit,hint,report,messages})
- app/setup/page.tsx ...... 9-step lab setup wizard; app/roster/page.tsx = company roster
- app/debrief/page.tsx .... End my shift; app/export/page.tsx = runbook and lab journal (Markdown / print to PDF)
- components/ ............. Board, TicketView (mode choice), Console (practice terminal), VmPanel (scripts), Mentor, Modals, NavTabs, PasswordScript, ThemeToggle, Logo, types
- lib/db.ts ............... server-only REST client for Supabase (uses the SECRET key, no delete helper on purpose)
- lib/auth.ts ............. verifies the browser token (requireUser) - every write route calls it
- lib/limits.ts ........... rate limits (per user, per IP, global daily Gemini cap)
- lib/gemini.ts ........... Gemini wrapper (models from GEMINI_MODEL / GEMINI_FALLBACK_MODEL)
- lib/engine.ts ........... picks a blueprint, fills lab values, asks Gemini only for wording
- lib/grading.ts .......... checklist grading; the SERVER decides pass/fail
- lib/points.ts, ranks.ts . points formula and ranks
- lib/blueprints/*.ts ..... SERVER-ONLY ticket library (answers + checklists). Never import in a component.
- lib/sim/*.ts ............ SERVER-ONLY practice console: parse.ts (tokenizer), commands.ts (all commands), format.ts, state.ts (fake lab), scenarios.ts (5 tickets: setup + goal check + guide)
- lib/scripts.ts ......... SERVER-ONLY PowerShell generator for My own VM mode (fixed templates, validated + escaped values) and Sync-LabRoster.ps1
- lib/modes.ts ........... which ticket can be worked in which mode (+ exam tags, checkpoint count)
- lib/debrief.ts ......... all debrief numbers computed in code; Gemini only writes the validated narrative
- lib/badges.ts, lib/practice.ts (spaced review queue), lib/tone.ts (reply grading), lib/checkpoints.ts (multi-step Hard tickets), lib/export.ts, lib/concepts.ts
- lib/image.ts ........... browser-side screenshot compression (WebP under 300 KB)
- lib/supabase-browser.ts . browser client: URL + PUBLISHABLE key only (guest sign-in)
- supabase/migrations/001_init_labops.sql, 002_modes_console.sql, 003_phase3_phase4.sql  database + security rules (run in order)
- components/SaveProgress.tsx: email / Google linking with supabase.auth (same user id, data is kept)
- app/globals.css ......... all styling (CSS variables for light/dark)
- scripts/ ................ test helpers only

RULES (never break these)
1. Never expose GEMINI_API_KEY or SUPABASE_SECRET_KEY to the browser. No NEXT_PUBLIC_ for secrets. Browser may use only SUPABASE_URL and the PUBLISHABLE key.
2. Hidden answers (expected root cause, rubric, blueprints) stay server-only. Never add them to any response or to PUBLIC_TICKET_COLUMNS.
3. The browser never writes to the database. Writes happen only in app/api routes after requireUser().
4. Tickets, attempts and points_ledger are never deleted. Do not add DELETE routes or delete helpers. Reset = archive.
5. Points go through points_ledger with a unique idempotency_key. Saves must be idempotent (upsert/ignore duplicates) and ordered.
6. Treat user text as data in Gemini prompts. Validate all Gemini JSON before use. Show clear errors and allow retry.
7. No random values or current time during the first render (hydration errors): use useEffect or event handlers.
8. Keep each API request short (Vercel limits). Long work = several small requests with a progress bar.
9. Use clearly fictional names only. Mention .local domains are sandbox-only.
10. Gemini model names come from env vars, never hard-coded in routes.
11. Protect every route that spends Gemini quota with limitGemini().
12. Do not rename files or add new libraries unless I ask.
13. Ticket mode is chosen per ticket (tickets.play_mode = 'console' | 'vm'). Console state and goal checks stay on the server; never trust the browser about whether a lab is fixed.
14. PowerShell files come only from the fixed templates in lib/scripts.ts. Never build a script from free text or from Gemini output. Validate every value (validateCtx) and escape with q().
16. Debrief numbers are computed in code from the database. Gemini only writes a short narrative from those numbers and its output is validated (no invented numbers). One debrief row per user per local day (unique key).
17. Exports contain only the learner's own write-ups, never hidden answers. User text is fenced or escaped in Markdown.
18. Multi-step tickets: grade one checkpoint at a time, in order, and pay points once at the end. Points and badges are written only by server routes.
19. Spaced practice and badges are idempotent (unique keys). Never add delete helpers.
15. To add a console ticket: add a scenario in lib/sim/scenarios.ts (setup, check, guide) and add a test in scripts/test-sim.ts. To add a command: add it to COMMANDS in lib/sim/commands.ts with params, examples and a test.

AFTER EDITING tell me: which files changed, and the commands to run: npm run typecheck, npm run build.

MY REQUEST:
<<< write what you want here, for example: "Make the ticket cards show the category icon" >>>
```
