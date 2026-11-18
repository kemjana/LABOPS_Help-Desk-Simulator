// Unit tests for the Practice Console. Run: npx tsx scripts/test-sim.ts
import { createSession, SCENARIOS } from '../lib/sim/scenarios';
import { runLine } from '../lib/sim';
import { ROSTER_SEED } from '../lib/lab';
import type { Machine, SimVars } from '../lib/sim/types';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string, extra = '') => { if (c) pass++; else { fail++; console.log('  FAIL', m, extra); } };
const roster = ROSTER_SEED.map(([full_name, username, department, job_title]) => ({ full_name, username, department, job_title }));
const base = { domain: 'corp.local', dcIp: '10.0.10.10', fsIp: '10.0.10.20', gw: '10.0.10.1', subnetCidr: '10.0.10.0/24', light: true, roster, sessionUser: 'cmendoza' };
const vars: SimVars = { user: 'cmendoza', targetUser: 'arivera', newName: 'Jordan Ellis', newUser: 'jellis', dept: 'Finance', host: 'WS01', fshost: 'DC01' };
const mk = (id: string) => { const s = createSession(id, base, vars); return { s, run: (m: Machine, c: string) => runLine(s, m, c) }; };
const has = (r: { out: string }, t: string) => r.out.toLowerCase().includes(t.toLowerCase());
const exact = (r: { out: string }, t: string) => r.out.includes(t);

// ---- lockout ----
{ const { s, run } = mk('ad-lockout-stale-creds'); const sc = SCENARIOS['ad-lockout-stale-creds'];
  ok(!sc.check(s, vars).ok, 'lockout: starts broken');
  ok(exact(run('DC01', 'Get-ADUser cmendoza -Properties LockedOut'), 'LockedOut         : True'), 'Get-ADUser positional identity + property shows LockedOut True (capital T like PowerShell)');
  ok(has(run('DC01', 'get-aduser -id cmendoza -prop lockedout'), 'LockedOut'), 'lowercase cmdlet, abbreviated/alias params');
  const t = run('DC01', "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740} -MaxEvents 2"); ok(has(t, '4740') && t.out.split('\n').filter((l) => /4740/.test(l)).length === 2, 'Get-WinEvent table limited by MaxEvents');
  ok(has(run('DC01', 'Get-WinEvent -FilterHashtable @{LogName="Security";Id=4740} | Format-List TimeCreated,Message'), 'Caller Computer Name:\tWS01'), 'Format-List shows caller computer WS01');
  ok(has(run('DC01', "Get-EventLog -LogName Security -InstanceId 4740 -Newest 1 | Format-List Message"), 'WS01'), 'Get-EventLog older command works');
  ok(has(run('WS01', 'Get-ADUser cmendoza'), "not recognized") && has(run('WS01', 'Get-ADUser cmendoza'), 'Switch to the DC01 tab'), 'AD cmdlet on WS01 explains to switch machine');
  ok(has(run('DC01', 'Unlock-ADAcount cmendoza'), "Did you mean 'Unlock-ADAccount'"), 'typo suggests the right command');
  ok(!sc.check(s, vars).ok, 'unlocking is not enough while stale credential exists');
  const c = run('WS01', 'cmdkey /list'); ok(has(c, 'Target: Domain:target=DC01') && has(c, 'CORP\\cmendoza'), 'cmdkey /list shows stale credential');
  ok(has(run('DC01', 'Get-ADUser -Filter "LockedOut -eq $true" | Unlock-ADAccount'), '') && !s.users.find((u) => u.sam === 'cmendoza')!.locked, 'pipeline: filter | Unlock-ADAccount unlocks');
  ok(!sc.check(s, vars).ok, 'still broken after unlock only');
  ok(has(run('WS01', 'cmdkey /delete:nothing'), 'not found'), 'delete of wrong target says not found');
  ok(has(run('WS01', 'cmdkey /delete:Domain:target=DC01'), 'deleted successfully'), 'cmdkey delete works');
  ok(sc.check(s, vars).ok, 'lockout: fixed state passes'); }
