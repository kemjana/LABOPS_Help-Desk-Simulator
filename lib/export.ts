// SOP runbook and lab journal, built from the learner's OWN verified write-ups (never from hidden answers).
import { select } from './db';
import { humanConcept } from './concepts';
import { CATEGORY_LABEL, type Category } from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const fence = (s: string) => '```text\n' + String(s || '').replace(/```/g, "'''").trim() + '\n```';
const inline = (s: string) => String(s || '').replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>#|])/g, '\\$1').trim();
const local = (iso: string, tz: number) => new Date(Date.parse(iso) - tz * 60000).toISOString();

export async function buildRunbook(userId: string, tz: number) {
  const [env] = await select<Row>('lab_environments', { user_id: userId }, { limit: 1 });
  const tickets = await select<Row>('tickets', { user_id: userId, status: 'resolved' }, { columns: 'id,ticket_code,category,difficulty,subject,description,resolved_at,solved_mode,affected_host', order: 'resolved_at.asc' });
  const attempts = await select<Row>('ticket_attempts', { user_id: userId }, { columns: 'id,ticket_id,passed,root_cause,steps,proof_value,mode,checkpoint,attempt_no,created_at', order: 'attempt_no.asc' });
  const entries = tickets.map((t) => {
    const mine = attempts.filter((a) => a.ticket_id === t.id && a.passed);
    return {
      code: t.ticket_code, title: t.subject, category: CATEGORY_LABEL[t.category as Category], difficulty: t.difficulty, host: t.affected_host, date: local(t.resolved_at, tz).slice(0, 10),
      mode: t.solved_mode === 'vm' ? 'My own VM' : 'Pre-built lab', symptom: t.description,
      steps: mine.map((a) => ({ checkpoint: a.checkpoint, cause: a.root_cause, steps: a.steps, evidence: a.proof_value })),
    };
  });
  const title = `SOP Runbook - ${env?.lab_name ?? 'LabOps lab'} (${env?.domain_name ?? ''})`;
  const md = [`# ${title}`, '', `Built from ${entries.length} verified fixes. All people and data are fictional (training sandbox).`, '',
    ...entries.flatMap((e, i) => [`## ${i + 1}. ${inline(e.title)}`, '', `- Ticket: ${e.code}  |  ${e.category}  |  ${e.difficulty}  |  Host: ${e.host}  |  ${e.date}  |  ${e.mode}`, '', '**Symptom**', '', fence(e.symptom), '',
      ...e.steps.flatMap((s, k) => [e.steps.length > 1 ? `**Step ${k + 1}${s.checkpoint ? ` (${s.checkpoint})` : ''}: cause**` : '**Cause**', '', fence(s.cause), '', '**Fix steps / commands**', '', fence(s.steps), '', '**Verification**', '', fence(s.evidence), ''])]),
    entries.length ? '' : '_No resolved tickets yet. Resolve a ticket and it appears here._'].join('\n');
  return { title, entries, markdown: md };
}

export async function buildJournal(userId: string, tz: number) {
  const [env] = await select<Row>('lab_environments', { user_id: userId }, { limit: 1 });
  const [attempts, tickets, debriefs] = await Promise.all([
    select<Row>('ticket_attempts', { user_id: userId }, { columns: 'ticket_id,passed,mode,feedback,checkpoint,created_at', order: 'created_at.asc' }),
    select<Row>('tickets', { user_id: userId }, { columns: 'id,ticket_code,subject,category,difficulty' }),
    select<Row>('daily_debriefs', { user_id: userId }, { columns: 'local_day,narrative,stats' }),
  ]);
  const tk = new Map(tickets.map((t) => [t.id, t]));
  const days = new Map<string, Row[]>();
  attempts.forEach((a) => { const d = local(a.created_at, tz).slice(0, 10); const t = tk.get(a.ticket_id); if (!t) return; (days.get(d) ?? days.set(d, []).get(d)!).push({ time: local(a.created_at, tz).slice(11, 16), code: t.ticket_code, title: t.subject, mode: a.mode === 'vm' ? 'own VM' : 'pre-built lab', result: a.passed ? 'passed' : 'reopened', checkpoint: a.checkpoint }); });
  const out = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, items]) => { const d = debriefs.find((x) => x.local_day === day); return { day, items, note: d?.narrative ?? null, resolved: d?.stats?.resolved ?? null, points: d?.stats?.points ?? null, weak: (d?.stats?.weaknesses ?? []).map((w: Row) => humanConcept(w.concept)) }; });
  const title = `Lab journal - ${env?.lab_name ?? 'LabOps lab'}`;
  const md = [`# ${title}`, '', `Domain ${env?.domain_name ?? ''}, subnet ${env?.subnet_cidr ?? ''}, mode ${env?.lab_mode ?? ''}. Training sandbox, fictional data.`, '',
    ...out.flatMap((d) => [`## ${d.day}`, '', d.note ? `> ${inline(d.note.headline)}: ${inline(d.note.summary)}` : '', d.note ? '' : '',
      ...d.items.map((i: Row) => `- ${i.time}  ${i.code}  ${inline(i.title)}  (${i.mode}${i.checkpoint ? `, ${i.checkpoint}` : ''}): ${i.result}`), d.weak.length ? `\nTo practise: ${d.weak.join(', ')}` : '', '']),
    out.length ? '' : '_No activity yet._'].join('\n');
  return { title, days: out, markdown: md };
}
