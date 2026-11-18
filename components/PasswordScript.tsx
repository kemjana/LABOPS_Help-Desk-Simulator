'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase-browser';

/** Asks for a LAB-ONLY password and downloads Sync-LabRoster.ps1 built by the server from a fixed template. */
export default function PasswordScript() {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(''); setDone(false);
    try {
      const { data } = await sb().auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error('Session missing. Reload the page.');
      const r = await fetch('/api/roster-script', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ password: pw }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Failed (${r.status})`); }
      const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'Sync-LabRoster.ps1'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPw(''); setDone(true);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Failed.'); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} className="card" style={{ marginTop: 10 }}>
      <h3>Generate Sync-LabRoster.ps1</h3>
      <p className="muted small">Creates the fictional employees, department OUs and groups in your Active Directory. Choose a <b>lab-only</b> password (never a real one). It is put into the file once and is not saved by LabOps.</p>
      <label htmlFor="labpw">Lab-only password for all users</label>
      <input id="labpw" type="text" className="code" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} maxLength={64} required autoComplete="off" placeholder="e.g. Lab#Only2026pw" />
      <p className="hint-text">8+ characters, at least 3 of: lowercase, uppercase, number, symbol. Allowed symbols: ! @ # % ^ &amp; * ( ) _ + = . , ? -</p>
      {err && <p className="alert error" role="alert">{err}</p>}
      {done && <p className="alert ok" role="status">Downloaded. Copy it into DC01 (shared folder or paste), open PowerShell as Administrator and run it.</p>}
      <div className="row-actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Building...' : 'Download Sync-LabRoster.ps1'}</button></div>
    </form>
  );
}
