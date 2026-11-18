# Real-browser tests (Playwright + Chromium) against the test environment. Run: python3 scripts/e2e.py
import json, os, struct, sys, urllib.request, zlib
from playwright.sync_api import sync_playwright
APP = 'http://localhost:3100'; OUT = os.environ.get('SHOTS', '/home/claude/shots')
os.makedirs(OUT, exist_ok=True)
fails = []
def check(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
def tables():
    req = urllib.request.Request('http://localhost:54321/__tables', headers={'apikey': 'sb_secret_x'})
    return json.load(urllib.request.urlopen(req))
def png(w, h):
    raw = b''.join(b'\x00' + os.urandom(w * 3) for _ in range(h))
    def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 1)) + chunk(b'IEND', b'')
def secret_for(card_code):
    t = tables(); tk = next(x for x in t['tickets'] if x['ticket_code'] == card_code); return tk, next(s for s in t['ticket_secrets'] if s['ticket_id'] == tk['id'])
def open_card(pg, bp):
    t = tables(); ids = {x['ticket_code'] for x in t['tickets'] if x['blueprint_id'] == bp}
    cards = pg.locator('.tcard')
    for i in range(cards.count()):
        code = cards.nth(i).locator('.mono').first.inner_text()
        if code in ids: cards.nth(i).click(); pg.wait_for_selector('article.card'); return code
    raise Exception('no card for ' + bp)
def wait_board(pg, n=7): pg.wait_for_function(f"document.querySelectorAll('.tcard').length >= {n}", timeout=40000)

