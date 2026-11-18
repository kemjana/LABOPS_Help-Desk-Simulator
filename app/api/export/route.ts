import { route, json, HttpError } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { buildJournal, buildRunbook } from '@/lib/export';
import { NextResponse } from 'next/server';

// kind=runbook|journal. Add format=md to download the Markdown file. PDF = print the /export page ("Save as PDF").
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const u = new URL(req.url); const kind = u.searchParams.get('kind'); const tz = Number(u.searchParams.get('tz') ?? 0);
  if (kind !== 'runbook' && kind !== 'journal') throw new HttpError(400, 'kind must be runbook or journal.', 'validation');
  if (!Number.isFinite(tz) || Math.abs(tz) > 14 * 60) throw new HttpError(400, 'Invalid time zone offset.', 'validation');
  const data = kind === 'runbook' ? await buildRunbook(user.id, tz) : await buildJournal(user.id, tz);
  if (u.searchParams.get('format') === 'md') return new NextResponse(data.markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="labops-${kind}.md"`, 'Cache-Control': 'no-store' } });
  return json(data);
});
