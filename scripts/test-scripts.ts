// Generates every script and writes them to scripts/.tmp/ps for a PowerShell syntax check. Also tests injection safety.
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCRIPTS, rosterScript, validateCtx, q, type ScriptCtx } from '../lib/scripts';
import { ROSTER_SEED } from '../lib/lab';
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const ctx: ScriptCtx = { ticketCode: 'INC-4821', domain: 'corp.local', netbios: 'CORP', dn: 'DC=corp,DC=local', dcIp: '10.0.10.10', prefix: '10.0.10', scopeId: '10.0.10.0', user: 'cmendoza', targetUser: 'arivera', targetDept: 'IT', newName: "Jordan O'Ellis", newUser: 'jellis', dept: 'Finance', fshost: 'DC01', title: 'Test ticket' };
mkdirSync('scripts/.tmp/ps', { recursive: true });
let n = 0;
for (const [id, def] of Object.entries(SCRIPTS)) for (const kind of ['prepare', 'undo'] as const) for (const st of def[kind](validateCtx(ctx))) { writeFileSync(`scripts/.tmp/ps/${id}__${st.filename}`, st.body); n++; ok((/#Requires -RunAsAdministrator/.test(st.body) && /Type YES|Nothing was changed|Write-Host/.test(st.body)) || /^Write-Host/.test(st.body), `${st.filename} has admin requirement and a safety prompt or is read-only`); }
const roster = ROSTER_SEED.map(([full_name, username, department, job_title]) => ({ full_name, username, department, job_title, is_active: true }));
writeFileSync('scripts/.tmp/ps/Sync-LabRoster.ps1', rosterScript('corp.local', 'DC=corp,DC=local', roster, 'Lab#Only2026pw')); n++;
writeFileSync('scripts/.tmp/ps/Sync-LabRoster-quote.ps1', rosterScript('corp.local', 'DC=corp,DC=local', roster, "Lab'Q#Only2026"));
console.log('generated', n, 'scripts');
// injection attempts must be rejected before any script exists
for (const bad of ["x'; Remove-Item C:\\ -Recurse; '", 'a b', "$(calc)", '`whoami`', 'a;b', '']) { let threw = false; try { validateCtx({ ...ctx, user: bad }); } catch { threw = true; } ok(threw, `user value rejected: ${JSON.stringify(bad)}`); }
{ let threw = false; try { validateCtx({ ...ctx, title: 'x #> Remove-Item C:\\' }); } catch { threw = true; } ok(threw, 'title with comment terminator rejected'); }
{ let threw = false; try { rosterScript('corp.local', 'DC=corp,DC=local', [{ ...roster[0], full_name: "Evil'; calc; '" }], 'Lab#Only2026pw'); } catch { threw = true; } ok(threw, 'roster entry with quote rejected'); }
ok(q("it's") === "'it''s'", 'single quotes are doubled in PowerShell literals');
console.log(`script generator tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
