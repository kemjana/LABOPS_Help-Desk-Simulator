import { SimError, type Machine, type Obj, type SimState, type SimUser } from './types';
import { formatAuto, formatList, formatTable } from './format';
import { maskOf, SERVICE_NAMES } from './state';

export interface P { n: string; sw?: boolean; pos?: number; al?: string[] }
export interface Env { s: SimState; m: Machine }
export type Bound = Record<string, any> & { _pipe?: Obj[]; _raw?: string[]; _name: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Cmd {
  name: string; alias?: string[]; on: Machine | 'both'; summary: string; params: P[]; examples: string[];
  raw?: boolean; pipeOnly?: boolean; pipeId?: boolean; run: (a: Bound, e: Env) => unknown;
}
const NOW = '11/16/2026 9:02:41 AM';
const bool = (v: unknown) => v === true || /^(true|1|\$true)$/i.test(String(v));
const arr = (v: unknown): string[] => (v === undefined || v === null ? [] : (Array.isArray(v) ? v : [v]).map((x) => String(x)));
const guid = (s: string) => { let h = 0x811c9dc5; const hex: string[] = []; for (let i = 0; i < 32; i++) { h = Math.imul(h ^ (s.charCodeAt(i % s.length) + i), 16777619) >>> 0; hex.push((h & 15).toString(16)); } const x = hex.join(''); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`; };
const sid = (s: string) => { let h = 7; for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return `S-1-5-21-3623811015-3361044348-30300820-${1100 + (h % 8000)}`; };
const dnOf = (u: SimUser) => `CN=${u.name},${u.ou}`;

export function idOf(v: unknown): string {
  if (v && typeof v === 'object') { const o = v as Obj; return String(o.SamAccountName ?? o.Name ?? ''); }
  return String(v ?? '');
}
export function findUser(s: SimState, id: unknown, cmd = 'Get-ADUser'): SimUser {
  const k = idOf(id).toLowerCase(); if (!k) throw new SimError(`${cmd} : Cannot validate argument on parameter 'Identity'. The argument is null or empty.`);
  const u = s.users.find((x) => x.sam.toLowerCase() === k || x.name.toLowerCase() === k || dnOf(x).toLowerCase() === k);
  if (!u) throw new SimError(`${cmd} : Cannot find an object with identity: '${idOf(id)}' under: '${s.dn}'.`);
  return u;
}
const findGroup = (s: SimState, id: unknown, cmd: string) => {
  const g = s.groups.find((x) => x.toLowerCase() === idOf(id).toLowerCase());
  if (!g) throw new SimError(`${cmd} : Cannot find an object with identity: '${idOf(id)}' under: '${s.dn}'.`); return g;
};
export const wild = (pat: string, val: string) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(val);

// ---- conditions for -Filter and Where-Object ----
export function cond(expr: string, get: (prop: string) => unknown): boolean {
  const e = expr.trim(); if (e === '*') return true;
  const re = /(?:\$_\.)?([A-Za-z]+)\s+-(eq|ne|like|notlike|match|gt|lt|ge|le|contains|ceq)\s+('(?:[^']|'')*'|"[^"]*"|\$true|\$false|\$null|[^\s)]+)/gi;
  const parts: { ok: boolean; join: string }[] = []; let m: RegExpExecArray | null; let last = 0; let join = 'and';
  while ((m = re.exec(e))) {
    const between = e.slice(last, m.index).trim().toLowerCase(); if (between.includes('-or')) join = 'or'; else if (between.includes('-and')) join = 'and';
    let raw = m[3]; let val: unknown = raw;
    if (/^\$?true$/i.test(raw)) val = true; else if (/^\$?false$/i.test(raw)) val = false; else if (/^\$null$/i.test(raw)) val = null; else if (/^['"]/.test(raw)) val = raw.slice(1, -1).replace(/''/g, "'");
    const lhs = get(m[1]); const op = m[2].toLowerCase();
    const a = typeof lhs === 'boolean' ? lhs : lhs === null || lhs === undefined ? '' : String(lhs).toLowerCase(); const b = typeof val === 'boolean' ? val : val === null ? '' : String(val).toLowerCase();
    let ok = false;
    if (op === 'eq' || op === 'ceq') ok = a === b; else if (op === 'ne') ok = a !== b;
    else if (op === 'like') ok = wild(String(val), String(a)); else if (op === 'notlike') ok = !wild(String(val), String(a));
    else if (op === 'match') ok = new RegExp(String(val), 'i').test(String(a)); else if (op === 'contains') ok = Array.isArray(lhs) && lhs.map((x) => String(x).toLowerCase()).includes(String(b));
    else { const x = Number(a); const y = Number(b); ok = op === 'gt' ? x > y : op === 'lt' ? x < y : op === 'ge' ? x >= y : x <= y; }
    parts.push({ ok, join }); last = re.lastIndex; raw = '';
  }
  if (!parts.length) throw new SimError(`Filter syntax not understood: ${expr}. Try: -Filter "SamAccountName -eq 'name'"`);
  return parts.slice(1).reduce((acc, p) => (p.join === 'or' ? acc || p.ok : acc && p.ok), parts[0].ok);
}
const userProp = (u: SimUser, s: SimState, p: string): unknown => ({
  samaccountname: u.sam, name: u.name, givenname: u.given, surname: u.sur, enabled: u.enabled, lockedout: u.locked, department: u.dept, title: u.title,
  userprincipalname: `${u.sam}@${s.domain}`, distinguishedname: dnOf(u), memberof: u.groups.filter((g) => g !== 'Domain Users').map((g) => `CN=${g},CN=Users,${s.dn}`),
  passwordneverexpires: false, objectclass: 'user',
} as Record<string, unknown>)[p.toLowerCase()];

function userObj(u: SimUser, s: SimState, props: string[]): Obj {
  const base: Obj = { DistinguishedName: dnOf(u), Enabled: u.enabled, GivenName: u.given, Name: u.name, ObjectClass: 'user', ObjectGUID: guid(u.sam), SamAccountName: u.sam, SID: sid(u.sam), Surname: u.sur, UserPrincipalName: `${u.sam}@${s.domain}` };
  const all: Obj = { ...base, LockedOut: u.locked, PasswordLastSet: u.pwdLast, PasswordNeverExpires: false, AccountExpirationDate: u.expires, Department: u.dept, Title: u.title,
    MemberOf: u.groups.filter((g) => g !== 'Domain Users').map((g) => `CN=${g},CN=Users,${s.dn}`), BadLogonCount: u.locked ? 3 : 0, LastBadPasswordAttempt: u.locked ? '11/16/2026 8:47:12 AM' : null, CanonicalName: `${s.domain}/${u.ou.replace(/,DC=.*/, '').split(',').reverse().map((x) => x.slice(3)).join('/')}/${u.name}`, Description: '' };
  const out: Obj = { ...base };
  const want = props.includes('*') ? Object.keys(all) : props;
  for (const p of want) { const k = Object.keys(all).find((x) => x.toLowerCase() === p.toLowerCase()); if (k) out[k] = all[k]; }
  const keys = Object.keys(out).sort((a, b) => a.localeCompare(b));
  const sorted: Obj = {}; keys.forEach((k) => (sorted[k] = out[k]));
  sorted.__default = keys; sorted.__view = keys.length <= 4 ? 'table' : 'list'; sorted.__t = 'user';
  return sorted;
}
const svcObj = (m: string, name: string, st: string): Obj => ({ Status: st, Name: name, DisplayName: SERVICE_NAMES[name] || name, __default: ['Status', 'Name', 'DisplayName'], __view: 'table' });
const SECURE = (pw: string): Obj => ({ __secure: pw, __default: ['__secure'] });
const complex = (pw: string, sam: string, min: number) => {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  return pw.length >= min && classes >= 3 && !pw.toLowerCase().includes(sam.toLowerCase());
};
const mn = (s: SimState, m: Machine) => (m === 'DC01' ? { ip: s.dcIp, dns: [s.dcIp], gw: s.gw, dhcp: false, lease: 'ok' as const } : { ip: s.ws.lease === 'apipa' ? s.ws.apipaIp : s.ws.lease === 'released' ? '' : s.ws.ip, dns: s.ws.lease === 'ok' ? s.ws.dns : s.ws.dnsStatic ? s.ws.dns : [], gw: s.ws.lease === 'ok' ? s.ws.gw : '', dhcp: !s.ws.dnsStatic, lease: s.ws.lease });
// resolver used by nslookup / Resolve-DnsName / ping
function resolve(s: SimState, m: Machine, name: string): { server: string; addr: string | null; srvName: string } {
  const dns = mn(s, m).dns; const server = dns[0];
  if (!server) throw new SimError('DNS request timed out.\n    timeout was 2 seconds.');
  const n = name.toLowerCase().replace(/\.$/, '');
  const internal: Record<string, string> = { [`dc01.${s.domain}`]: s.dcIp, [`dc01`]: s.dcIp, [s.domain]: s.dcIp, [`ws01.${s.domain}`]: `${s.prefix}.50`, [`fs01.${s.domain}`]: s.fsIp, [`${s.fsHost.toLowerCase()}.${s.domain}`]: s.fsIp };
  const isDc = server === s.dcIp || server === '127.0.0.1';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(n)) return { server, addr: n, srvName: isDc ? 'UnKnown' : 'dns.google' };
  if (isDc) { if (internal[n]) return { server, addr: internal[n], srvName: 'UnKnown' }; if (!n.endsWith(s.domain.toLowerCase()) && n.includes('.')) return { server, addr: '142.250.80.46', srvName: 'UnKnown' }; return { server, addr: null, srvName: 'UnKnown' }; }
  if (n.endsWith(s.domain.toLowerCase()) || !n.includes('.')) return { server, addr: null, srvName: server === '8.8.8.8' ? 'dns.google' : 'UnKnown' };
  return { server, addr: '142.250.80.46', srvName: server === '8.8.8.8' ? 'dns.google' : 'UnKnown' };
}
const dotted = (label: string) => (label + '. '.repeat(20)).slice(0, 34);
const ipconfig = (s: SimState, m: Machine, all: boolean): string => {
  const c = mn(s, m); const apipa = c.lease === 'apipa'; const mask = maskOf(s.maskBits);
  const L = (label: string, v: string) => `   ${dotted(label)}: ${v}`;
  const rows: string[] = ['', 'Windows IP Configuration', ''];
  if (all) rows.push(L('Host Name ', m), L('Primary Dns Suffix  ', s.domain), L('Node Type ', 'Hybrid'), L('IP Routing Enabled', 'No'), '');
  rows.push('Ethernet adapter Ethernet0:', '');
  if (c.lease === 'released') return rows.concat([L('Connection-specific DNS Suffix  ', ''), L('Link-local IPv6 Address ', 'fe80::a1b2:4c3d:5e6f:7081%6')]).join('\n') + '\n';
  rows.push(L('Connection-specific DNS Suffix  ', apipa ? '' : s.domain));
  if (all) rows.push(L('Description ', 'Intel(R) PRO/1000 MT Desktop Adapter'), L('Physical Address', `08-00-27-${m === 'DC01' ? 'A1-10-01' : 'B2-50-02'}`), L('DHCP Enabled', m === 'DC01' ? 'No' : 'Yes'), L('Autoconfiguration Enabled ', 'Yes'));
  rows.push(L(apipa ? 'Autoconfiguration IPv4 Address' : 'IPv4 Address', c.ip + (all ? '(Preferred)' : '')), L('Subnet Mask ', apipa ? '255.255.0.0' : mask), L('Default Gateway ', c.gw));
  if (all && m === 'WS01' && !apipa) rows.push(L('DHCP Server ', s.dcIp), L('Lease Obtained', NOW));
  if (all) rows.push(L('DNS Servers ', c.dns.join('\n' + ' '.repeat(38))));
  return rows.join('\n') + '\n';
};
const table = (rows: Obj[], cols: string[]) => rows.map((r) => ({ ...r, __default: cols, __view: 'table' }));
const mkObj = (o: Obj, cols: string[], view: 'table' | 'list' = 'list'): Obj => ({ ...o, __default: cols, __view: view });
const scopeObj = (s: SimState): Obj => mkObj({ ScopeId: s.dhcp.scopeId, SubnetMask: maskOf(s.maskBits), Name: 'LabOps Scope', State: s.dhcp.scopeState, StartRange: s.dhcp.start, EndRange: s.dhcp.end, LeaseDuration: '08:00:00' }, ['ScopeId', 'SubnetMask', 'Name', 'State', 'StartRange', 'EndRange', 'LeaseDuration'], 'table');
const needScope = (s: SimState, v: unknown, cmd: string) => { if (!v) throw new SimError(`${cmd} : This lab edits scope options. [LabOps tip] Add -ScopeId ${s.dhcp.scopeId}`); if (String(v) !== s.dhcp.scopeId) throw new SimError(`${cmd} : The specified scope does not exist on the DHCP server. [LabOps tip] The scope in this lab is ${s.dhcp.scopeId}`); };
const svcSet = (s: SimState, m: Machine, names: string[], to: 'Running' | 'Stopped', cmd: string) => names.forEach((n) => { const key = Object.keys(s.services[m]).find((k) => k.toLowerCase() === n.toLowerCase() || (SERVICE_NAMES[k] || '').toLowerCase() === n.toLowerCase()); if (!key) throw new SimError(`${cmd} : Cannot find any service with service name '${n}'.`); s.services[m][key] = to; });
const ID: P = { n: 'Identity', pos: 0, al: ['Id'] };

export const COMMANDS: Cmd[] = [
  // ---------- Active Directory (DC01) ----------
  { name: 'Get-ADUser', on: 'DC01', summary: 'Gets one or more Active Directory users.', params: [ID, { n: 'Filter', al: ['f'] }, { n: 'Properties', pos: 1, al: ['prop'] }, { n: 'SearchBase' }], examples: ["Get-ADUser -Identity cmendoza -Properties LockedOut", "Get-ADUser -Filter \"Department -eq 'Finance'\"", 'Get-ADUser -Filter * | Select-Object SamAccountName,Enabled'],
    run: (a, { s }) => { const props = arr(a.Properties).flatMap((x) => x.split(',')); if (a.Identity !== undefined) return [userObj(findUser(s, a.Identity), s, props)];
      if (a.Filter === undefined) throw new SimError('Get-ADUser : Either -Identity or -Filter is required. [LabOps tip] Try -Identity name, or -Filter *');
      const list = s.users.filter((u) => cond(String(a.Filter), (p) => userProp(u, s, p))); return list.map((u) => userObj(u, s, props)); } },
  { name: 'Set-ADUser', on: 'DC01', summary: 'Modifies an Active Directory user.', pipeId: true, params: [ID, { n: 'ChangePasswordAtLogon' }, { n: 'Enabled' }, { n: 'Department' }, { n: 'Title' }, { n: 'AccountExpirationDate' }], examples: ['Set-ADUser -Identity cmendoza -ChangePasswordAtLogon $true', "Set-ADUser -Identity cmendoza -Department 'Finance'"],
    run: (a, { s }) => { const u = findUser(s, a.Identity, 'Set-ADUser'); if (a.ChangePasswordAtLogon !== undefined) u.mustChange = bool(a.ChangePasswordAtLogon); if (a.Enabled !== undefined) u.enabled = bool(a.Enabled); if (a.Department !== undefined) u.dept = String(a.Department); if (a.Title !== undefined) u.title = String(a.Title); if (a.AccountExpirationDate !== undefined) u.expires = a.AccountExpirationDate === null ? null : String(a.AccountExpirationDate); } },
  { name: 'Unlock-ADAccount', on: 'DC01', summary: 'Unlocks an Active Directory account.', pipeId: true, params: [ID], examples: ['Unlock-ADAccount -Identity cmendoza'], run: (a, { s }) => { findUser(s, a.Identity, 'Unlock-ADAccount').locked = false; } },
  { name: 'Enable-ADAccount', on: 'DC01', summary: 'Enables an Active Directory account.', pipeId: true, params: [ID], examples: ['Enable-ADAccount -Identity cmendoza'], run: (a, { s }) => { findUser(s, a.Identity, 'Enable-ADAccount').enabled = true; } },
  { name: 'Disable-ADAccount', on: 'DC01', summary: 'Disables an Active Directory account.', pipeId: true, params: [ID], examples: ['Disable-ADAccount -Identity cmendoza'], run: (a, { s }) => { findUser(s, a.Identity, 'Disable-ADAccount').enabled = false; } },
  { name: 'ConvertTo-SecureString', on: 'both', summary: 'Converts plain text to a secure string (needed for passwords).', params: [{ n: 'String', pos: 0 }, { n: 'AsPlainText', sw: true }, { n: 'Force', sw: true }], examples: ["ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force"],
    run: (a) => { if (!a.AsPlainText || !a.Force) throw new SimError('ConvertTo-SecureString : You must use both -AsPlainText and -Force when converting plain text.'); return SECURE(String(a.String ?? '')); } },
  { name: 'Set-ADAccountPassword', on: 'DC01', summary: 'Resets or changes the password of an account.', params: [ID, { n: 'Reset', sw: true }, { n: 'NewPassword', pos: 1 }], examples: ["Set-ADAccountPassword -Identity cmendoza -Reset -NewPassword (ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force)"],
    run: (a, { s }) => { const u = findUser(s, a.Identity, 'Set-ADAccountPassword'); if (!a.Reset) throw new SimError('Set-ADAccountPassword : A change needs the old password. [LabOps tip] As an admin, add -Reset to set a new one.');
      const pw = (a.NewPassword as Obj | undefined)?.__secure as string | undefined; if (!pw) throw new SimError("Set-ADAccountPassword : Cannot bind -NewPassword. [LabOps tip] Use (ConvertTo-SecureString 'text' -AsPlainText -Force)");
      if (!complex(pw, u.sam, s.policy.minLen)) throw new SimError(`Set-ADAccountPassword : The password does not meet the length, complexity, or history requirement of the domain. [LabOps tip] Use ${s.policy.minLen}+ characters with 3 of: upper, lower, number, symbol.`);
      u.pwdResets++; u.pwdLast = NOW; } },
  { name: 'New-ADUser', on: 'DC01', summary: 'Creates a new Active Directory user.', params: [{ n: 'Name', pos: 0 }, { n: 'SamAccountName' }, { n: 'GivenName' }, { n: 'Surname' }, { n: 'UserPrincipalName' }, { n: 'Path' }, { n: 'AccountPassword' }, { n: 'Enabled' }, { n: 'ChangePasswordAtLogon' }, { n: 'Department' }], examples: ["New-ADUser -Name 'Jordan Ellis' -SamAccountName jellis -GivenName Jordan -Surname Ellis -Path 'OU=Finance,OU=Corp Users,DC=corp,DC=local' -AccountPassword (ConvertTo-SecureString 'Temp#2026pw' -AsPlainText -Force) -Enabled $true -ChangePasswordAtLogon $true"],
    run: (a, { s }) => { if (!a.Name) throw new SimError('New-ADUser : Cannot validate argument on parameter Name.'); const sam = String(a.SamAccountName ?? String(a.Name).replace(/\s/g, '').toLowerCase());
      if (s.users.some((u) => u.sam.toLowerCase() === sam.toLowerCase())) throw new SimError('New-ADUser : The specified account already exists');
      const path = String(a.Path ?? `CN=Users,${s.dn}`); if (path !== `CN=Users,${s.dn}` && !s.ous.some((o) => o.toLowerCase() === path.toLowerCase())) throw new SimError(`New-ADUser : Directory object not found. [LabOps tip] Check the OU path with Get-ADOrganizationalUnit -Filter *`);
      const enabled = bool(a.Enabled); const pw = (a.AccountPassword as Obj | undefined)?.__secure as string | undefined;
      if (enabled && !pw) throw new SimError('New-ADUser : The server is unwilling to process the request. [LabOps tip] To enable the account, give it a password with -AccountPassword');
      if (pw && !complex(pw, sam, s.policy.minLen)) throw new SimError('New-ADUser : The password does not meet the length, complexity, or history requirement of the domain.');
      s.users.push({ sam, name: String(a.Name), given: String(a.GivenName ?? ''), sur: String(a.Surname ?? ''), dept: String(a.Department ?? ''), title: '', enabled: enabled && !!pw, locked: false, mustChange: bool(a.ChangePasswordAtLogon), pwdLast: NOW, pwdResets: 0, groups: ['Domain Users'], ou: path, expires: null }); } },
  { name: 'Add-ADGroupMember', on: 'DC01', summary: 'Adds members to an Active Directory group.', params: [ID, { n: 'Members', pos: 1 }], examples: ['Add-ADGroupMember -Identity GG-Finance -Members jellis'],
    run: (a, { s }) => { const g = findGroup(s, a.Identity, 'Add-ADGroupMember'); const ms = arr(a.Members).map((x) => idOf(x)); if (!ms.length) throw new SimError('Add-ADGroupMember : Cannot validate argument on parameter Members.'); ms.forEach((m) => { const u = findUser(s, m, 'Add-ADGroupMember'); if (!u.groups.includes(g)) u.groups.push(g); }); } },
  { name: 'Get-ADGroupMember', on: 'DC01', summary: 'Lists the members of a group.', params: [ID], examples: ['Get-ADGroupMember -Identity GG-Finance'],
    run: (a, { s }) => { const g = findGroup(s, a.Identity, 'Get-ADGroupMember'); return s.users.filter((u) => u.groups.includes(g)).map((u) => mkObj({ distinguishedName: dnOf(u), name: u.name, objectClass: 'user', objectGUID: guid(u.sam), SamAccountName: u.sam, SID: sid(u.sam) }, ['distinguishedName', 'name', 'objectClass', 'objectGUID', 'SamAccountName', 'SID'], 'list')); } },
  { name: 'Get-ADGroup', on: 'DC01', summary: 'Gets groups.', params: [ID, { n: 'Filter' }], examples: ['Get-ADGroup -Filter *', 'Get-ADGroup -Identity GG-Finance'],
    run: (a, { s }) => (a.Identity !== undefined ? [findGroup(s, a.Identity, 'Get-ADGroup')] : s.groups).map((g) => mkObj({ Name: g, GroupCategory: 'Security', GroupScope: g.startsWith('GG-') ? 'Global' : 'Global', DistinguishedName: `CN=${g},CN=Users,${s.dn}` }, ['Name', 'GroupCategory', 'GroupScope', 'DistinguishedName'], 'table')) },
  { name: 'Get-ADPrincipalGroupMembership', on: 'DC01', summary: 'Lists the groups a user belongs to.', params: [ID], examples: ['Get-ADPrincipalGroupMembership cmendoza | Select-Object Name'],
    run: (a, { s }) => findUser(s, a.Identity, 'Get-ADPrincipalGroupMembership').groups.map((g) => mkObj({ distinguishedName: `CN=${g},CN=Users,${s.dn}`, GroupCategory: 'Security', GroupScope: 'Global', name: g, objectClass: 'group', SamAccountName: g }, ['distinguishedName', 'GroupCategory', 'GroupScope', 'name', 'objectClass', 'SamAccountName'], 'list')) },
  { name: 'Get-ADOrganizationalUnit', on: 'DC01', summary: 'Lists organizational units (OUs).', params: [{ n: 'Filter' }, ID], examples: ['Get-ADOrganizationalUnit -Filter * | Select-Object Name,DistinguishedName'],
    run: (_a, { s }) => s.ous.map((o) => mkObj({ Name: o.split(',')[0].slice(3), DistinguishedName: o, ObjectClass: 'organizationalUnit' }, ['Name', 'DistinguishedName', 'ObjectClass'], 'table')) },
  { name: 'Get-ADDefaultDomainPasswordPolicy', on: 'DC01', summary: 'Shows the domain password and lockout policy.', params: [], examples: ['Get-ADDefaultDomainPasswordPolicy'],
    run: (_a, { s }) => [mkObj({ ComplexityEnabled: true, DistinguishedName: s.dn, LockoutDuration: '00:30:00', LockoutObservationWindow: '00:30:00', LockoutThreshold: s.policy.lockoutThreshold, MaxPasswordAge: '42.00:00:00', MinPasswordAge: '1.00:00:00', MinPasswordLength: s.policy.minLen, PasswordHistoryCount: 24, ReversibleEncryptionEnabled: false }, ['ComplexityEnabled', 'DistinguishedName', 'LockoutDuration', 'LockoutObservationWindow', 'LockoutThreshold', 'MaxPasswordAge', 'MinPasswordAge', 'MinPasswordLength', 'PasswordHistoryCount', 'ReversibleEncryptionEnabled'], 'list')] },
  // ---------- event logs (DC01) ----------
  { name: 'Get-WinEvent', on: 'DC01', summary: 'Reads Windows event logs.', params: [{ n: 'LogName', pos: 0 }, { n: 'FilterHashtable' }, { n: 'MaxEvents' }], examples: ["Get-WinEvent -FilterHashtable @{LogName='Security';Id=4740} -MaxEvents 5", 'Get-WinEvent -FilterHashtable @{LogName="Security";Id=4740} | Format-List TimeCreated,Message'],
    run: (a, { s }) => { const f = (a.FilterHashtable as Obj | undefined) ?? {}; const log = String(f.LogName ?? a.LogName ?? ''); const id = f.Id !== undefined ? Number(f.Id) : null;
      if (!log) throw new SimError('Get-WinEvent : Specify a log, for example -FilterHashtable @{LogName=\'Security\'}'); let ev = s.events.filter((e) => log.toLowerCase() === 'security' && (id === null || e.id === id));
      if (a.MaxEvents) ev = ev.slice(0, Number(a.MaxEvents)); if (!ev.length) throw new SimError('Get-WinEvent : No events were found that match the specified selection criteria.');
      return ev.map((e) => mkObj({ TimeCreated: e.time, Id: e.id, LevelDisplayName: 'Information', ProviderName: 'Microsoft-Windows-Security-Auditing', Message: `A user account was locked out.\n\nSubject:\n\tSecurity ID:\t\tSYSTEM\n\tAccount Name:\t\tDC01$\n\tAccount Domain:\t\t${s.netbios}\n\nAccount That Was Locked Out:\n\tSecurity ID:\t\t${s.netbios}\\${e.user}\n\tAccount Name:\t\t${e.user}\n\nAdditional Information:\n\tCaller Computer Name:\t${e.caller}` }, ['TimeCreated', 'Id', 'LevelDisplayName', 'Message'], 'table')); } },
  { name: 'Get-EventLog', on: 'DC01', summary: 'Reads classic event logs (older command).', params: [{ n: 'LogName', pos: 0 }, { n: 'InstanceId' }, { n: 'Newest' }], examples: ['Get-EventLog -LogName Security -InstanceId 4740 -Newest 5'],
    run: (a, { s }) => { let ev = s.events.filter((e) => String(a.LogName).toLowerCase() === 'security' && (a.InstanceId === undefined || e.id === Number(a.InstanceId))); if (a.Newest) ev = ev.slice(0, Number(a.Newest)); if (!ev.length) throw new SimError('Get-EventLog : No matches found');
      return ev.map((e, i) => mkObj({ Index: 900 - i, Time: e.time, EntryType: 'SuccessAudit', Source: 'Microsoft-Windows-Security-Auditing', InstanceID: e.id, Message: `A user account was locked out. Account Name: ${e.user}. Caller Computer Name: ${e.caller}` }, ['Index', 'Time', 'EntryType', 'Source', 'InstanceID', 'Message'], 'table')); } },
  // ---------- DHCP (DC01) ----------
  { name: 'Get-DhcpServerv4Scope', on: 'DC01', summary: 'Shows DHCP scopes.', params: [{ n: 'ScopeId', pos: 0 }], examples: ['Get-DhcpServerv4Scope'], run: (_a, { s }) => [scopeObj(s)] },
  { name: 'Get-DhcpServerv4ScopeStatistics', on: 'DC01', summary: 'Shows how many addresses are free or in use.', params: [{ n: 'ScopeId', pos: 0 }], examples: ['Get-DhcpServerv4ScopeStatistics -ScopeId 10.0.10.0'],
    run: (a, { s }) => { needScope(s, a.ScopeId, 'Get-DhcpServerv4ScopeStatistics'); const used = s.ws.lease === 'ok' ? 1 : 0; return [mkObj({ ScopeId: s.dhcp.scopeId, Free: 101 - used, InUse: used, PercentageInUse: used ? 0.99 : 0, Reserved: 0 }, ['ScopeId', 'Free', 'InUse', 'PercentageInUse', 'Reserved'], 'table')]; } },
  { name: 'Get-DhcpServerv4OptionValue', on: 'DC01', summary: 'Shows the options (router, DNS...) handed out by a scope.', params: [{ n: 'ScopeId', pos: 0 }, { n: 'OptionId' }], examples: ['Get-DhcpServerv4OptionValue -ScopeId 10.0.10.0'],
    run: (a, { s }) => { needScope(s, a.ScopeId, 'Get-DhcpServerv4OptionValue'); const rows = [mkObj({ OptionId: 3, Name: 'Router', Type: 'IPv4Address', Value: s.dhcp.router }, ['OptionId', 'Name', 'Type', 'Value'], 'table'), mkObj({ OptionId: 6, Name: 'DNS Servers', Type: 'IPv4Address', Value: s.dhcp.dns.join(', ') }, ['OptionId', 'Name', 'Type', 'Value'], 'table'), mkObj({ OptionId: 15, Name: 'DNS Domain Name', Type: 'String', Value: s.domain }, ['OptionId', 'Name', 'Type', 'Value'], 'table')];
      return a.OptionId ? rows.filter((r) => String(r.OptionId) === String(a.OptionId)) : rows; } },
  { name: 'Set-DhcpServerv4OptionValue', on: 'DC01', summary: 'Changes scope options such as DNS servers (006) and router (003).', params: [{ n: 'ScopeId', pos: 0 }, { n: 'DnsServer' }, { n: 'Router' }, { n: 'DnsDomain' }], examples: ['Set-DhcpServerv4OptionValue -ScopeId 10.0.10.0 -DnsServer 10.0.10.10'],
    run: (a, { s }) => { needScope(s, a.ScopeId, 'Set-DhcpServerv4OptionValue'); if (a.DnsServer !== undefined) s.dhcp.dns = arr(a.DnsServer); if (a.Router !== undefined) s.dhcp.router = arr(a.Router)[0]; } },
  { name: 'Set-DhcpServerv4Scope', on: 'DC01', summary: 'Changes a scope, for example activates it.', params: [{ n: 'ScopeId', pos: 0 }, { n: 'State' }], examples: ['Set-DhcpServerv4Scope -ScopeId 10.0.10.0 -State Active'],
    run: (a, { s }) => { needScope(s, a.ScopeId, 'Set-DhcpServerv4Scope'); if (a.State !== undefined) { const st = String(a.State); if (!/^(active|inactive)$/i.test(st)) throw new SimError("Set-DhcpServerv4Scope : -State must be Active or Inactive."); s.dhcp.scopeState = /^active$/i.test(st) ? 'Active' : 'Inactive'; } } },
  // ---------- services (both) ----------
  { name: 'Get-Service', on: 'both', summary: 'Shows Windows services.', params: [{ n: 'Name', pos: 0, al: ['DisplayName'] }], examples: ['Get-Service DHCPServer', "Get-Service | Where-Object {$_.Status -eq 'Stopped'}"],
    run: (a, { s, m }) => { const pat = a.Name ? String(a.Name) : '*'; const rows = Object.entries(s.services[m]).filter(([k]) => wild(pat, k) || wild(pat, SERVICE_NAMES[k] || '')).map(([k, v]) => svcObj(m, k, v)); if (!rows.length && a.Name) throw new SimError(`Get-Service : Cannot find any service with service name '${pat}'.`); return rows; } },
  { name: 'Start-Service', on: 'both', summary: 'Starts a service.', params: [{ n: 'Name', pos: 0 }], examples: ['Start-Service DHCPServer'], run: (a, { s, m }) => { svcSet(s, m, arr(a.Name), 'Running', 'Start-Service'); } },
  { name: 'Stop-Service', on: 'both', summary: 'Stops a service.', params: [{ n: 'Name', pos: 0 }, { n: 'Force', sw: true }], examples: ['Stop-Service DHCPServer'], run: (a, { s, m }) => { svcSet(s, m, arr(a.Name), 'Stopped', 'Stop-Service'); } },
  { name: 'Restart-Service', on: 'both', summary: 'Restarts a service.', params: [{ n: 'Name', pos: 0 }], examples: ['Restart-Service DHCPServer'], run: (a, { s, m }) => { svcSet(s, m, arr(a.Name), 'Running', 'Restart-Service'); } },
  // ---------- network (both) ----------
  { name: 'ipconfig', on: 'both', raw: true, summary: 'Shows or refreshes network settings.', params: [], examples: ['ipconfig', 'ipconfig /all', 'ipconfig /renew', 'ipconfig /flushdns'],
    run: (a, { s, m }) => { const f = (a._raw ?? []).map((x) => x.toLowerCase()); const all = f.includes('/all');
      if (f.includes('/flushdns')) return '\nWindows IP Configuration\n\nSuccessfully flushed the DNS Resolver Cache.\n';
      if (f.includes('/release')) { if (m === 'WS01') s.ws.lease = 'released'; return '\nWindows IP Configuration\n\nNo operation can be performed on Local Area Connection* while it has its media disconnected.\n'; }
      if (f.includes('/renew')) { if (m === 'DC01') return '\nWindows IP Configuration\n\nThe operation failed as no adapter is in the state permissible for this operation.\n';
        if (s.services.DC01.DHCPServer !== 'Running' || s.dhcp.scopeState !== 'Active') { if (s.ws.lease === 'released') s.ws.lease = 'apipa'; return '\nWindows IP Configuration\n\nAn error occurred while renewing interface Ethernet0 : unable to contact your DHCP server. Request has timed out.\n'; }
        s.ws.lease = 'ok'; s.ws.ip = `${s.prefix}.50`; s.ws.gw = s.dhcp.router; if (!s.ws.dnsStatic) s.ws.dns = [...s.dhcp.dns]; return '\nWindows IP Configuration\n\n' + ipconfig(s, m, false).split('\n').slice(3).join('\n'); }
      return ipconfig(s, m, all); } },
  { name: 'nslookup', on: 'both', raw: true, summary: 'Asks a DNS server to resolve a name.', params: [], examples: ['nslookup dc01.corp.local', 'nslookup fs01.corp.local'],
    run: (a, { s, m }) => { const name = (a._raw ?? [])[0]; if (!name) return 'Default Server:  UnKnown\n(interactive mode is not available in this console. Try: nslookup dc01.corp.local)\n'; const r = resolve(s, m, name);
      const head = `Server:  ${r.srvName}\nAddress:  ${r.server}\n\n`; if (!r.addr) return `${head}*** ${r.srvName} can't find ${name}: Non-existent domain\n`;
      return `${head}${r.addr === '142.250.80.46' ? 'Non-authoritative answer:\n' : ''}Name:    ${/^\d/.test(name) ? name : name.includes('.') ? name : `${name}.${s.domain}`}\nAddress:  ${r.addr}\n`; } },
  { name: 'Resolve-DnsName', on: 'both', summary: 'Resolves a DNS name (PowerShell version of nslookup).', params: [{ n: 'Name', pos: 0 }, { n: 'Type' }], examples: ['Resolve-DnsName dc01.corp.local'],
    run: (a, { s, m }) => { const n = String(a.Name ?? ''); const r = resolve(s, m, n); if (!r.addr) throw new SimError(`Resolve-DnsName : ${n} : DNS name does not exist`); return [mkObj({ Name: n, Type: 'A', TTL: 3600, Section: 'Answer', IPAddress: r.addr }, ['Name', 'Type', 'TTL', 'Section', 'IPAddress'], 'table')]; } },
  { name: 'ping', on: 'both', raw: true, summary: 'Checks whether another computer answers.', params: [], examples: ['ping 10.0.10.10', 'ping dc01.corp.local'],
    run: (a, { s, m }) => { const t = (a._raw ?? []).filter((x) => !x.startsWith('-')).pop(); if (!t) return 'Usage: ping target_name'; let ip = t; if (!/^\d+\.\d+\.\d+\.\d+$/.test(t)) { try { const r = resolve(s, m, t); if (!r.addr) return `Ping request could not find host ${t}. Please check the name and try again.\n`; ip = r.addr; } catch { return `Ping request could not find host ${t}. Please check the name and try again.\n`; } }
      const c = mn(s, m); if (c.lease !== 'ok' && m === 'WS01') return `\nPinging ${ip} with 32 bytes of data:\nPING: transmit failed. General failure.\nPING: transmit failed. General failure.\nPING: transmit failed. General failure.\nPING: transmit failed. General failure.\n\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss),\n`;
      return `\nPinging ${ip} with 32 bytes of data:\n${'Reply from ' + ip + ': bytes=32 time<1ms TTL=128\n'.repeat(4)}\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),\n`; } },
  { name: 'Get-DnsClientServerAddress', on: 'both', summary: "Shows which DNS servers this computer's network adapter uses.", params: [{ n: 'InterfaceAlias', pos: 0 }, { n: 'AddressFamily' }], examples: ['Get-DnsClientServerAddress -InterfaceAlias Ethernet0'],
    run: (_a, { s, m }) => [mkObj({ InterfaceAlias: 'Ethernet0', InterfaceIndex: 6, AddressFamily: 'IPv4', ServerAddresses: mn(s, m).dns }, ['InterfaceAlias', 'InterfaceIndex', 'AddressFamily', 'ServerAddresses'], 'table')] },
  { name: 'Set-DnsClientServerAddress', on: 'both', summary: 'Sets the DNS servers of a network adapter.', params: [{ n: 'InterfaceAlias', pos: 0 }, { n: 'ServerAddresses' }, { n: 'ResetServerAddresses', sw: true }], examples: ['Set-DnsClientServerAddress -InterfaceAlias Ethernet0 -ServerAddresses 10.0.10.10'],
    run: (a, { s, m }) => { if (m === 'DC01') throw new SimError('Set-DnsClientServerAddress : This lab console only allows DNS changes on WS01. [LabOps tip] Switch to the WS01 tab.');
      if (!/^ethernet0$/i.test(String(a.InterfaceAlias ?? ''))) throw new SimError(`Set-DnsClientServerAddress : No MSFT_NetIPInterface objects found with property 'InterfaceAlias' equal to '${a.InterfaceAlias ?? ''}'. [LabOps tip] The adapter is called Ethernet0.`);
      if (a.ResetServerAddresses) { s.ws.dnsStatic = false; s.ws.dns = s.ws.lease === 'ok' ? [...s.dhcp.dns] : []; return; }
      const addrs = arr(a.ServerAddresses); if (!addrs.length || addrs.some((x) => !/^\d+\.\d+\.\d+\.\d+$/.test(x))) throw new SimError('Set-DnsClientServerAddress : Cannot validate argument on parameter ServerAddresses: use IPv4 addresses such as 10.0.10.10.'); s.ws.dns = addrs; s.ws.dnsStatic = true; } },
  { name: 'cmdkey', on: 'both', raw: true, summary: 'Shows or removes saved Windows credentials (Credential Manager).', params: [], examples: ['cmdkey /list', 'cmdkey /delete:Domain:target=FS01'],
    run: (a, { s, m }) => { const f = (a._raw ?? []); const l = f[0]?.toLowerCase() ?? '';
      if (l === '/list' || l.startsWith('/list:')) { const list = m === 'WS01' ? s.creds : []; return '\nCurrently stored credentials:\n\n' + (list.length ? list.map((c) => `    Target: ${c.target}\n    Type: Domain Password\n    User: ${c.user}\n`).join('\n') : ' * NONE *\n'); }
      if (l.startsWith('/delete:')) { const t = f[0].slice(8).toLowerCase(); const i = (m === 'WS01' ? s.creds : []).findIndex((c) => c.target.toLowerCase() === t || c.target.toLowerCase() === `domain:target=${t}`); if (i < 0) return '\nCMDKEY: Credential not found.\n'; s.creds.splice(i, 1); return '\nCMDKEY: Credential deleted successfully.\n'; }
      return '\nThe syntax of this command is:\n\ncmdkey [{/add | /generic}:targetname {/smartcard | /user:username {/pass{:password}}} | /delete{:targetname | /ras} | /list{:targetname}]\n'; } },
  { name: 'hostname', on: 'both', raw: true, summary: 'Shows the computer name.', params: [], examples: ['hostname'], run: (_a, { m }) => `${m}\n` },
  { name: 'whoami', on: 'both', raw: true, summary: 'Shows who you are signed in as.', params: [], examples: ['whoami'], run: (_a, { s, m }) => `${s.netbios.toLowerCase()}\\${m === 'DC01' ? 'administrator' : s.sessionUser}\n` },
  { name: 'Get-Date', on: 'both', summary: 'Shows the date and time.', params: [], examples: ['Get-Date'], run: () => 'Monday, November 16, 2026 9:02:41 AM\n' },
  { name: 'Write-Output', alias: ['echo', 'Write-Host'], on: 'both', summary: 'Prints text.', params: [{ n: 'InputObject', pos: 0 }], examples: ["Write-Output 'hello'"], run: (a) => `${a.InputObject ?? ''}\n` },
  { name: 'Clear-Host', alias: ['cls', 'clear'], on: 'both', summary: 'Clears the screen.', params: [], examples: ['cls'], run: () => '\u0000CLEAR' },
  { name: 'Get-Command', on: 'both', summary: 'Lists commands that exist in this console.', params: [{ n: 'Name', pos: 0 }], examples: ['Get-Command *ADUser*', 'Get-Command'],
    run: (a, { m }) => COMMANDS.filter((c) => !c.pipeOnly || true).filter((c) => (c.on === 'both' || c.on === m) && (!a.Name || wild(String(a.Name), c.name))).map((c) => mkObj({ CommandType: 'Cmdlet', Name: c.name }, ['CommandType', 'Name'], 'table')) },
  { name: 'Get-Help', alias: ['help', 'man'], on: 'both', summary: 'Explains a command with examples.', params: [{ n: 'Name', pos: 0 }, { n: 'Examples', sw: true }], examples: ['Get-Help Unlock-ADAccount', 'Get-Help Set-ADUser -Examples'],
    run: (a, { m }) => { const n = String(a.Name ?? ''); const c = COMMANDS.find((x) => x.name.toLowerCase() === n.toLowerCase() || x.alias?.some((y) => y.toLowerCase() === n.toLowerCase()));
      if (!c) return n ? `Get-Help : Get-Help could not find ${n} in this console. [LabOps tip] Try Get-Command to see what exists.\n` : 'Type Get-Help <command-name>, for example: Get-Help Unlock-ADAccount\nType Get-Command to list available commands.\n';
      const where = c.on === 'both' ? '' : `\n    (Runs on ${c.on} in this lab. You are on ${m}.)`;
      return `\nNAME\n    ${c.name}\n\nSYNOPSIS\n    ${c.summary}${where}\n\nSYNTAX\n    ${c.name} ${c.params.map((p) => (p.sw ? `[-${p.n}]` : `${p.pos !== undefined ? `[[-${p.n}]` : '[-' + p.n}${p.pos !== undefined ? ']' : ']'} <value>`)).join(' ')}\n\nEXAMPLES\n${c.examples.map((e) => `    PS C:\\> ${e}`).join('\n')}\n`; } },
  // ---------- pipeline helpers ----------
  { name: 'Select-Object', alias: ['select'], on: 'both', pipeOnly: true, summary: 'Chooses which properties to show.', params: [{ n: 'Property', pos: 0 }, { n: 'First' }, { n: 'Last' }, { n: 'ExpandProperty' }], examples: ['Get-ADUser -Filter * | Select-Object SamAccountName,Enabled'],
    run: (a) => { let items = [...(a._pipe ?? [])]; if (a.First !== undefined) items = items.slice(0, Number(a.First)); if (a.Last !== undefined) items = items.slice(-Number(a.Last));
      if (a.ExpandProperty !== undefined) return items.map((o) => String((o as Obj)[Object.keys(o).find((k) => k.toLowerCase() === String(a.ExpandProperty).toLowerCase()) ?? ''] ?? '')).join('\n') + '\n';
      const props = arr(a.Property).flatMap((x) => x.split(',')).filter(Boolean); if (!props.length || props.includes('*')) return items;
      return items.map((o) => { const out: Obj = {}; const cols: string[] = []; for (const p of props) { const k = Object.keys(o).find((x) => !x.startsWith('__') && x.toLowerCase() === p.toLowerCase()); out[k ?? p] = k ? o[k] : null; cols.push(k ?? p); } out.__default = cols; out.__view = cols.length <= 4 ? 'table' : 'list'; return out; }); } },
  { name: 'Where-Object', alias: ['where', '?'], on: 'both', pipeOnly: true, summary: 'Keeps only the items that match a condition.', params: [{ n: 'FilterScript', pos: 0 }], examples: ["Get-ADUser -Filter * -Properties LockedOut | Where-Object {$_.LockedOut -eq $true}"],
    run: (a) => { const b = (a.FilterScript as { __block?: string } | undefined)?.__block; if (!b) throw new SimError('Where-Object : Use a script block, for example Where-Object {$_.Enabled -eq $true}'); return (a._pipe ?? []).filter((o) => cond(b, (p) => { const k = Object.keys(o).find((x) => x.toLowerCase() === p.toLowerCase()); return k ? o[k] : null; })); } },
  { name: 'Sort-Object', alias: ['sort'], on: 'both', pipeOnly: true, summary: 'Sorts items by a property.', params: [{ n: 'Property', pos: 0 }, { n: 'Descending', sw: true }], examples: ['Get-ADUser -Filter * | Sort-Object Name'],
    run: (a) => { const p = String(a.Property ?? ''); const items = [...(a._pipe ?? [])]; const key = (o: Obj) => String(o[Object.keys(o).find((x) => x.toLowerCase() === p.toLowerCase()) ?? ''] ?? ''); items.sort((x, y) => key(x).localeCompare(key(y))); return a.Descending ? items.reverse() : items; } },
  { name: 'Format-Table', alias: ['ft'], on: 'both', pipeOnly: true, summary: 'Shows results as a table.', params: [{ n: 'Property', pos: 0 }, { n: 'AutoSize', sw: true }, { n: 'Wrap', sw: true }], examples: ['Get-Service | Format-Table Name,Status'],
    run: (a) => { const items = a._pipe ?? []; const cols = arr(a.Property).flatMap((x) => x.split(',')).filter(Boolean); return formatAuto(items, 'table', cols.length && !cols.includes('*') ? cols.map((c) => Object.keys(items[0] ?? {}).find((k) => k.toLowerCase() === c.toLowerCase()) ?? c) : undefined); } },
  { name: 'Format-List', alias: ['fl'], on: 'both', pipeOnly: true, summary: 'Shows results as a list (every property on its own line).', params: [{ n: 'Property', pos: 0 }], examples: ['Get-WinEvent -FilterHashtable @{LogName="Security";Id=4740} | Format-List TimeCreated,Message'],
    run: (a) => { const items = a._pipe ?? []; const cols = arr(a.Property).flatMap((x) => x.split(',')).filter(Boolean); const all = cols.includes('*'); const resolved = cols.length && !all ? cols.map((c) => Object.keys(items[0] ?? {}).find((k) => k.toLowerCase() === c.toLowerCase()) ?? c) : undefined;
      return formatAuto(items, 'list', all ? Object.keys(items[0] ?? {}).filter((k) => !k.startsWith('__')) : resolved); } },
];
export { formatList, formatTable };
