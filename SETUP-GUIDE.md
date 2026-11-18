# LabOps SETUP GUIDE (from zero to live)

_Version 3 (all four phases): tickets can be worked in a **Pre-built lab** (practice console in the browser) or in **My own VM** (ready-made PowerShell scripts). It also has a daily debrief, badges, runbook export, saving your progress, spaced practice, tone replies and multi-step Hard tickets._

Read top to bottom. Every step says exactly where to click. Words in `code style` are things you type or paste.
**Terminal** = the panel inside VS Code (menu **Terminal > New Terminal**).

---
## 0. What you will end up with
A website you can open on your phone: guest login, a board of IT tickets, a mentor chat, points and ranks.
You need 3 free accounts you already have: **GitHub** (username `kemjana`), **Vercel**, **Supabase**, plus a **Gemini API key**.

---
## 0b. Already installed an earlier version? Update in 5 steps
1. **Stop the server** (click the VS Code Terminal, press Ctrl+C).
2. **Copy the new files into your project folder**, replacing the old ones. Do **not** delete or overwrite these: `.env.local`, `node_modules`, `.git`. (Easiest: unzip `labops.zip` to a new folder, copy your `.env.local` and `.git` folder into it, and open that folder in VS Code.)
3. In the Terminal run `npm install` (a few new packages).
4. **Run the new SQL**: Supabase > SQL Editor > New query > paste all of `supabase/migrations/002_modes_console.sql` > **Run**; then a new query with all of `003_phase3_phase4.sql` > **Run**. (Skip `002` if you already ran it. You never need to run `001` again.) Your guest account, tickets and points stay.
5. `npm run dev`, then open `http://localhost:3000/setup-check` > **Run checks**. Every table line must say **ok** (including `practice_queue`, `user_badges`, `ticket_replies`, `console_sessions`).
Then `git add .`, `git commit -m "modes and console"`, `git push`. Vercel redeploys by itself. (No new environment variables are needed.)

---
## 1. Install Node.js and Git (skip what you already have)
1. Go to https://nodejs.org and click the **LTS** button. Run the installer, keep all defaults.
2. Go to https://git-scm.com/downloads, download for your system, run the installer, keep all defaults.
3. **Close and reopen VS Code**, open a Terminal and check:
   ```
   node -v
   git --version
   ```
   `node -v` must show **v20 or higher**. Both commands must print a version. If you see "not recognized", restart your computer and try again.

## 2. Open the project in VS Code
1. Unzip `labops.zip`. You get a folder called `labops`.
2. Open VS Code. **File > Open Folder...** > choose the `labops` folder > **Select Folder**. Click **Yes, I trust the authors** if asked.
3. Open a Terminal (**Terminal > New Terminal**). Install the project's parts (this takes 1-3 minutes):
   ```
   npm install
   ```
   Some yellow "warn" lines are normal. Red "ERR!" lines are not (see Troubleshooting).

## 3. Get your Gemini API key
1. Open https://aistudio.google.com/apikey and sign in with Google.
2. Click **Create API key**, pick any project (or create one), copy the key. It starts with `AIza`.
3. Keep that tab open or paste the key in a safe note for step 6. **Never** share it or put it in GitHub.

## 4. Set up Supabase
### 4a. Create the project
1. Open https://supabase.com/dashboard and click **New project**.
2. Name: `labops`. Choose a database password (save it somewhere). Pick the region closest to you. Click **Create new project**. Wait 1-2 minutes.

### 4b. Turn on Anonymous sign-ins (needed for the Launch button)
1. Left menu: **Authentication**.
2. Open **Sign In / Providers** (older dashboards: **Providers**).
3. Find **Anonymous Sign-Ins** and switch it **ON**. Click **Save**.
   If you skip this, the Launch button shows "Guest sign-in failed".

### 4c. Create the tables (SQL migrations)
1. Left menu: **SQL Editor** > **New query**.
2. In VS Code open `supabase/migrations/001_init_labops.sql`. Press **Ctrl+A** (select all), **Ctrl+C** (copy).
3. Click inside the Supabase query box, **Ctrl+V** (paste), then click **Run** (bottom right).
4. You should see "Success. No rows returned". It is safe to run again if you are unsure.
5. **Do the same for the next two files, in order**: `supabase/migrations/002_modes_console.sql`, then `supabase/migrations/003_phase3_phase4.sql` (new query, paste all, **Run**). Order: 001, 002, 003.