// ---- password reset ----
{ const { s, run } = mk('ad-password-reset'); const sc = SCENARIOS['ad-password-reset'];
  ok(has(run('DC01', "Set-ADAccountPassword cmendoza -Reset -NewPassword (ConvertTo-SecureString 'abc' -AsPlainText -Force)"), 'does not meet the length'), 'weak password rejected like real AD');
  ok(has(run('DC01', "Set-ADAccountPassword -Identity cmendoza -NewPassword (ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force)"), '-Reset'), 'missing -Reset explained');
  ok(has(run('DC01', '$pw = ConvertTo-SecureString "Temp#2026pw" -AsPlainText -Force'), '') && run('DC01', 'Set-ADAccountPassword -Identity cmendoza -Reset -NewPassword $pw').out === '', 'variables work for passwords');
  ok(!sc.check(s, vars).ok, 'reset alone is not enough (must change at logon)');
  ok(run('DC01', 'Set-ADUser cmendoza -ChangePasswordAtLogon $true').out === '' && sc.check(s, vars).ok, 'password-reset: fixed state passes'); }
// ---- onboarding ----
{ const { s, run } = mk('ad-onboarding-new-hire'); const sc = SCENARIOS['ad-onboarding-new-hire'];
  ok(has(run('DC01', 'Get-ADOrganizationalUnit -Filter * | Select-Object Name,DistinguishedName'), 'OU=Finance,OU=Corp Users,DC=corp,DC=local'), 'OU list shows department OU');
  ok(has(run('DC01', "New-ADUser -Name 'Jordan Ellis' -SamAccountName jellis -Enabled $true"), 'unwilling to process'), 'enabling without password fails like real AD');
  ok(has(run('DC01', "New-ADUser -Name 'Jordan Ellis' -SamAccountName jellis -Path 'OU=Nowhere,DC=corp,DC=local'"), 'Directory object not found'), 'bad OU path rejected');
  ok(run('DC01', "New-ADUser -Name 'Jordan Ellis' -SamAccountName jellis -GivenName Jordan -Surname Ellis -Path 'OU=Finance,OU=Corp Users,DC=corp,DC=local' -AccountPassword (ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force) -Enabled $true -ChangePasswordAtLogon $true").out === '', 'New-ADUser full command works');
  ok(!sc.check(s, vars).ok, 'not done until in the department group');
  ok(has(run('DC01', 'Add-ADGroupMember -Identity GG-Finance -Members jellis'), '') && sc.check(s, vars).ok, 'onboarding: fixed state passes');
  ok(has(run('DC01', 'Get-ADPrincipalGroupMembership jellis | Select-Object -ExpandProperty name'), 'GG-Finance'), 'group membership readable');
  ok(has(run('DC01', 'Get-ADUser jellis -Properties MemberOf'), 'MemberOf'), 'MemberOf property available'); }
// ---- APIPA ----
{ const { s, run } = mk('dns-apipa'); const sc = SCENARIOS['dns-apipa'];
  ok(has(run('WS01', 'ipconfig'), '169.254.') , 'ipconfig shows 169.254 address');
  ok(has(run('WS01', 'ping 10.0.10.10'), 'General failure'), 'ping fails with APIPA');
  ok(has(run('WS01', 'ipconfig /renew'), 'unable to contact your DHCP server'), 'renew fails while service stopped');
  ok(has(run('DC01', 'Get-Service DHCPServer'), 'Stopped'), 'Get-Service shows Stopped');
  ok(has(run('DC01', "Get-Service | Where-Object {$_.Status -eq 'Stopped'}"), 'DHCPServer'), 'Where-Object filters services');
  ok(run('DC01', 'Start-Service DHCPServer').out === '' && has(run('DC01', 'Get-Service dhcpserver'), 'Running'), 'Start-Service works (case-insensitive name)');
  ok(!sc.check(s, vars).ok, 'not fixed until client renews');
  ok(has(run('WS01', 'ipconfig /renew'), '10.0.10.50'), 'renew gives 10.0.10.50'); ok(sc.check(s, vars).ok, 'apipa: fixed state passes');
  ok(has(run('WS01', 'ping 10.0.10.10'), 'Reply from'), 'ping works after fix');
  ok(has(run('DC01', 'Get-DhcpServerv4ScopeStatistics -ScopeId 10.0.10.0'), 'InUse'), 'scope statistics'); }
