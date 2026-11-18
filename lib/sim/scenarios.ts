import type { Scenario, SimState, SimVars } from './types';
import { createBase, type BaseInput } from './state';

const ev = (s: SimState, user: string, caller: string) => { s.events = ['8:47:12 AM', '8:31:55 AM', '8:16:40 AM'].map((t) => ({ id: 4740, time: `11/16/2026 ${t}`, user, caller })); };
const find = (s: SimState, sam: string) => s.users.find((u) => u.sam.toLowerCase() === sam.toLowerCase());

export const SCENARIOS: Record<string, Scenario> = {
  'ad-lockout-stale-creds': {
    blueprintId: 'ad-lockout-stale-creds', start: 'DC01',
    guide: [
      { cmd: 'Get-ADUser', why: 'Check whether the account is locked.', example: 'Get-ADUser -Identity {user} -Properties LockedOut', machine: 'DC01' },
      { cmd: 'Get-WinEvent', why: 'Event 4740 says which computer caused the lockout.', example: "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740} | Format-List TimeCreated,Message", machine: 'DC01' },
      { cmd: 'Unlock-ADAccount', why: 'Unlock the account.', example: 'Unlock-ADAccount -Identity {user}', machine: 'DC01' },
      { cmd: 'cmdkey', why: 'List saved passwords on the computer that caused the lockout.', example: 'cmdkey /list', machine: 'WS01' },
      { cmd: 'cmdkey', why: 'Remove the stale saved password.', example: 'cmdkey /delete:Domain:target=<name from the list>', machine: 'WS01' },
    ],
    reality: 'In a real domain the lockout event is written on the PDC emulator, and the source can be a phone, a mapped drive, a scheduled task or a service. Tools like the Microsoft Account Lockout Status tool help. The idea is the same: unlock, find the caller, remove the old password.',
    setup(s, v) { const u = find(s, v.user)!; u.locked = true; ev(s, u.sam, 'WS01'); s.creds = [{ target: `Domain:target=${v.fshost}`, user: `${s.netbios}\\${u.sam}` }]; s.sessionUser = u.sam; },
    check(s, v) { const u = find(s, v.user)!; const stale = s.creds.some((c) => c.user.toLowerCase().endsWith(`\\${u.sam.toLowerCase()}`)); return { ok: !u.locked && !stale, facts: [`${u.sam} LockedOut=${u.locked}`, stale ? 'stale saved credential still present on WS01' : 'stale saved credential removed from WS01'] }; },
  },
  'ad-password-reset': {
    blueprintId: 'ad-password-reset', start: 'DC01',
    guide: [
      { cmd: 'Get-ADUser', why: 'Look at the account first.', example: 'Get-ADUser -Identity {user} -Properties PasswordLastSet,LockedOut', machine: 'DC01' },
      { cmd: 'Set-ADAccountPassword', why: 'Reset the password (needs a secure string).', example: "Set-ADAccountPassword -Identity {user} -Reset -NewPassword (ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force)", machine: 'DC01' },
      { cmd: 'Set-ADUser', why: 'Make the user choose a new password at next sign-in.', example: 'Set-ADUser -Identity {user} -ChangePasswordAtLogon $true', machine: 'DC01' },
    ],
    reality: 'Real help desks verify identity first (callback, manager approval, ticket system) and never keep temporary passwords. Many companies use self-service reset instead.',
    setup(s, v) { const u = find(s, v.user)!; u.mustChange = false; u.enabled = true; },
    check(s, v) { const u = find(s, v.user)!; return { ok: u.pwdResets >= 1 && u.mustChange && u.enabled, facts: [`${u.sam} password reset count=${u.pwdResets}`, `ChangePasswordAtLogon=${u.mustChange}`] }; },
  },
  'ad-onboarding-new-hire': {
    blueprintId: 'ad-onboarding-new-hire', start: 'DC01',
    guide: [
      { cmd: 'Get-ADOrganizationalUnit', why: 'Find the OU path for the department.', example: 'Get-ADOrganizationalUnit -Filter * | Select-Object Name,DistinguishedName', machine: 'DC01' },
      { cmd: 'New-ADUser', why: 'Create the account in that OU with a password and enable it.', example: "New-ADUser -Name '{newName}' -SamAccountName {newUser} -Path '<OU path>' -AccountPassword (ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force) -Enabled $true -ChangePasswordAtLogon $true", machine: 'DC01' },
      { cmd: 'Add-ADGroupMember', why: 'Give folder access through the department group.', example: 'Add-ADGroupMember -Identity GG-{dept} -Members {newUser}', machine: 'DC01' },
      { cmd: 'Get-ADUser', why: 'Check your work.', example: 'Get-ADUser -Identity {newUser} -Properties MemberOf', machine: 'DC01' },
    ],
    reality: 'Real onboarding adds mailbox, licenses, home folder and often runs from a template or HR system. Naming and OU rules differ per company.',
    setup(s, v) { s.users = s.users.filter((u) => u.sam.toLowerCase() !== v.newUser.toLowerCase()); },
    check(s, v) { const u = find(s, v.newUser); const ou = `OU=${v.dept},OU=Corp Users,${s.dn}`; const ok = !!u && u.enabled && u.ou.toLowerCase() === ou.toLowerCase() && u.groups.includes(`GG-${v.dept}`) && u.mustChange;
      return { ok, facts: u ? [`${u.sam} exists, enabled=${u.enabled}, OU ${u.ou === ou ? 'correct' : 'wrong'}, in GG-${v.dept}=${u.groups.includes(`GG-${v.dept}`)}, mustChange=${u.mustChange}`] : [`${v.newUser} does not exist yet`] }; },
  },
  'dns-apipa': {
    blueprintId: 'dns-apipa', start: 'WS01',
    guide: [
      { cmd: 'ipconfig', why: 'See the current address (169.254.x.x means no DHCP lease).', example: 'ipconfig /all', machine: 'WS01' },
      { cmd: 'Get-Service', why: 'Is the DHCP server service running?', example: 'Get-Service DHCPServer', machine: 'DC01' },
      { cmd: 'Start-Service', why: 'Start the service.', example: 'Start-Service DHCPServer', machine: 'DC01' },
      { cmd: 'Get-DhcpServerv4Scope', why: 'Check the scope is Active.', example: 'Get-DhcpServerv4Scope', machine: 'DC01' },
      { cmd: 'ipconfig', why: 'Ask for a new lease from the client.', example: 'ipconfig /renew', machine: 'WS01' },
    ],
    reality: 'In real labs APIPA can also come from a wrong network adapter setting, a disconnected virtual switch or a scope with no free addresses. Always check the physical or virtual link first.',
    setup(s, v) { s.services.DC01.DHCPServer = 'Stopped'; s.ws.lease = 'apipa'; s.ws.dns = []; s.sessionUser = v.user; },
    check(s) { const ok = s.ws.lease === 'ok' && s.services.DC01.DHCPServer === 'Running' && s.dhcp.scopeState === 'Active'; return { ok, facts: [`WS01 lease=${s.ws.lease}`, `DHCPServer=${s.services.DC01.DHCPServer}`, `scope=${s.dhcp.scopeState}`] }; },
  },
  'dns-wrong-client-dns': {
    blueprintId: 'dns-wrong-client-dns', start: 'WS01',
    guide: [
      { cmd: 'ipconfig', why: 'See which DNS server the client uses.', example: 'ipconfig /all', machine: 'WS01' },
      { cmd: 'nslookup', why: 'Test whether the domain name resolves.', example: 'nslookup dc01.{domain}', machine: 'WS01' },
      { cmd: 'Get-DhcpServerv4OptionValue', why: 'See what DNS server the DHCP scope hands out (option 006).', example: 'Get-DhcpServerv4OptionValue -ScopeId {scope}', machine: 'DC01' },
      { cmd: 'Set-DhcpServerv4OptionValue', why: 'Point the scope at the domain controller.', example: 'Set-DhcpServerv4OptionValue -ScopeId {scope} -DnsServer {dc}', machine: 'DC01' },
      { cmd: 'ipconfig', why: 'Get the new setting on the client.', example: 'ipconfig /renew', machine: 'WS01' },
      { cmd: 'Set-DnsClientServerAddress', why: 'Alternative: set the DNS server on the client directly.', example: 'Set-DnsClientServerAddress -InterfaceAlias Ethernet0 -ServerAddresses {dc}', machine: 'WS01' },
    ],
    reality: 'Domain-joined computers must use the domain controller (or an AD-aware DNS server) as their DNS server. Real networks forward outside names from the DC to the internet, so users never need a public DNS on the client.',
    setup(s, v) { s.dhcp.dns = ['8.8.8.8']; s.ws.dns = ['8.8.8.8']; s.ws.dnsStatic = false; s.sessionUser = v.user; },
    check(s) { const ok = s.ws.dns[0] === s.dcIp && !s.ws.dns.includes('8.8.8.8'); return { ok, facts: [`WS01 DNS servers=${s.ws.dns.join(',')}`, `DHCP option 006=${s.dhcp.dns.join(',')}`] }; },
  },
};
export const CONSOLE_READY = new Set(Object.keys(SCENARIOS));

export function createSession(blueprintId: string, base: BaseInput, vars: SimVars): SimState {
  const sc = SCENARIOS[blueprintId]; if (!sc) throw new Error('no console scenario');
  const s = createBase(base); sc.setup(s, vars); return s;
}
export function fillGuide(g: string, v: SimVars, s: SimState) {
  const map: Record<string, string> = { user: v.user, newName: v.newName, newUser: v.newUser, dept: v.dept, domain: s.domain, dc: s.dcIp, scope: s.dhcp.scopeId };
  return g.replace(/\{(\w+)\}/g, (m, k: string) => map[k] ?? m);
}
