import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { select } from '@/lib/db';

export const GET = route(async (req) => {
  const user = await requireUser(req);
  const rows = await select<Record<string, any>>('daily_debriefs', { user_id: user.id }, { columns: 'local_day,stats,narrative', order: 'local_day.desc', limit: 30 }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return json({ debriefs: rows.map((r) => ({ day: r.local_day, resolved: r.stats?.resolved ?? 0, points: r.stats?.points ?? 0, headline: r.narrative?.headline ?? null })) });
});