// ---- wrong DNS ----
{ const { s, run } = mk('dns-wrong-client-dns'); const sc = SCENARIOS['dns-wrong-client-dns'];
  ok(has(run('WS01', 'ipconfig /all'), '8.8.8.8'), 'ipconfig /all shows 8.8.8.8');
  ok(has(run('WS01', 'nslookup dc01.corp.local'), "can't find dc01.corp.local"), 'nslookup of domain name fails via public DNS');
  ok(has(run('WS01', 'nslookup google.com'), '142.250'), 'public names still resolve');
  ok(has(run('DC01', 'Set-DhcpServerv4OptionValue -DnsServer 10.0.10.10'), 'add -ScopeId'), 'ScopeId hint');
  ok(run('DC01', 'Set-DhcpServerv4OptionValue -ScopeId 10.0.10.0 -DnsServer 10.0.10.10').out === '', 'option 006 changed');
  ok(!sc.check(s, vars).ok, 'client still has old DNS until renew');
  run('WS01', 'ipconfig /renew'); ok(sc.check(s, vars).ok, 'DNS fixed via DHCP + renew');
  ok(has(run('WS01', 'nslookup dc01.corp.local'), '10.0.10.10'), 'nslookup now resolves'); }
{ const { s, run } = mk('dns-wrong-client-dns'); const sc = SCENARIOS['dns-wrong-client-dns'];
  ok(run('WS01', 'Set-DnsClientServerAddress -InterfaceAlias Ethernet0 -ServerAddresses 10.0.10.10').out === '' && sc.check(s, vars).ok, 'alternative fix: client DNS set directly');
  ok(has(run('WS01', 'Resolve-DnsName dc01.corp.local'), '10.0.10.10'), 'Resolve-DnsName works');
  ok(has(run('WS01', 'Get-DnsClientServerAddress'), '10.0.10.10'), 'Get-DnsClientServerAddress shows value'); }
// ---- parser / general ----
{ const { run } = mk('ad-password-reset');
  ok(has(run('DC01', 'Get-ADUser cmendoza -Foo'), 'parameter cannot be found'), 'unknown parameter message');
  ok(has(run('DC01', 'Get-ADUser nobody'), "Cannot find an object with identity: 'nobody'"), 'unknown user message');
  ok(has(run('DC01', "Get-ADUser -Filter \"Name -like '*Clara*'\" | Select-Object Name"), 'Clara Mendoza'), '-like filter and Select-Object');
  ok(has(run('DC01', "Get-ADUser -Filter 'Department -eq \"Finance\"' | Sort-Object Name -Descending | Select-Object -First 1 SamAccountName"), 'tnovak'), 'department filter, sort, first');
  ok(has(run('DC01', "Get-ADUser -Filter * -Properties Department | Where-Object {$_.Enabled -eq $true -and $_.Department -eq 'Sales'} | Select-Object Name"), 'Sophia Chen'), 'Where-Object with -and');
  ok(has(run('DC01', 'Get-Help Unlock-ADAccount'), 'EXAMPLES'), 'Get-Help shows examples'); ok(has(run('WS01', 'help cmdkey'), 'cmdkey /list'), 'help alias works');
  ok(has(run('DC01', 'Get-Command *ADUser*'), 'Get-ADUser'), 'Get-Command wildcard');
  ok(has(run('DC01', "echo 'hello'"), 'hello'), 'echo alias');
  ok(run('DC01', 'cls').clear === true, 'cls clears');
  ok(has(run('DC01', "Get-ADUser 'cmendoza"), 'incomplete'), 'unterminated string explained');
  ok(has(run('DC01', 'hostname'), 'DC01') && has(run('WS01', 'whoami'), 'corp\\cmendoza'), 'hostname and whoami per machine');
  ok(has(run('DC01', 'Get-ADDefaultDomainPasswordPolicy'), 'LockoutThreshold'), 'password policy');
  ok(has(run('DC01', 'Get-ADUser cmendoza | Format-Table Name,Enabled'), '----'), 'Format-Table output');
  ok(run('DC01', '').out === '', 'empty line is fine');
  ok(has(run('DC01', 'Remove-ADUser cmendoza'), 'not recognized'), 'unsupported command is explained, not crash'); }
console.log(`sim unit tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