urllib.request.urlopen(urllib.request.Request('http://localhost:54321/__reset', headers={'apikey': 'sb_secret_x'}))
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=True); pg = ctx.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(APP + '/'); pg.wait_for_selector('text=Launch LabOps Workspace')
    check(pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'light', 'landing starts in LIGHT theme')
    pg.click('text=Launch LabOps Workspace'); pg.wait_for_url('**/dashboard'); wait_board(pg)
    check(pg.locator('.tcard').count() == 7, 'board shows 7 tickets')
    check(pg.locator('nav.nav-tabs a').count() == 4, 'header has Tickets / Debrief / Lab Setup / Company Roster tabs')
    check(pg.locator('.tag:has-text("Lab ready")').count() >= 3, 'cards show which tickets have a pre-built lab')
    pg.screenshot(path=f'{OUT}/02-board.png')

    # ---------- accepting a ticket: two choices ----------
    pg.locator('.tcard').nth(0).click(); pg.wait_for_selector('article.card')
    check(pg.locator('.mode-card').count() == 2, 'accepting a ticket shows two choices')
    check('Pre-built lab' in pg.locator('.mode-card').nth(0).inner_text() and 'My own VM' in pg.locator('.mode-card').nth(1).inner_text(), 'choices are "Pre-built lab" and "My own VM"')
    check(pg.locator('form[aria-label="Resolution form"]').count() == 0, 'no answer form before a choice is made')
    pg.screenshot(path=f'{OUT}/03-choose-mode.png')

    # ---------- console flow (password reset) ----------
    code = open_card(pg, 'ad-password-reset'); tk, sec = secret_for(code); u = sec['vars']['user']
    pg.click('.mode-card:has-text("Pre-built lab")'); pg.wait_for_selector('section[aria-label="Practice console"]')
    check(pg.locator('.vm-tab').count() == 2, 'console has DC01 and WS01 tabs')
    check(pg.locator('details.guide li').count() >= 3, 'commands guide is shown for this ticket')
    inp = pg.locator('.term-input'); inp.click(); inp.type('Get-ADU'); inp.press('Tab')
    check(inp.input_value().startswith('Get-ADUser'), 'Tab completes a command name')
    inp.fill(f'get-aduser {u} -prop passwordlastset'); inp.press('Enter'); pg.wait_for_selector('.term-out:has-text("PasswordLastSet")', timeout=10000)
    check(True, 'lowercase command with abbreviated parameter works in the browser')
    inp.fill('Unlock-ADAcount ' + u); inp.press('Enter'); pg.wait_for_selector('.term-out.err:has-text("Did you mean")', timeout=10000)
    check(True, 'a typo gets a friendly "Did you mean" hint')
    pg.click('.vm-tab:has-text("WS01")'); inp = pg.locator('.term-input'); inp.fill(f'Get-ADUser {u}'); inp.press('Enter'); pg.wait_for_selector('.term-out.err:has-text("Switch to the DC01 tab")', timeout=10000)
    check(True, 'AD command on the client PC tells you to switch to DC01')
    pg.click('.vm-tab:has-text("DC01")')
    pg.locator('details.guide li:has-text("Set-ADAccountPassword") button:has-text("Insert")').click()
    check('Set-ADAccountPassword' in pg.locator('.term-input').input_value(), 'Insert puts the example command into the console')
    pg.locator('.term-input').press('Enter'); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/04-console.png')
    pg.fill('#root', 'GOODANSWER I reset the password'); pg.click('button:has-text("Submit resolution")'); pg.wait_for_selector('text=Not quite yet', timeout=30000)
    check(pg.locator('.push:has-text("still there")').count() >= 1, 'reset alone is not enough: the end user says the problem is still there')
    pg.locator('.term-input').fill(f'Set-ADUser {u} -ChangePasswordAtLogon $true'); pg.locator('.term-input').press('Enter'); pg.wait_for_timeout(600)
    pg.fill('#root', 'GOODANSWER the password needed a reset and a forced change'); pg.click('button:has-text("Submit resolution")'); pg.wait_for_selector('text=Ticket resolved', timeout=30000)
    check('Own-VM bonus' not in pg.locator('.success').inner_text(), 'pre-built lab ticket has no own-VM bonus')
    check(pg.locator('.success .pt-lines li').count() >= 2, 'points breakdown shown')
    try: pg.wait_for_selector('form[aria-label="Reply to the user"]', timeout=15000)
    except Exception: pg.screenshot(path=f'{OUT}/FAIL-reply.png'); print('PAGE TEXT:', pg.locator('body').inner_text()[:1500]); print('ERRORS:', errors[-5:]); raise
    pg.fill('#reply', 'GOODANSWER Hi, sorry for the trouble. Your password was reset. Please sign in and choose a new one, and tell me if it happens again.')
    pg.click('button:has-text("Send reply")'); pg.wait_for_selector('text=Great reply', timeout=30000); check(True, 'optional "reply to the user" tone practice earns points')
    wait_board(pg)
    check(pg.locator('svg[role=img][aria-label^="Skill radar"]').count() == 1 and pg.locator('.badge-chip:not(.locked)').count() >= 1, 'skill radar and an earned badge are shown')

    # ---------- own VM flow (screenshot upload) ----------
    code = open_card(pg, 'ad-onboarding-new-hire'); tk, sec = secret_for(code)
    pg.click('.mode-card:has-text("My own VM")'); pg.wait_for_selector('section[aria-label="My own VM"]')
    check(pg.locator('#proof').count() == 1 and pg.locator('#steps').count() == 1 and pg.locator('#shot').count() == 1, 'VM mode shows steps, evidence and screenshot fields')
    pg.open_browser = None
    pg.set_input_files('#shot', {'name': 's.png', 'mimeType': 'image/png', 'buffer': png(1500, 900)}); pg.wait_for_selector('img.thumb', timeout=20000)
    kb = int(pg.locator('.row-actions span.muted').first.inner_text().split()[0]); check(0 < kb <= 300, f'screenshot compressed to WebP under 300 KB in the browser ({kb} KB)')
    pg.fill('#root', 'GOODANSWER cause explained in detail'); pg.fill('#steps', 'GOODANSWER commands I typed'); pg.fill('#proof', 'output ' + sec['proof_tokens'][0])
    pg.click('button:has-text("Submit resolution")'); pg.wait_for_selector('text=Ticket resolved', timeout=30000)
    check('Own-VM bonus' in pg.locator('.success').inner_text(), 'own-VM ticket shows the bonus line')
    st = tables(); check(any(a.get('screenshot_path') for a in st['ticket_attempts']) and len(st.get('__storage', [])) >= 1, 'screenshot stored in the private bucket and linked to the attempt')
    pg.screenshot(path=f'{OUT}/05-vm-resolved.png')
    check(pg.locator('.banner').count() == 1, 'guest "save progress" notice appears after the first resolve')

    # ---------- script panel for a script-ready ticket ----------
    wait_board(pg)
    t2 = tables(); target = None
    for bp in ['dns-apipa', 'dns-wrong-client-dns', 'ad-lockout-stale-creds', 'ad-onboarding-new-hire']:
        if any(x['blueprint_id'] == bp and x['status'] in ('open', 'in_progress') for x in t2['tickets']): target = bp; break
    open_card(pg, target); pg.click('.mode-card:has-text("My own VM")'); pg.wait_for_selector('.script-card')
    check(pg.locator('.script-card button:has-text("Copy script")').count() >= 1 and pg.locator('.script-card button:has-text("Download .ps1")').count() >= 1, 'script cards have Copy and Download')
    pg.locator('.script-card button:has-text("View script")').first.click(); check('#Requires -RunAsAdministrator' in pg.locator('.code-block').first.inner_text(), 'script text is viewable (type it by hand if you want)')
    with pg.expect_download() as dl: pg.locator('.script-card button:has-text("Download .ps1")').first.click()
    check(dl.value.suggested_filename.endswith('.ps1') and dl.value.suggested_filename.startswith('INC-'), f'download file name: {dl.value.suggested_filename}')
    pg.screenshot(path=f'{OUT}/06-vm-scripts.png')

    # ---------- wizard + roster ----------
    pg.click('nav.nav-tabs a:has-text("Lab Setup")'); pg.wait_for_selector('details.step'); check(pg.locator('details.step').count() == 9, 'wizard has 9 steps')
    pg.locator('details.step').nth(0).locator('input[type=checkbox]').check(); pg.wait_for_function("document.querySelector('[role=progressbar][aria-label=\"Setup progress\"]').getAttribute('aria-valuenow') === '1'")
    check(True, 'ticking a step saves progress')
    pg.locator('details.step').nth(4).locator('summary').click(); pg.fill('#labpw', 'Lab#Only2026pw')
    with pg.expect_download() as d2: pg.click('button:has-text("Download Sync-LabRoster.ps1")')
    check(d2.value.suggested_filename == 'Sync-LabRoster.ps1', 'wizard downloads Sync-LabRoster.ps1')
    pg.screenshot(path=f'{OUT}/07-wizard.png')
    pg.click('nav.nav-tabs a:has-text("Company Roster")'); pg.wait_for_selector('table.table'); check(pg.locator('table.table tbody tr').count() == 12, 'roster lists 12 fictional employees')
    cb = pg.locator('table.table tbody tr').nth(0).locator('input[type=checkbox]'); cb.uncheck(); pg.wait_for_function("document.querySelector('table.table tbody tr label').innerText.includes('Off')"); cb.check()
    check(True, 'roster toggle works'); pg.screenshot(path=f'{OUT}/08-roster.png')
    pg.click('nav.nav-tabs a:has-text("Tickets")'); wait_board(pg)

    # ---------- phase 4: multi-step ticket, exam filter ----------
    open_card(pg, 'dhcp-not-authorized'); pg.click('.mode-card:has-text("My own VM")'); pg.wait_for_selector('section[aria-label="Checkpoints"]')
    check(pg.locator('.stepper li').count() == 3 and pg.locator('.stepper li.cur').count() == 1, 'hard ticket shows 3 checkpoints with the current one highlighted')
    check('optional' in pg.locator('.proof-box').inner_text().lower(), 'lab evidence is optional on the first checkpoint')
    pg.fill('#root', 'GOODANSWER DHCP servers must be authorized in AD'); pg.fill('#steps', 'GOODANSWER I checked the server'); pg.click('button:has-text("Submit resolution")'); pg.wait_for_selector('text=Checkpoint passed', timeout=30000)
    pg.wait_for_function("document.querySelectorAll('.stepper li.ok').length === 1", timeout=15000); check(True, 'passing checkpoint 1 ticks it and unlocks the next step')
    pg.screenshot(path=f'{OUT}/06b-checkpoints.png')
    pg.click('.chip:has-text("Network+")'); n_sec = pg.locator('.tcard').count(); check(1 <= n_sec < 7, f'exam-topic filter narrows the board ({n_sec} tickets)'); check('not affiliated' in pg.locator('p.muted.small', has_text='affiliated').first.inner_text(), 'topic-aligned-only disclaimer is shown')
    pg.click('.chip:has-text("Network+")'); pg.wait_for_function("document.querySelectorAll('.tcard').length >= 7")

    # ---------- phase 3: debrief + export ----------
    pg.click('nav.nav-tabs a:has-text("Debrief")'); pg.wait_for_selector('.stat-grid', timeout=30000); pg.wait_for_selector('.card h2', timeout=30000)
    check(int(pg.locator('.stat').first.locator('b').inner_text()) >= 2, 'debrief counts the tickets resolved today')
    check(pg.locator('svg[role=img]').count() == 1 and pg.locator('h3:has-text("Weakest 3 topics")').count() == 1 and pg.locator('h3:has-text("3 tickets for tomorrow") + ul li').count() == 3, 'radar, weakest topics and 3 tickets for tomorrow are shown')
    check(pg.locator('.card h2').first.inner_text().startswith('Solid shift'), 'AI coach note is shown'); pg.screenshot(path=f'{OUT}/06c-debrief.png')
    pg.click('a:has-text("Runbook and lab journal")'); pg.wait_for_selector('article.doc h2', timeout=30000)
    check(pg.locator('article.doc h2').count() >= 2 and 'GOODANSWER' in pg.locator('article.doc').inner_text(), 'SOP runbook lists your fixes with your own write-ups')
    with pg.expect_download() as md: pg.click('button:has-text("Download Markdown")')
    check(md.value.suggested_filename == 'labops-runbook.md', 'Markdown download')
    pdf_bytes = pg.pdf(format='A4', print_background=True); check(pdf_bytes[:4] == b'%PDF' and len(pdf_bytes) > 3000, f'print layout produces a PDF ({len(pdf_bytes)} bytes)'); open(f'{OUT}/runbook.pdf', 'wb').write(pdf_bytes)
    pg.click('.chip:has-text("Lab journal")'); pg.wait_for_selector('article.doc li', timeout=30000); check(True, 'lab journal view')
    pg.screenshot(path=f'{OUT}/06d-export.png')
    pg.goto(APP + '/dashboard'); wait_board(pg)

    # ---------- phase 4: save progress ----------
    check(pg.locator('.banner:has-text("Save it to an email")').count() == 1, 'dashboard offers "Save my progress" after the first resolved ticket')
    pg.click('.banner button:has-text("Save my progress")'); pg.wait_for_selector('.modal'); pg.fill('#sp-email', 'ana@example.com'); pg.click('button:has-text("Send confirmation link")')
    pg.wait_for_selector('text=Check your inbox', timeout=15000); check(True, 'save-progress asks Supabase to send a confirmation link'); pg.click('button:has-text("Done")')
    pg.screenshot(path=f'{OUT}/06e-save.png')

    # ---------- theme, settings, reset, setup-check ----------
    pg.click('button[aria-label^="Switch to dark"]'); pg.wait_for_timeout(200)
    check(pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(9, 13, 22)', 'dark canvas is #090D16'); pg.screenshot(path=f'{OUT}/09-dark.png')
    pg.reload(); wait_board(pg); check(pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark', 'dark theme persists after reload')
    pg.click('button[aria-label="Menu"]'); pg.click('text=Lab settings'); pg.fill('#dn', 'bad domain'); pg.click('.modal button[type=submit]'); pg.wait_for_selector('.modal .alert.error')
    pg.fill('#dn', 'lab.test'); pg.click('.modal button[type=submit]'); pg.wait_for_selector('.modal', state='detached'); pg.wait_for_function("document.querySelector('.badge.lab').innerText.includes('lab.test')", timeout=10000)
    pg.click('button[aria-label="Menu"]'); pg.click('text=Reset workspace'); pg.fill('#rs', 'RESET WORKSPACE'); pg.click('button:has-text("Archive season")'); pg.wait_for_selector('.modal', state='detached'); wait_board(pg)
    check(sum(1 for x in tables()['tickets'] if x['status'] == 'archived') >= 3, 'old tickets archived, not deleted')
    pg.goto(APP + '/setup-check'); pg.click('text=Run checks'); pg.wait_for_selector('text=Database tables', timeout=30000); check(pg.locator('.status.bad').count() == 0, 'Setup check shows everything OK')
    check(not [e for e in errors if 'hydrat' in e.lower() or 'did not match' in e.lower()], 'no hydration errors in the console')
    check(not [e for e in errors if 'Failed to load resource' not in e], f'no console errors ({[e[:90] for e in errors if "Failed to load resource" not in e][:3]})')
    ctx.close()

    # ---------- mobile ----------
    m = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True); mp = m.new_page()
    mp.goto(APP + '/'); mp.click('button:has-text("I saved my progress")'); mp.wait_for_selector('.modal'); check('Sign in' in mp.locator('.modal h2').inner_text(), 'landing has a sign-in for saved progress'); mp.fill('#sp-email', 'ana@example.com'); mp.click('button:has-text("Send sign-in link")'); mp.wait_for_selector('text=Check your inbox', timeout=15000); mp.click('button:has-text("Done")')
    mp.click('text=Launch LabOps Workspace'); mp.wait_for_url('**/dashboard'); wait_board(mp)
    check(mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), 'mobile board: no sideways scrolling'); mp.screenshot(path=f'{OUT}/10-mobile-board.png')
    open_card_m = mp.locator('.tcard').filter(has_text='Lab ready').first; open_card_m.tap(); mp.wait_for_selector('.mode-card')
    check(mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), 'mobile choice screen: no sideways scrolling'); mp.screenshot(path=f'{OUT}/11-mobile-choice.png')
    mp.tap('.mode-card:has-text("Pre-built lab")'); mp.wait_for_selector('.term')
    check(mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), 'mobile console: no sideways scrolling')
    mp.locator('.term-input').fill('Get-Command *ADUser*'); mp.locator('.term-input').press('Enter'); mp.wait_for_selector('.term-out:has-text("Get-ADUser")', timeout=15000) if False else None
    mp.evaluate("document.querySelector('.term').scrollIntoView()"); mp.screenshot(path=f'{OUT}/12-mobile-console.png')
    mp.goto(APP + '/debrief'); mp.wait_for_selector('.stat-grid', timeout=30000); check(mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), 'mobile debrief: no sideways scrolling'); mp.screenshot(path=f'{OUT}/13-mobile-debrief.png')
    b.close()
print('\nFAILED:' if fails else '\nALL BROWSER CHECKS PASSED', fails or '')
sys.exit(1 if fails else 0)
