import { CONSOLE_READY } from './sim/scenarios';
import { SCRIPTS } from './scripts';
import type { SimVars } from './sim/types';
import { examTags } from './concepts';
import { byId } from './blueprints';
import { cpsFor } from './checkpoints';
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** Adds which ways a ticket can be worked: the pre-built lab (console) and/or ready-made VM scripts. */
export const decorate = (t: Row): Row => { const bp = byId(t.blueprint_id); return { ...t, console_ready: CONSOLE_READY.has(t.blueprint_id), script_ready: !!SCRIPTS[t.blueprint_id], exam_tags: bp ? examTags(bp) : [], checkpoint_total: cpsFor(t.blueprint_id)?.length ?? 0 }; };

export function simInputs(env: Row, roster: Row[], vars: Row) {
  const base = { domain: env.domain_name, dcIp: env.dc_ip, fsIp: env.fs_ip, gw: env.gateway_ip, subnetCidr: env.subnet_cidr, light: env.lab_mode === 'lightweight',
    roster: roster.filter((r) => r.is_active !== false).map((r) => ({ full_name: r.full_name, username: r.username, department: r.department, job_title: r.job_title })), sessionUser: vars.user };
  const sv: SimVars = { user: vars.user, targetUser: vars.targetUser, newName: vars.newName, newUser: vars.newUser, dept: vars.dept, host: vars.host, fshost: vars.fshost };
  return { base, sv };
}

