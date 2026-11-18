'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';

type M = 'DC01' | 'WS01';
interface Line { kind: 'cmd' | 'out' | 'err'; text: string; prompt?: string }
interface View {
  machines: M[]; start: M; prompts: Record<M, string>; history: { m: M; c: string; o: string }[]; closed: boolean; reality: string | null;
  guide: { cmd: string; why: string; example: string; machine: M | 'both' }[];
  completion: Record<M, { commands: string[]; params: Record<string, string[]> }>;
}

export default function Console({ ticketId, onCommand }: { ticketId: string; onCommand: () => void }) {
  const [v, setV] = useState<View | null>(null);
  const [m, setM] = useState<M>('DC01');
  const [lines, setLines] = useState<Record<M, Line[]>>({ DC01: [], WS01: [] });
  const [prompts, setPrompts] = useState<Record<M, string>>({ DC01: 'PS>', WS01: 'PS>' });
  const [input, setInput] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [hist, setHist] = useState<string[]>([]); const [hi, setHi] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null); const inRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<View>(`/api/tickets/${ticketId}/console`);
      setV(d); setM(d.start); setPrompts(d.prompts);
      const L: Record<M, Line[]> = { DC01: [], WS01: [] };
      for (const h of d.history) { L[h.m].push({ kind: 'cmd', text: h.c, prompt: d.prompts[h.m] }); if (h.o) L[h.m].push({ kind: /^[\w-]+ : |tip\]/.test(h.o) ? 'err' : 'out', text: h.o }); }
      setLines(L); setHist(d.history.map((h) => h.c).reverse());
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not open the console.'); }
  }, [ticketId]);
  useEffect(() => { setV(null); setErr(''); load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [lines, m]);

  async function run(cmdText?: string) {
    const c = (cmdText ?? input).trim(); if (!c || busy || !v) return;
    setBusy(true); setErr(''); setInput(''); setHi(-1);
    setLines((l) => ({ ...l, [m]: [...l[m], { kind: 'cmd', text: c, prompt: prompts[m] }] })); setHist((h) => [c, ...h]);
    try {
      const r = await api<{ out: string; error: boolean; clear: boolean; prompts: Record<M, string> }>(`/api/tickets/${ticketId}/console`, { method: 'POST', body: { machine: m, command: c } });
      setPrompts(r.prompts);
      setLines((l) => r.clear ? { ...l, [m]: [] } : { ...l, [m]: [...l[m], ...(r.out ? [{ kind: (r.error ? 'err' : 'out') as Line['kind'], text: r.out }] : [])] });
      onCommand();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'The console did not answer.'); }
    finally { setBusy(false); inRef.current?.focus(); }
  }
  async function reset() {
    if (!confirm('Reset the pre-built lab for this ticket to its starting state? Your command history here is cleared.')) return;
    setBusy(true);
    try { await api(`/api/tickets/${ticketId}/console`, { method: 'POST', body: { reset: true } }); await load(); onCommand(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not reset.'); } finally { setBusy(false); }
  }
  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); run(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.min(hist.length - 1, hi + 1); if (n >= 0) { setHi(n); setInput(hist[n]); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); const n = hi - 1; setHi(n); setInput(n >= 0 ? hist[n] : ''); }
    else if (e.key === 'Tab' && v) {   // tab completion for command names and parameter names
      e.preventDefault(); const parts = input.split(/\s+/); const last = parts[parts.length - 1] ?? '';
      const data = v.completion[m];
      const pool = parts.length <= 1 ? data.commands : (data.params[parts[0]] ?? []).map((p) => '-' + p);
      const hit = pool.filter((x) => x.toLowerCase().startsWith(last.toLowerCase()));
      if (hit.length === 1) setInput([...parts.slice(0, -1), hit[0]].join(' ') + ' ');
      else if (hit.length > 1) setLines((l) => ({ ...l, [m]: [...l[m], { kind: 'out', text: hit.slice(0, 20).join('   ') + '\n' }] }));
    }
  }
  if (err && !v) return <p className="alert error" role="alert">{err}</p>;
  if (!v) return <p className="muted">Opening your pre-built lab...</p>;
  const guide = v.guide;
  return (
    <section className="card" aria-label="Practice console">
      <div className="tk-head"><h3>Pre-built lab (practice console)</h3><span className="tag">Simulated, not real Windows</span></div>
      <p className="muted small">The problem is already set up. Switch between the two computers with the tabs, type commands, then submit your write-up below. Press <b>Tab</b> to complete, <b>Up</b> for earlier commands, and type <span className="mono">Get-Help &lt;command&gt;</span> for help.</p>
      <div className="vm-tabs" role="tablist" aria-label="Computers in the lab">
        {v.machines.map((x) => <button key={x} role="tab" aria-selected={m === x} className="vm-tab" onClick={() => { setM(x); setTimeout(() => inRef.current?.focus(), 0); }}>{x}<span className="muted small"> {x === 'DC01' ? 'Domain controller' : 'Client PC'}</span></button>)}
      </div>
      <div className="term" onClick={() => inRef.current?.focus()} role="log" aria-live="polite" aria-label={`${m} terminal`}>
        {lines[m].length === 0 && <div className="term-hint">Windows PowerShell on {m}. Type a command and press Enter.</div>}
        {lines[m].map((l, i) => l.kind === 'cmd' ? <div key={i} className="term-cmd"><span className="term-prompt">{l.prompt}</span> {l.text}</div> : <pre key={i} className={`term-out ${l.kind}`}>{l.text}</pre>)}
        <div className="term-row"><span className="term-prompt">{prompts[m]}</span>
          <input ref={inRef} className="term-input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy || v.closed} aria-label={`Command for ${m}`} spellCheck={false} autoComplete="off" autoCapitalize="off" maxLength={400} /></div>
        <div ref={endRef} />
      </div>
      {err && <p className="alert error" role="alert">{err}</p>}
      <div className="row-actions"><button className="btn sm" onClick={() => run()} disabled={busy || !input.trim()}>Run</button><button className="btn sm ghost" onClick={reset} disabled={busy || v.closed}>Reset this lab</button></div>
      <details className="guide" open>
        <summary>Commands for this ticket</summary>
        <ul>{guide.map((g, i) => (
          <li key={i}><div><b className="mono">{g.cmd}</b> <span className="tag">{g.machine === 'both' ? 'any computer' : `on ${g.machine}`}</span></div>
            <div className="muted small">{g.why}</div>
            <div className="guide-ex"><code className="mono small">{g.example}</code>
              <button className="btn sm" onClick={() => { if (g.machine !== 'both') setM(g.machine); setInput(g.example); setTimeout(() => inRef.current?.focus(), 0); }}>Insert</button></div></li>))}</ul>
        <p className="muted small">Other valid commands may not exist in this simulation. Use these, or ask the mentor.</p>
      </details>
      {v.reality && <div className="alert info"><b>In real Windows:</b> {v.reality}</div>}
    </section>
  );
}