### 4d. Copy your 3 Supabase values
1. Left menu: the **gear icon (Project Settings)**.
2. **Project URL**: shown in **Data API** (or **General**). It looks like `https://abcdxyz.supabase.co`. It must have **no `/rest/v1`, no slash at the end**.
3. **API Keys**: copy the **Publishable key** (starts `sb_publishable_`) and click **Reveal** on the **Secret key** (starts `sb_secret_`) and copy it.
   (If your project only shows the older `anon` and `service_role` keys, use `anon` as the publishable value and `service_role` as the secret value. Both work.)
   The **secret key** is like a master password. Only ever put it in `.env.local` and Vercel's environment variables.

## 5. Create `.env.local` (your private settings file)
`.env.local` is **not** in the zip on purpose. You create it yourself:
1. In VS Code's left file list you will see a file called `.env.example`. Right-click it > **Copy**, then right-click empty space > **Paste**. Rename the copy to exactly `.env.local`
   (or in the Terminal: `copy .env.example .env.local` on Windows, `cp .env.example .env.local` on Mac/Linux).
2. Open `.env.local` and replace the values:
   ```
   SUPABASE_URL=https://abcdxyz.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   SUPABASE_SECRET_KEY=sb_secret_...
   GEMINI_API_KEY=AIza...
   GEMINI_MODEL=gemini-3.5-flash
   GEMINI_FALLBACK_MODEL=gemini-3.8-flash
   ```
3. Rules that prevent 90% of problems:
   - **No spaces** around `=`. **No quotes** around values.
   - The URL has **no** path and **no** trailing `/`.
   - Do not mix up the keys: publishable goes in `SUPABASE_PUBLISHABLE_KEY`, secret goes in `SUPABASE_SECRET_KEY`. If you swap them, the build refuses to start and tells you.
   - **After you edit `.env.local`, stop the server (Ctrl+C) and run `npm run dev` again.** It only reads the file at start.

## 6. Run it on your computer
```
npm run dev
```
Open http://localhost:3000 in your browser.
1. Go to http://localhost:3000/setup-check and press **Run checks**. Everything should say **OK**.
2. If the Gemini model shows PROBLEM, look at the list "Model names your key can use", copy one name (a `flash` model) into `GEMINI_MODEL` in `.env.local`, save, stop and restart `npm run dev`.
3. Go to http://localhost:3000, press **Launch LabOps Workspace**. Your board fills with tickets (about 10-20 seconds the first time).
4. Open **Lab settings** (menu at top right) and enter the real domain and IPs of your own lab.

## 7. Check your type safety and build (optional but good)
```
npm run typecheck
npm run build
```
Both should finish without red errors.

## 8. Push to GitHub (with a safety check)
1. Create an empty repository: https://github.com/new . Owner `kemjana`, name `labops`, keep it **Public** (for recruiters) or Private. **Do not** tick "Add a README". Click **Create repository**.
2. In the VS Code Terminal:
   ```
   git init
   git add .
   git status
   ```
3. **SAFETY CHECK**: read the list from `git status`. You must **not** see `.env.local` or `node_modules`. They are already blocked by `.gitignore`. Double-check with:
   ```
   git ls-files | findstr /i "env"
   ```
   (Mac/Linux: `git ls-files | grep -i env`). It should print only `.env.example` (and `scripts/test.env`, which holds fake test values). If `.env.local` appears, run `git rm --cached .env.local` and check again.
4. Commit and push:
   ```
   git commit -m "LabOps phase 1"
   git branch -M main
   git remote add origin https://github.com/kemjana/labops.git
   git push -u origin main
   ```
   A browser window may ask you to sign in to GitHub. Do it.
5. If you ever pasted a key in a file that went to GitHub: **delete that key** in Supabase/Google and create a new one.

## 9. Deploy to Vercel
1. Open https://vercel.com/new . Click **Import** next to `kemjana/labops` (click "Adjust GitHub App Permissions" if it is not listed).
2. Framework Preset should say **Next.js**. Leave Build settings alone.
3. Open **Environment Variables** and add these one by one (**Name** left, **Value** right, click **Add** each time):
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`
   Same values as `.env.local`. No quotes.
4. Click **Deploy**. After about a minute click the preview or **Visit** to open your live link (`https://labops-xxxx.vercel.app`).
5. Open `YOUR-LINK/setup-check` and press **Run checks**. Then paste your link into the **Live demo** line of `README.md`.

