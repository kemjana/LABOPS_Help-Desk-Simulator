# LabOps - project description

## Short version (GitHub "About" box, under 350 characters)
IT service desk & Active Directory homelab simulator. Work Tier 1-3 tickets in a browser practice console or your own VM with safe PowerShell scripts. Checklist grading, hints, points, daily debrief, spaced practice. Next.js, TypeScript, Supabase (RLS), Gemini, Vercel. Fictional data, sandbox only.

## Medium version
LabOps is a web app that teaches help desk and sysadmin skills. Learners work a board of realistic tickets (accounts, Group Policy, DNS/DHCP, file shares, security) and choose how to work each one: a pre-built practice console that simulates two Windows computers in the browser, or their own virtual machines with safely generated PowerShell scripts. A hybrid engine combines 30 vetted ticket blueprints with Gemini-written wording; a server-side checklist plus a check of the lab state decide pass/fail. Points, ranks, badges, a hint ladder and a mentor chat keep it motivating, and an end-of-shift debrief (numbers computed in code, a short AI coach note) feeds spaced practice for weak topics. Built with Next.js, Supabase (anonymous auth, RLS) and Gemini, deployed on Vercel.

## Long version
**Problem.** Beginners can build a home Active Directory lab, but then they have nothing realistic to *do* with it, and building the lab is a barrier by itself. Most practice material is a static question list or an AI that makes up answers, and few tools tell you what you are weak at.

**Solution.** LabOps gives learners a ticket board with two ways to practice. In the *pre-built lab* the problem is already in place in a browser simulation of a domain controller and a client PC, with a command guide and tolerant command parsing. In *my own VM* mode they get a guided lab setup and a script that creates the problem in their real lab. Tickets come from a vetted blueprint library, so the scenario, the fix and the grading checklist are reliable; Gemini only varies names and wording. The server grades against a checklist, awards points through an append-only ledger and reopens wrong answers with realistic end-user pushback. At the end of a shift a debrief computed from the database shows the weakest topics, schedules spaced review tickets, and exports a runbook and lab journal from the learner's own write-ups.

**How it's built.**
- Next.js App Router + TypeScript; plain CSS design system (light-first, dark toggle), responsive and accessible
- Supabase: anonymous guest sign-in that can be upgraded to email/Google without losing data, Postgres with Row Level Security on every table, private storage for screenshots
- A custom PowerShell-style simulator (tokenizer, binder, pipeline, formatter, about 40 commands, 5 scenarios) running on the server with versioned saves
- A PowerShell script generator with fixed templates, strict validation and escaping, verified with the real PowerShell parser
- Gemini (`@google/genai`) with structured JSON output, schema validation, env-based models with fallback, and automatic handling of per-model thinking settings
- Debrief statistics, badges, a 3-box spaced-practice queue and multi-step (checkpoint) tickets, all computed or enforced in server code
- Rate limits per user, per IP and per day; grading, board refill and console commands are separate small requests for Vercel time limits

**Challenges solved.**
- *Answer-key and fake-lab leakage*: secrets and console state live in server-only tables; responses are whitelisted; tests scan responses and the browser bundle
- *Making a simulator forgiving*: case-insensitive commands, parameter abbreviations, positional arguments, variables, pipes, "did you mean", tab completion, grading by final state
- *Trustworthy AI output*: debrief numbers come from SQL, the AI note is schema-validated and rejected if it invents numbers; grading quotes must exist in the learner's text
- *Script safety*: no AI-written scripts; validated, escaped values; domain guard; confirmation prompt; undo scripts
- *Double counting and races*: idempotent attempt keys, unique ledger/debrief/badge keys, ordered updates, versioned console saves
- *Never deleting history*: triggers block deletes; reset archives a season
- *Changing AI model names*: env-based models with a fallback and a Setup check page that lists usable models

**What to improve next.** Test against real Supabase, Gemini and a real domain controller; more console scenarios and commands (Group Policy, file shares); more blueprints; optional CAPTCHA; a richer spaced-repetition model.

## Tools and technologies
| Tool | Used for |
|---|---|
| Next.js (App Router), React | Pages and server API routes |
| TypeScript | Type-safe code, simulator and script generator |
| Supabase Auth (anonymous + email/Google linking) | Instant guest accounts that can be saved |
| Supabase Postgres + RLS + triggers | Data, per-user security, no-delete rules |
| Supabase Storage (private) | Proof screenshots |
| Google Gemini (`@google/genai`) | Ticket wording, checklist grading, tone grading, mentor chat, coach note |
| PowerShell | Generated prepare/undo/roster scripts (syntax-checked) |
| Vercel | Hosting and deployment |
| Playwright, tsx | Browser and unit tests |
| VirtualBox / Windows Server (user's lab) | Optional real-lab mode |

## Skills demonstrated
Active Directory, DNS/DHCP, Group Policy and file-share permissions knowledge; PowerShell; secure full-stack design; Row Level Security; account linking; API design and idempotency; rate limiting; LLM prompt-injection defenses and output validation; parser and simulator design; learning analytics (spaced repetition, weakness analysis); automated testing; accessible, responsive UI; technical writing.

## GitHub topic tags
`nextjs` `typescript` `supabase` `gemini-api` `active-directory` `powershell` `helpdesk` `homelab` `sysadmin` `windows-server` `row-level-security` `simulator` `spaced-repetition` `vercel` `portfolio`

## Two honest tips
1. Say plainly in interviews that the pre-built lab is a simulation and that own-VM mode grades what the learner pastes. Then explain what you added (server-held lab state, lab-specific proof, script safety, numbers computed in SQL). Honesty about limits is stronger than overclaiming.
2. Before you describe the scripts or the email/Google sign-in as working, run them once on your own real lab and your own Supabase project. They were tested here against mocks and a PowerShell syntax parser, not against real Active Directory or real email delivery.
