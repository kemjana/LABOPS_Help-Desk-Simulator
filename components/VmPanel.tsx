'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';

interface Step { vm: 'DC01' | 'WS01'; title: string; filename: string; body: string }
interface Data { available: boolean; objects?: string; prepare?: Step[]; undo?: Step[] }

function download(s: Step) {
  const url = URL.createObjectURL(new Blob([s.body], { type: 'text/plain' }));
  const a = document.createElement('a'); a.href = url; a.download = s.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ScriptCard({ s, n }: { s: Step; n: number }) {
  const [shown, setShown] = useState(false); const [copied, setCopied] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(s.body); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setShown(true); } }
  return (
    <li className="script-card">
      <div><b>Step {n}: run on <span className="mono">{s.vm}</span></b> - {s.title}</div>
      <div className="row-actions" style={{ marginTop: 6 }}>
        <button className="btn sm primary" onClick={copy}>{copied ? 'Copied!' : 'Copy script'}</button>
        <button className="btn sm" onClick={() => download(s)}>Download .ps1</button>
        <button className="btn sm ghost" onClick={() => setShown((x) => !x)} aria-expanded={shown}>{shown ? 'Hide' : 'View'} script</button>
      </div>
      {shown && <pre className="code-block mono">{s.body}</pre>}
    </li>
  );
}

export default function VmPanel({ ticketId, scriptReady }: { ticketId: string; scriptReady: boolean }) {
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState('');
  useEffect(() => { if (!scriptReady) { setD({ available: false }); return; } api<Data>(`/api/tickets/${ticketId}/scripts`).then(setD).catch((e) => setErr(e instanceof ApiError ? e.message : 'Could not build the scripts.')); }, [ticketId, scriptReady]);
  return (
    <section className="card" aria-label="My own VM">
      <div className="tk-head"><h3>My own VM</h3><span className="tag">Real lab, real Windows</span></div>
      {err && <p className="alert error" role="alert">{err}</p>}
      {!d && !err && <p className="muted">Building your scripts...</p>}
      {d && !d.available && <p className="alert info">No ready-made script for this ticket yet. Set up the problem in your VM yourself (the mentor can help), fix it, then paste the evidence below.</p>}
      {d?.available && (<>
        <p className="muted small">Ready-made PowerShell sets up this problem in <b>your</b> lab. It changes {d.objects}. On the VM, open PowerShell as Administrator and paste it, or download the file into the VM (for example through a VirtualBox shared folder) and run it. You can also type the commands by hand: use <b>View script</b>.</p>
        <h3 style={{ marginTop: 10 }}>1. Prepare my lab</h3>
        <ol className="script-list">{d.prepare!.map((s, i) => <ScriptCard key={s.filename} s={s} n={i + 1} />)}</ol>
        <details style={{ marginTop: 8 }}><summary><b>2. Undo (after you finish)</b></summary>
          <ol className="script-list">{d.undo!.map((s, i) => <ScriptCard key={s.filename} s={s} n={i + 1} />)}</ol>
          <p className="muted small">Or revert your VMs to the clean snapshot instead.</p></details>
        <p className="muted small" style={{ marginTop: 8 }}>Tip: the script shows how the problem was made. Run it first, read it later.</p>
      </>)}
    </section>
  );
}
