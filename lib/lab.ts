import type { LabMode } from './types';
import { HttpError } from './http';

export const DEFAULT_LAB = {
  lab_name: 'My LabOps Lab', domain_name: 'corp.local', subnet_cidr: '10.0.10.0/24',
  gateway_ip: '10.0.10.1', dc_ip: '10.0.10.10', fs_ip: '10.0.10.20', lab_mode: 'lightweight' as LabMode,
};

// All names below are clearly fictional. They are not real people.
export const ROSTER_SEED = [
  ['Clara Mendoza', 'cmendoza', 'Finance', 'Accountant'], ['Alex Rivera', 'arivera', 'IT', 'Support Technician'],
  ['Sophia Chen', 'schen', 'Sales', 'Account Executive'], ['Marcus Okafor', 'mokafor', 'HR', 'HR Coordinator'],
  ['Priya Nair', 'pnair', 'Marketing', 'Content Lead'], ['Daniel Brooks', 'dbrooks', 'Operations', 'Operations Analyst'],
  ['Lena Fischer', 'lfischer', 'Legal', 'Paralegal'], ['Tomas Novak', 'tnovak', 'Finance', 'Payroll Specialist'],
  ['Aisha Rahman', 'arahman', 'Support', 'Customer Care Rep'], ['Hugo Silva', 'hsilva', 'Sales', 'Sales Associate'],
  ['Mei Tanaka', 'mtanaka', 'Engineering', 'Developer'], ['Noah Kowalski', 'nkowalski', 'Operations', 'Warehouse Lead'],
] as const;

export const NEW_HIRES = [
  ['Jordan Ellis', 'jellis'], ['Rosa Delgado', 'rdelgado'], ['Kenji Aoki', 'kaoki'], ['Fatima Haddad', 'fhaddad'],
  ['Oliver Grant', 'ogrant'], ['Ines Moreau', 'imoreau'],
] as const;

export function ouPathFor(domain: string, dept: string) {
  const dn = domain.split('.').map((p) => `DC=${p}`).join(',');
  return `OU=${dept},OU=Corp Users,${dn}`;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const DOMAIN = /^(?=.{3,60}$)([a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?\.)+[a-z]{2,15}$/i;
const CIDR = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}\/(8|16|2[0-9]|30)$/;

export function validateLab(b: Record<string, unknown>) {
  const out: Record<string, string> = {};
  const need = (k: string, re: RegExp, msg: string, tr = (s: string) => s) => {
    if (b[k] === undefined) return;
    const v = tr(String(b[k]).trim());
    if (!re.test(v)) throw new HttpError(400, msg, 'validation');
    out[k] = v;
  };
  need('domain_name', DOMAIN, 'Domain must look like corp.local (letters, numbers, dots).', (s) => s.toLowerCase());
  need('subnet_cidr', CIDR, 'Subnet must look like 10.0.10.0/24.');
  need('gateway_ip', IPV4, 'Gateway must be an IPv4 address like 10.0.10.1.');
  need('dc_ip', IPV4, 'Domain controller IP must be an IPv4 address.');
  need('fs_ip', IPV4, 'File server IP must be an IPv4 address.');
  if (b.lab_name !== undefined) {
    const n = String(b.lab_name).replace(/[<>]/g, '').trim();
    if (n.length < 1 || n.length > 40) throw new HttpError(400, 'Lab name must be 1-40 characters.', 'validation');
    out.lab_name = n;
  }
  if (b.lab_mode !== undefined) {
    if (b.lab_mode !== 'lightweight' && b.lab_mode !== 'enterprise') throw new HttpError(400, 'Lab mode must be lightweight or enterprise.', 'validation');
    out.lab_mode = b.lab_mode as string;
  }
  return out;
}

export interface Ctx {
  user: string; name: string; first: string; dept: string; target: string; targetUser: string;
  newName: string; newUser: string; host: string; domain: string; dc: string; fs: string; gw: string;
  prefix: string; dn: string; subnet: string; fshost: string; dchost: string; ou: string;
}
export function fill(t: string, c: Ctx): string {
  return t.replace(/\{(\w+)\}/g, (m, k: string) => (k in c ? String((c as unknown as Record<string, string>)[k]) : m));
}
