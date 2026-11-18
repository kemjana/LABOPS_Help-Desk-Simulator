import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { selectOne } from '@/lib/db';
import { getEnv, getRoster, getTicket } from '@/lib/workspace';
import { SCRIPTS, validateCtx, type ScriptCtx } from '@/lib/scripts';
import { byId } from '@/lib/blueprints';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Fixed-template PowerShell for "My own VM" mode. Values come from YOUR validated lab settings and roster only.
export const GET = route(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const t = await getTicket(user.id, id);
  const def = SCRIPTS[t.blueprint_id]; const bp = byId(t.blueprint_id);
  if (!def || !bp) return json({ available: false });
  const [env, roster, sec] = await Promise.all([getEnv(user.id), getRoster(user.id), selectOne<Row>('ticket_secrets', { ticket_id: id, user_id: user.id }, 'vars')]);
  const v = (sec?.vars ?? {}) as Row;
  const target = roster.find((r) => r.username === v.targetUser);
  const c: ScriptCtx = validateCtx({
    ticketCode: t.ticket_code, domain: env.domain_name, netbios: env.domain_name.split('.')[0].toUpperCase(), dn: v.dn, dcIp: env.dc_ip,
    prefix: v.prefix, scopeId: `${v.prefix}.0`, user: v.user, targetUser: v.targetUser, targetDept: target?.department ?? v.dept, newName: v.newName, newUser: v.newUser,
    dept: v.dept, fshost: v.fshost, title: bp.title,
  });
  return json({ available: true, objects: def.objects, prepare: def.prepare(c), undo: def.undo(c) });
});
