'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import NavTabs from '@/components/NavTabs';
import RadarChart from '@/components/RadarChart';
import type { AppState } from '@/components/types';
import { api, ApiError, localDayString, tzOffset } from '@/lib/api-client';
import { ensureSession } from '@/lib/supabase-browser';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/lib/types';

interface Debrief { day: string; stats: Stats; narrative: { headline: string; summary: string; tip: string } | null }
interface Stats { resolved: number; points: number; attempts: number; first_try_rate: number | null; avg_minutes: number | null; hints_used: number; reopen_rate: number | null; streak: number; tone_replies: number;
  per_category: Record<string, { resolved: number; points: number; attempts: number; failed: number }>; per_concept: { concept: string; label: string; met: number; total: number }[];
  weaknesses: { concept: string; label: string; failed: number; total: number; practice: string }[]; recommended: { blueprint_id: string; title: string; category: string; difficulty: string; concept: string }[]; modes: { console: number; vm: number } }
const pct = (v: number | null) => (v === null ? '-' : `${v}%`);

export default function DebriefPage() {
  const router = useRouter();
  const [app, setApp] = useState<AppState | null>(null); const [d, setD] = useState<Debrief | null>(null); const [past, setPast] = useState<{ day: string; resolved: number; points: number; headline: string | null }[]>([]);
  const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [shown, setShown] = useState('');
  const load = useCallback(async (day: string, refresh = false) => {
    setBusy(true); setErr(''); setNote('');
    try {
      const r = await api<{ debrief: Debrief; narrative_error: string | null }>('/api/debrief', { method: 'POST', body: { day, tz: tzOffset(), refresh } });
      setD(r.debrief); setShown(day); if (r.narrative_error) setNote(r.narrative_error);
      setPast((await api<{ debriefs: typeof past }>('/api/debrief/list')).debriefs);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not build the debrief.'); } finally { setBusy(false); }
  }, []);
  useEffect(() => { (async () => { if (!(await ensureSession(false))) { router.replace('/'); return; } try { setApp(await api<AppState>('/api/state')); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load.'); } const q = new URLSearchParams(location.search).get('day'); await load(q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDayString()); })(); }, [router, load]);
  const s = d?.stats; const isToday = shown === localDayString();
  return (
    <div className="page">
      <header className="topbar"><div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Logo /><NavTabs current="debrief" /></div><div className="topbar-right"><ThemeToggle /></div></header>
      <main className="hero" style={{ paddingTop: 24, maxWidth: 960 }}>
        <h1 style={{ fontSize: 28 }}>End my shift</h1>
        <p className="lead" style={{ fontSize: 16 }}>Your debrief for <b>{shown || '...'}</b>. Every number is counted by the app. The AI only writes the short coach note from those numbers.</p>
        {err && <p className="alert error" role="alert">{err}</p>}
        {!s ? <p className="muted">{busy ? 'Counting your shift...' : ''}</p> : (<>
          <div className="stat-grid">
            {[['Tickets resolved', s.resolved], ['Points earned', s.points], ['First-try rate', pct(s.first_try_rate)], ['Average time', s.avg_minutes === null ? '-' : `${s.avg_minutes} min`], ['Hints used', s.hints_used], ['Reopen rate', pct(s.reopen_rate)], ['Streak', `${s.streak} day(s)`], ['Tone replies', s.tone_replies]].map(([k, v]) => <div className="stat" key={String(k)}><span>{k}</span><b>{v}</b></div>)}
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            {d?.narrative ? <><h2>{d.narrative.headline}</h2><p style={{ margin: '6px 0' }}>{d.narrative.summary}</p><p className="muted"><b>Tip:</b> {d.narrative.tip}</p></> : <p className="muted">The coach note is not ready. {note || ''} <button className="btn sm" onClick={() => load(shown)} disabled={busy}>Try again</button></p>}
          </div>
          <div className="two-col">
            <div className="card"><h3>Skill radar</h3>{app && <RadarChart skills={app.skills} />}</div>
            <div className="card"><h3>By category (this day)</h3>
              <table className="table"><thead><tr><th>Category</th><th>Resolved</th><th>Points</th><th>Failed tries</th></tr></thead><tbody>{CATEGORIES.map((c) => <tr key={c}><td>{CATEGORY_LABEL[c as Category]}</td><td>{s.per_category[c].resolved}</td><td>{s.per_category[c].points}</td><td>{s.per_category[c].failed}/{s.per_category[c].attempts}</td></tr>)}</tbody></table></div>
          </div>
          <div className="card"><h3>Weakest 3 topics</h3>
            {s.weaknesses.length ? <ol>{s.weaknesses.map((w) => <li key={w.concept}><b>{w.label}</b> <span className="muted small">(missed {w.failed} of {w.total} checks)</span><div className="small">{w.practice}</div></li>)}</ol> : <p className="muted">No missed checks today. Nice! Try a harder ticket tomorrow.</p>}
            <h3 style={{ marginTop: 12 }}>3 tickets for tomorrow</h3>
            <ul>{s.recommended.map((r) => <li key={r.blueprint_id}><b>{r.title}</b> <span className="tag">{CATEGORY_LABEL[r.category as Category]}</span> <span className={`tag ${r.difficulty}`}>{r.difficulty}</span> <span className="muted small">why: {r.concept}</span></li>)}</ul>
            <p className="muted small">These are added to your spaced-practice list. When they are due, they show up on your board with a "Review" tag.</p></div>
          <div className="card"><h3>Topics checked today</h3>{s.per_concept.length ? <div className="tags">{s.per_concept.map((c) => <span className="tag" key={c.concept}>{c.label}: {c.met}/{c.total}</span>)}</div> : <p className="muted">No answers submitted on this day.</p>}</div>
          <div className="row-actions">{isToday && <button className="btn" onClick={() => load(shown, true)} disabled={busy}>Update with my latest work</button>}<Link className="btn" href="/export">Runbook and lab journal</Link><Link className="btn ghost" href="/dashboard">Back to tickets</Link></div>
        </>)}
        {past.length > 0 && <div className="card" style={{ marginTop: 14 }}><h3>Earlier debriefs</h3><ul>{past.map((p) => <li key={p.day}><button className="btn sm ghost" onClick={() => load(p.day)}>{p.day}</button> {p.resolved} resolved, {p.points} pts {p.headline ? `- ${p.headline}` : ''}</li>)}</ul></div>}
      </main>
    </div>
  );
}
