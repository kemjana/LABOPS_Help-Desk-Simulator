# LabOps - IT Service Desk & Active Directory Homelab Simulator

**Live demo:** [https://labops-help-desk-simulator.vercel.app](https://labops-help-desk-simulator.vercel.app)
<img width="1917" height="927" alt="image" src="https://github.com/user-attachments/assets/e6ff44a4-9c14-4e25-8381-861407709731" />
<img width="1917" height="927" alt="image" src="https://github.com/user-attachments/assets/4521c6df-4cde-40ce-8ccb-fb0348a5e18e" />
<img width="1916" height="927" alt="image" src="https://github.com/user-attachments/assets/310a3d18-be7d-407f-965f-39ccbfcfe2bc" />
<img width="1917" height="926" alt="image" src="https://github.com/user-attachments/assets/d184ae1e-7343-4c89-bb35-b5451912ff58" />

LabOps turns help desk and sysadmin practice into a game. You work a **board of realistic tickets** (Tier 1 to Tier 3) about accounts, Group Policy, DNS/DHCP, file shares and security. When you accept a ticket you choose **how** to work it:

| | **Pre-built lab** | **My own VM** |
| :--- | :--- | :--- |
| **Setup** | None. The problem is already set up in a practice console in the browser | Build a Windows Server lab once (guided 9-step wizard) |
| **Problem setup** | Done for you | Paste a ready-made PowerShell script (and an undo script) |
| **Realism** | **Simulated, not real Windows** | Real Windows, your own lab |
| **Evidence** | The server checks the final state of the fake lab | You paste output that contains values only your lab has |
| **Extra points** | none | small own-VM bonus |
| **Available for** | 5 tickets so far (look for "Lab ready") | all tickets (ready-made scripts for 7 tickets so far) |

Everything (people, companies, data) is fictional and sandboxed.

## About this project (please read)

**LabOps is a learning project.** I built it to explore how to design, secure and deploy a full-stack app with Next.js, Supabase and the Gemini API. It is not a production service.

### Known limitations of the live demo
- **Free tiers.** The demo runs on free plans (Vercel, Supabase, Google Gemini). These have usage limits, so the demo may be slow, rate-limited, or temporarily unavailable.
- **Paused database.** Supabase pauses free projects after about a week of low activity. If the demo does not load or fails to sign in, the database may be paused.
- **AI limits.** Gemini has per-minute and daily request limits. When they are reached, AI features (grading, hints, coach notes) show an error or wait until the quota resets.
- **Not built for many users.** I added rate limits and a daily AI cap, but I have not load-tested the app. It is meant for one person or a few testers at a time.
- **AI can be wrong.** Feedback and grading come partly from a language model and can be inaccurate. Treat it as practice, not as an official assessment.
- **Fictional data only.** Please do not enter real passwords, personal data or company information.

### If the demo is not working
You can run the whole project yourself with your own free Supabase and Gemini accounts. Setup steps are in `SETUP-GUIDE.md`.

### What I would change for real production use
Paid hosting and database plans, CAPTCHA and stronger abuse protection, load testing, monitoring, and testing against real accounts and real services.

## Features

### Core
- **Instant guest entry** (Supabase anonymous sign-in), no forms. **Save my progress** links an email or Google account to the guest (same workspace, nothing lost); returning users sign in with a one-time email link
- **Ticket board** with 6-8 open tickets, difficulty, category, points and suggested time. Work in any order; tickets are never deleted
- **Hybrid ticket engine**: 30 hand-written, vetted blueprints (6 per category). Gemini only varies wording; facts, answers and checklists come from the vetted library
- **Checklist grading**: Gemini returns yes/no + a quote per criterion; the **server** verifies the quote exists in your text and decides pass/fail. Wrong answers reopen the ticket with end-user pushback
- **Append-only points ledger**, 6 ranks (Help Desk Intern to Domain Admin), per-category skill totals, streak
- **3-level hint ladder** (each level costs points) and a **mentor chat** that sees the lab context and public ticket text only, never the answer key
- **Practice Console (Pre-built lab)**: a PowerShell-style simulator with two computers (`DC01`, `WS01`). Tolerant parser (case-insensitive, parameter abbreviations, positional arguments, variables, pipes), tab completion, "did you mean", `Get-Help`, and a "Commands for this ticket" guide with an Insert button. Grading looks at the **final lab state**, so any valid fix counts.
- **My own VM**: per-ticket prepare/undo `.ps1` scripts from fixed, escaped templates (never written by Gemini), `Sync-LabRoster.ps1`, a 9-step lab setup wizard, a roster page, private screenshot upload (WebP under 300 KB, compressed in the browser).

### Phase 3
- **End my shift (daily debrief)**: tickets resolved, points, first-try rate, average time, hints, reopen rate, per-category and per-topic results, streak, the weakest 3 topics with what to practise, and 3 tickets for tomorrow. All numbers are counted in code from the database; Gemini only writes a short validated coach note. One debrief per user per local day (unique key, idempotent). Yesterday's debrief is prepared when you open the app (no background jobs)
- **Skill radar** and **14 badges**
- **SOP runbook and lab journal export**: Markdown download, or print to PDF. Built from your own verified write-ups, never from hidden answers

### Phase 4
- **Spaced practice**: missed topics return after about a day as "Review" tickets; solved first try they return after 3 and 7 days, then retire
- **Reply to the user**: optional tone practice after a ticket, graded by a checklist (+3 points once per ticket)
- **Multi-step Hard tickets**: Tier 3 tickets with checkpoints, each graded alone, points paid once at the end
- **Exam-topic tags** (A+ Core 2, Network+, Security+, AZ-800) with a filter. Topic-aligned only; not official exam content and not affiliated with CompTIA or Microsoft
- **Also**: Report a bad ticket, Lab settings, Reset Workspace (archives a season, deletes nothing), Setup check page, light-first design with dark toggle, mobile friendly and accessible.

## Security design
- **Row Level Security on every table.** The browser can only READ its own rows. All writes (status, attempts, points, profile, console, badges, practice) happen in server routes that verify the user's token, so a guest cannot mark a ticket resolved or award points.
- **Hidden answers live in separate tables** (`ticket_secrets`, `ticket_blueprints`) with no browser policy. The **fake lab state also lives on the server** (`console_sessions`) and the goal checks are server code. A test scans API responses and the browser bundle for answer text.
- **Scripts cannot be injected**: every value in a PowerShell file is validated with a strict pattern and escaped as a single-quoted literal; scripts only touch named lab objects, check the domain first, and ask for YES. All generated scripts are syntax-checked with the real PowerShell parser.
- **Debrief and exports**: numbers come from the database; the AI narrative is schema-validated and rejected if it invents numbers; Markdown export fences or escapes user text.
- **Keys**: the browser gets only the Supabase URL and publishable key. Secret and Gemini keys are server-only; the build refuses to start if a secret key is in a public variable; secret keys are sent only in the `apikey` header.
- **Abuse protection**: Gemini routes are limited per user, per IP and by a global daily cap; console commands have their own limit; CAPTCHA is recommended for public demos.
- **Tickets, attempts, replies and the ledger can never be deleted** (database triggers + no delete routes). Saves are idempotent and ordered.
- **Prompt injection**: student text is passed as delimited data; Gemini output is schema-validated; evidence quotes must exist in the submission; the server computes points.
- **Never connects from Next.js to local VMs** (no LDAP/WinRM/SMB). Human in the loop + AI verification.

## Limitations (honest)
- **The console is a simulation.** Output is realistic, not identical to Windows, and only the implemented commands exist (about 40). Unusual but valid command forms can fail.
- **Only 5 tickets have a pre-built lab**, and ready-made scripts exist for 7. Group Policy, file-share and the Hard tickets are VM-only for now.
- **I could not test on real systems**: real Supabase (RLS, triggers, storage policies, anonymous sign-in, email and Google account linking), real Gemini (model names, grading and coach-note quality), real VirtualBox, and the scripts and wizard commands on a real domain controller. The email and Google flows were tested only against a mock of the Supabase calls. Scripts follow Microsoft's documentation and are syntax-checked, not executed against Active Directory.
- In **My own VM** mode the app cannot see your VM and grades what you paste. Lab-specific values make casual copying fail, not a determined cheater. With the default `corp.local`, change your values in Lab settings.
- The spaced-practice schedule is a simple 3-box system, not a full memory model. The radar scale (150 points = full axis) is a simple choice. Badges and exam tags are heuristics.
- The debrief coach note can be missing if the AI fails; the numbers are always there.
- PDF export uses your browser's print dialog ("Save as PDF").
- 30 blueprints: after all are used they repeat with new wording, people and lab values.
- A prepare script shows how the problem was made. Run it first, read it later. The setup wizard shows some commands that also fix tickets (setup knowledge is public).
- LLM checklist grading can be wrong; use "Report a bad ticket".
- `npm audit` may show a PostCSS advisory through Next.js 15. It affects build-time CSS processing; LabOps processes only its own CSS. Upgrading Next.js is a breaking change and was not tested.
- Fonts use the system font stack (no external font requests).

## Run locally
1. Install Node 20+ and Git.
2. `npm install`
3. Copy `.env.example` to `.env.local` and fill it in.
4. Run `supabase/migrations/001_init_labops.sql`, then `002_modes_console.sql`, then `003_phase3_phase4.sql` in the Supabase SQL Editor and enable Anonymous sign-ins (**Authentication > Sign In / Providers**).
5. `npm run dev`
6. Open `http://localhost:3000` and `http://localhost:3000/setup-check`.

Full beginner guide: [SETUP-GUIDE.md](SETUP-GUIDE.md).

## Stack
Next.js (App Router) + TypeScript, Supabase (Postgres, Auth, RLS, Storage), Google Gemini (`@google/genai`), Vercel. Plain CSS with variables (light default, dark toggle).

## Testing (what was run before delivery)
- `npm run typecheck`, `npm run build`
- `npx tsx scripts/test-sim.ts`: 66 console unit tests
- `npx tsx scripts/test-scripts.ts`: 29 script-generator tests incl. injection attempts; every generated script parsed by the real PowerShell parser (22 files, 0 syntax errors)
- `npx tsx scripts/test-gemini.ts`: 9 tests for models that reject some thinking settings
- `node scripts/test-api.mjs`: 160 API checks against a fake Supabase and a fake Gemini server (the real `@google/genai` SDK talks to the fake server); also run with a failing primary model, invalid AI wording and an invalid coach note (159 checks)
- `python3 scripts/e2e.py`: 57 Playwright (Chromium) checks, desktop and mobile, covering both modes, console, scripts, wizard, roster, screenshots, debrief, radar, badges, export (Markdown and a real PDF), checkpoints, tone reply, exam filter, save-progress and the theme
- Test helpers: `scripts/run-test-env.sh`, `scripts/test.env` (fake values only)

*Sandbox disclaimer: all people and organizations are fictional; `.local` domains and self-signed settings are for learning only, never for production.*