## 10. After any change (redeploy)
- **Code change**: `git add .` then `git commit -m "what I changed"` then `git push`. Vercel redeploys by itself.
- **Environment variable change** (Vercel > your project > **Settings > Environment Variables**): editing a variable does **not** change the running site. Go to **Deployments**, click the **...** next to the latest one, choose **Redeploy**.
- Locally: stop `npm run dev` (Ctrl+C) and start it again after editing `.env.local`.

## 11. Protect your free tier
- LabOps limits Gemini calls per user, per network address, and per day (`GEMINI_DAILY_CAP`, default 800).
- Anonymous accounts are cheap to create. For a public demo, turn on **CAPTCHA**: Supabase > Authentication > **Attack Protection** > enable CAPTCHA (Turnstile or hCaptcha). Without it, a bot could create many guest accounts. (The per-network and daily limits still protect your Gemini quota.)

---
## 12. Using the two modes (choose per ticket)
When you open a ticket you pick **how** to work it:
- **Pre-built lab**: the problem is already set up in a practice console in your browser. Two tabs (DC01 and WS01) act like two computers. Use the "Commands for this ticket" box, press Tab to complete, Up arrow for old commands, and `Get-Help <command>`. It is a **simulation** (not real Windows), so only the supported commands exist. Only 5 tickets have a pre-built lab so far (look for the "Lab ready" tag).
- **My own VM**: needs your own lab (see the **Lab Setup** tab, 9 steps). The ticket gives you ready-made PowerShell that sets up the problem, plus an undo script. You earn a small bonus for using your real lab.
You can switch mode until you submit your first answer.

### Building the VirtualBox lab (summary, the Lab Setup tab has the commands)
1. Install VirtualBox. Create **DC01** (Windows Server 2022 evaluation, 4 GB RAM) and **WS01** (Windows 10/11, 2-4 GB RAM). Put both on **Internal Network** `labnet`.
2. In each VM install **Guest Additions** (**Devices > Insert Guest Additions CD**, run it, restart) and set **Devices > Shared Clipboard > Bidirectional**. Test it: copy text on your computer, paste in the VM.
3. Optional shared folder for `.ps1` files: VM **Settings > Shared Folders > +**, pick a folder on your computer, tick **Auto-mount** and **Make Permanent**. Files appear in the VM under `\\VBOXSVR\<folder name>`.
4. Follow Lab Setup steps 3-8 (server, AD/DNS/DHCP, roster, domain join, GPO, test).
5. **Take a snapshot** of both VMs called `Clean lab` (VM > **Take Snapshot**). You can always go back to it.

### Running a ticket script
1. Choose **My own VM** on the ticket, press **Copy script** (or **Download .ps1**).
2. In the VM: right-click Start > **Windows PowerShell (Admin)** (or Terminal (Admin)). Paste. It asks you to type `YES`.
3. Some tickets have two steps (DC01 then WS01): the card says where each one runs.
4. Work the ticket. When finished, run the **Undo** script or revert to `Clean lab`.
5. If PowerShell says scripts are disabled for a downloaded file, paste the text instead, or run `Set-ExecutionPolicy -Scope Process Bypass` in that window first.

### Screenshots
In **My own VM** mode you can attach a screenshot. It is shrunk in your browser to WebP under 300 KB and stored in your private folder (bucket `proofs`, created by the SQL).

