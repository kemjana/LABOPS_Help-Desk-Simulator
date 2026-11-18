'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import NavTabs from '@/components/NavTabs';
import { api, ApiError, tzOffset } from '@/lib/api-client';
import { ensureSession } from '@/lib/supabase-browser';

interface Runbook { title: string; markdown: string; entries: { code: string; title: string; category: string; difficulty: string; host: string; date: string; mode: string; symptom: string; steps: { checkpoint: string | null; cause: string; steps: string; evidence: string }[] }[] }
interface Journal { title: string; markdown: string; days: { day: string; items: { time: string; code: string; title: string; mode: string; result: string; checkpoint: string | null }[]; note: { headline: string; summary: string } | null; weak: string[] }[] }

export default function ExportPage() {
  const router = useRouter();
  const [kind, setKind] = useState<'runbook' | 'journal'>('runbook'); const [data, setData] = useState<Runbook | Journal | null>(null); const [err, setErr] = useState('');
  const load = useCallback(async (k: 'runbook' | 'journal') => { setErr(''); setData(null); try { setData(await api(`/api/export?kind=${k}&tz=${tzOffset()}`)); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not build the export.'); } }, []);
  useEffect(() => { (async () => { if (!(await ensureSession(false))) { router.replace('/'); return; } await load(kind); })(); }, [router, load, kind]);
  function download() { if (!data) return; const url = URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = `labops-${kind}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const rb = data && 'entries' in data ? (data as Runbook) : null; const jr = data && 'days' in data ? (data as Journal) : null; // guard: data can briefly belong to the other document while switching
  return (
    <div className="page">
      <header className="topbar no-print"><div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Logo /><NavTabs current="debrief" /></div><div className="topbar-right"><ThemeToggle /></div></header>
      <main className="hero" style={{ paddingTop: 24, maxWidth: 900 }}>
        <div className="no-print"><h1 style={{ fontSize: 28 }}>Runbook and lab journal</h1>
          <p className="lead" style={{ fontSize: 16 }}>Built from your own verified write-ups. Download Markdown, or press <b>Print</b> and choose <b>Save as PDF</b>.</p>
          <div className="chips" role="group" aria-label="Document"><button className="chip" aria-pressed={kind === 'runbook'} onClick={() => setKind('runbook')}>SOP runbook</button><button className="chip" aria-pressed={kind === 'journal'} onClick={() => setKind('journal')}>Lab journal</button></div>
          <div className="row-actions"><button className="btn primary" onClick={download} disabled={!data}>Download Markdown</button><button className="btn" onClick={() => window.print()} disabled={!data}>Print / Save as PDF</button></div>
          {err && <p className="alert error" role="alert">{err}</p>}</div>
        {!data && !err && <p className="muted">Building...</p>}
        {data && <article className="doc"><h1>{data.title}</h1><p className="muted small">Training sandbox. All people and data are fictional.</p>
          {rb && (rb.entries.length ? rb.entries.map((e, i) => (<section key={e.code} className="doc-entry"><h2>{i + 1}. {e.title}</h2><p className="muted small">{e.code} | {e.category} | {e.difficulty} | {e.host} | {e.date} | {e.mode}</p>
            <h3>Symptom</h3><pre>{e.symptom}</pre>{e.steps.map((s, k) => (<div key={k}><h3>{e.steps.length > 1 ? `Step ${k + 1}: cause` : 'Cause'}</h3><pre>{s.cause}</pre><h3>Fix steps / commands</h3><pre>{s.steps}</pre><h3>Verification</h3><pre>{s.evidence || '(none)'}</pre></div>))}</section>)) : <p className="muted">No resolved tickets yet.</p>)}
          {jr && (jr.days.length ? jr.days.map((d) => (<section key={d.day} className="doc-entry"><h2>{d.day}</h2>{d.note && <p><b>{d.note.headline}</b> {d.note.summary}</p>}<ul>{d.items.map((i, k) => <li key={k}>{i.time} {i.code} {i.title} ({i.mode}{i.checkpoint ? `, ${i.checkpoint}` : ''}): {i.result}</li>)}</ul>{d.weak.length > 0 && <p className="small">To practise: {d.weak.join(', ')}</p>}</section>)) : <p className="muted">No activity yet.</p>)}
        </article>}
      </main>
    </div>
  );
}
