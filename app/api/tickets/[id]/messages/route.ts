import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { select } from '@/lib/db';
import { getTicket, publicTicket } from '@/lib/workspace';
import { decorate } from '@/lib/modes';
import { cpsFor } from '@/lib/checkpoints';
import { fill, type Ctx } from '@/lib/lab';
import { selectOne } from '@/lib/db';

export const GET = route(async (req, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  await getTicket(user.id, id);
  const [messages, attempts, ticket] = await Promise.all([
    select('ticket_messages', { user_id: user.id, ticket_id: id }, { columns: 'id,role,content,hint_level,kind,created_at', order: 'created_at.asc', limit: 60 }),
    select('ticket_attempts', { user_id: user.id, ticket_id: id }, { columns: 'id,attempt_no,passed,score,feedback,mode,screenshot_path,created_at', order: 'attempt_no.asc' }),
    publicTicket(user.id, id),
  ]);
  const cps = cpsFor(ticket.blueprint_id as string); let checkpoints = null;
  if (cps) { const sec = await selectOne<Record<string, any>>('ticket_secrets', { ticket_id: id, user_id: user.id }, 'vars'); checkpoints = cps.map((c) => ({ id: c.id, title: c.title, prompt: fill(c.prompt, (sec?.vars ?? {}) as Ctx), proof: c.proof })); } // eslint-disable-line @typescript-eslint/no-explicit-any
  const replies = await select<Record<string, any>>('ticket_replies', { user_id: user.id, ticket_id: id }, { columns: 'passed,score,created_at', order: 'created_at.desc' }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return json({ ticket: decorate(ticket), messages, attempts, checkpoints, reply: { passed: replies.some((r) => r.passed), tries: replies.length } });
});