---
## 13. The rest of the features (Phases 3 and 4)
- **End my shift (Debrief tab)**: press it at the end of a session. You get tickets resolved, points, first-try rate, average time, hints, reopen rate, results per category and per topic, your weakest 3 topics with what to practise, and 3 tickets for tomorrow. All numbers are counted by the app; the AI only writes the short coach note. One debrief per day (press **Update with my latest work** to refresh today's). When you open the app the next day, yesterday's debrief is prepared for you.
- **Skill radar and badges**: on the dashboard and the Debrief page. Each radar axis fills at 150 points in that category.
- **Runbook and lab journal**: **Debrief > Runbook and lab journal**. Download Markdown, or press **Print / Save as PDF** and choose "Save as PDF" in your browser's print window. They are built from your own write-ups.
- **Spaced practice**: topics you missed come back about a day later as tickets with a **Review** tag. If you solve them first try they come back later (3 days, then 7), then retire.
- **Reply to the user**: after a ticket is resolved, an optional card asks for a short, kind reply. Good tone earns +3 points once per ticket.
- **Multi-step Hard tickets**: Tier 3 tickets are split into checkpoints. Each step is graded alone, and points are paid when the last step passes.
- **Exam topics**: tickets show topic tags (A+ Core 2, Network+, Security+, AZ-800) and you can filter by them. These show topic alignment only. LabOps is not official exam content and not affiliated with CompTIA or Microsoft.

---
## Troubleshooting
| What you see | Why | Fix |
|---|---|---|
| `node` / `npm` "not recognized" | Node not installed or terminal not restarted | Reinstall Node LTS, close and reopen VS Code (or restart the computer) |
| Launch says "Guest sign-in failed" | Anonymous sign-ins off | Supabase > Authentication > Sign In / Providers > Anonymous ON |
| "Supabase is not configured" | `.env.local` missing or server not restarted | Create `.env.local` (step 5), stop and rerun `npm run dev` |
| Build/start error "contains a SECRET key" | Keys swapped | Publishable key in `SUPABASE_PUBLISHABLE_KEY`, secret in `SUPABASE_SECRET_KEY` |
| Error "SUPABASE_URL must look exactly like..." or 405 / "not found" from Supabase | URL has extra path or slash | Use only `https://PROJECT-ID.supabase.co` |
| "Database error (404)... Did you run the SQL migration?" | Tables missing | Run the SQL file (step 4c); Setup check shows which table is missing |
| Setup check: Gemini PROBLEM "model not found" | Model name retired or typo | Pick a name from the list on that page, put it in `GEMINI_MODEL`, restart / redeploy |
| Setup check: Gemini "API key" error | Wrong or missing key | Create a new key (step 3), update `.env.local` / Vercel, restart / redeploy |
| "You are going fast" / "daily AI limit" | Rate limit protecting free tier | Wait; for testing set `GEMINI_USER_HOURLY=100` in `.env.local` |
| Works on my PC but not on Vercel | Variables missing on Vercel or no redeploy | Add them in Vercel, then **Redeploy** (step 10) |
| Board stays empty with a red message | Gemini or database problem | Press Reload; open `/setup-check` and read the red lines |
| Tickets look fine but grading says "AI did not answer" | Gemini busy or over free limit | Wait a minute and press Submit again (same answer is safe to retry) |
| `git push` rejected / asks for login | Not signed in to GitHub | Sign in in the browser window that opens, or install GitHub Desktop and sign in |
| `.env.local` shows in `git status` | `.gitignore` edited or file renamed | Run `git rm --cached .env.local`, make sure `.gitignore` has `.env.local` |
| `/setup-check` says `migration_002 ... not applied yet` | Second SQL file not run | Run `002_modes_console.sql` (step 4c) |
| Choosing "Pre-built lab" says it is not available | That ticket has no pre-built scenario yet | Choose My own VM, or pick a ticket with the "Lab ready" tag |
| Console says "Another command was running. Please run it again." | Two commands were saved at the same moment | Just run the command again |
| Console command says "not recognized" | The command does not exist in the simulation, or it runs on the other computer | Read the tip under the error; switch the DC01/WS01 tab; use "Commands for this ticket" |
| Script says "Wrong domain" or "not joined to ..." | Lab settings differ from your real lab | Fix the domain in **Lab settings**, or join WS01 to the domain |
| Script cannot be pasted into the VM | Clipboard not enabled | Install Guest Additions and set Shared Clipboard to Bidirectional, or use a shared folder |
| Screenshot upload fails | Bucket or policy missing | Re-run 001 (it creates the `proofs` bucket and policies) |
| "Save my progress" says manual linking is disabled | Setting off in Supabase | Authentication > Sign In / Providers > Allow manual linking = ON |
| Confirmation email never arrives | Built-in sender is limited, or in spam | Wait, check spam, or set up your own SMTP (step 4e) |
| Email link opens an error page or the wrong site | Site URL / Redirect URLs not set | Step 4e, item 1 |
| Debrief says "The coach note is not ready" | AI did not answer or its note failed validation | Press **Try again**. Your numbers are still correct |
| `/setup-check` shows `practice_queue` or `ticket_replies` PROBLEM | Third SQL file not run | Run `003_phase3_phase4.sql` |
| Page shows old behaviour after redeploy | Browser cache | Hard refresh: Ctrl+Shift+R |

## Optional: run the automatic tests (what I ran before delivering)
```
npm run build
npx tsx scripts/test-sim.ts       # practice console unit tests
npx tsx scripts/test-scripts.ts   # PowerShell script generator tests
node scripts/test-api.mjs         # needs the test environment, see scripts/run-test-env.sh
```
These use a fake Supabase and fake Gemini. They do not prove your real accounts work: use `/setup-check` for that.
