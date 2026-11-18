import type { SimState, SimUser, Machine } from './types';

export interface BaseInput { domain: string; dcIp: string; fsIp: string; gw: string; subnetCidr: string; light: boolean; roster: { full_name: string; username: string; department: string; job_title: string }[]; sessionUser: string }

export function createBase(i: BaseInput): SimState {
  const dn = i.domain.split('.').map((p) => `DC=${p}`).join(',');
  const prefix = i.subnetCidr.split('/')[0].split('.').slice(0, 3).join('.');
  const bits = Number(i.subnetCidr.split('/')[1]) || 24;
  const depts = Array.from(new Set(i.roster.map((r) => r.department)));
  const users: SimUser[] = i.roster.map((r) => ({
    sam: r.username, name: r.full_name, given: r.full_name.split(' ')[0], sur: r.full_name.split(' ').slice(1).join(' '), dept: r.department, title: r.job_title,
    enabled: true, locked: false, mustChange: false, pwdLast: '10/14/2026 9:12:03 AM', pwdResets: 0, groups: ['Domain Users', `GG-${r.department}`],
    ou: `OU=${r.department},OU=Corp Users,${dn}`, expires: null,
  }));
  users.push({ sam: 'Administrator', name: 'Administrator', given: '', sur: '', dept: 'IT', title: 'Built-in account', enabled: true, locked: false, mustChange: false,
    pwdLast: '09/02/2026 8:00:00 AM', pwdResets: 0, groups: ['Domain Users', 'Domain Admins'], ou: `CN=Users,${dn}`, expires: null });
  const mask = bits >= 24 ? '255.255.255.0' : bits >= 16 ? '255.255.0.0' : '255.0.0.0';
  void mask;
  return {
    v: 1, domain: i.domain, netbios: i.domain.split('.')[0].toUpperCase(), dn, dcIp: i.dcIp, fsIp: i.light ? i.dcIp : i.fsIp, fsHost: i.light ? 'DC01' : 'FS01', gw: i.gw, prefix, maskBits: bits,
    sessionUser: i.sessionUser, users,
    groups: ['Domain Admins', 'Domain Users', ...depts.map((d) => `GG-${d}`)],
    ous: [`OU=Corp Users,${dn}`, ...depts.map((d) => `OU=${d},OU=Corp Users,${dn}`), `OU=Disabled Users,${dn}`],
    events: [], creds: [],
    services: { DC01: { DHCPServer: 'Running', DNS: 'Running', NTDS: 'Running', Netlogon: 'Running', W32Time: 'Running' }, WS01: { Dhcp: 'Running', Dnscache: 'Running', LanmanWorkstation: 'Running' } },
    dhcp: { scopeState: 'Active', scopeId: `${prefix}.0`, start: `${prefix}.100`, end: `${prefix}.200`, dns: [i.dcIp], router: i.gw },
    ws: { lease: 'ok', ip: `${prefix}.50`, dns: [i.dcIp], dnsStatic: false, gw: i.gw, apipaIp: '169.254.113.27' },
    policy: { lockoutThreshold: 3, minLen: 7 },
    vars: { DC01: {}, WS01: {} },
  };
}
export const maskOf = (bits: number) => (bits >= 24 ? '255.255.255.0' : bits >= 16 ? '255.255.0.0' : '255.0.0.0');
export const SERVICE_NAMES: Record<string, string> = {
  DHCPServer: 'DHCP Server', DNS: 'DNS Server', NTDS: 'Active Directory Domain Services', Netlogon: 'Netlogon', W32Time: 'Windows Time',
  Dhcp: 'DHCP Client', Dnscache: 'DNS Client', LanmanWorkstation: 'Workstation',
};
export const machines: Machine[] = ['DC01', 'WS01'];
