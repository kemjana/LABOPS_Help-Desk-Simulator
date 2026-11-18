// Practice Console (simulated lab). SERVER-ONLY: scenarios hold the goal checks.
export type Machine = 'DC01' | 'WS01';
export type Obj = Record<string, unknown>;
export interface SimUser {
  sam: string; name: string; given: string; sur: string; dept: string; title: string; enabled: boolean; locked: boolean;
  mustChange: boolean; pwdLast: string; pwdResets: number; groups: string[]; ou: string; expires: string | null;
}
export interface SimState {
  v: 1; domain: string; netbios: string; dn: string; dcIp: string; fsIp: string; fsHost: string; gw: string; prefix: string; maskBits: number;
  sessionUser: string;                         // who is signed in on WS01
  users: SimUser[]; groups: string[]; ous: string[];
  events: { id: number; time: string; user: string; caller: string }[];
  creds: { target: string; user: string }[];   // saved credentials on WS01 (Credential Manager)
  services: Record<Machine, Record<string, 'Running' | 'Stopped'>>;
  dhcp: { scopeState: 'Active' | 'Inactive'; scopeId: string; start: string; end: string; dns: string[]; router: string };
  ws: { lease: 'ok' | 'apipa' | 'released'; ip: string; dns: string[]; dnsStatic: boolean; gw: string; apipaIp: string };
  policy: { lockoutThreshold: number; minLen: number };
  vars: Record<Machine, Record<string, unknown>>;
}
export class SimError extends Error { constructor(m: string) { super(m); } }
export interface Guide { cmd: string; why: string; example: string; machine: Machine | 'both' }
export interface Scenario {
  blueprintId: string; start: Machine; guide: Guide[]; reality: string;
  setup(s: SimState, v: SimVars): void;
  check(s: SimState, v: SimVars): { ok: boolean; facts: string[] };
}
export interface SimVars { user: string; targetUser: string; newName: string; newUser: string; dept: string; host: string; fshost: string }
export interface HistoryEntry { m: Machine; c: string; o: string }
