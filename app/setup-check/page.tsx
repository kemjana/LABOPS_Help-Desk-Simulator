'use client';
import { useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { api, ApiError } from '@/lib/api-client';
import { ensureSession } from '@/lib/supabase-browser';

interface Check {
  env: Record<string, boolean | string>; tables: Record<string, string>; rate_limit: string;
  blueprints: { count: number; synced: string };
  gemini: { configured: string[]; pings: Record<string, { ok: boolean; message: string }>; usable: string[]; listError?: string };
}
const Ok = ({ ok }: { ok: boolean }) => <span className={`status ${ok ? 'ok' : 'bad'}`}>{ok ? 'OK' : 'PROBLEM'}</span>;

export default function SetupCheck() {
  const [data, setData] = useState<Check | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true); setErr(''); setData(null);
    try { await ensureSession(true); setData(await api<Check>('/api/setup-check')); }
    catch (e) { setErr(e instanceof ApiError ? `${e.message}${e.detail ? `\n${e.detail}` : ''}` : e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(false); }
  }
  return (
    <div className="page">
      <header className="topbar"><Logo /><div className="topbar-right"><Link className="link-quiet" href="/dashboard">Dashboard</Link><ThemeToggle /></div></header>
      <main className="hero" style={{ paddingTop: 28 }}>
        <h1 style={{ fontSize: 30 }}>Setup check</h1>
        <p className="lead" style={{ fontSize: 16 }}>Tests your Supabase tables and your Gemini key with one tiny request, and lists the model names your key can use. Safe to run any time.</p>
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? 'Checking...' : 'Run checks'}</button>
        {err && <p className="alert error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{err}</p>}
        {data && (<>
          <div className="card" style={{ marginTop: 16 }}><h3>Environment variables (present on the server?)</h3>
            <table className="table"><tbody>{Object.entries(data.env).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td>{typeof v === 'boolean' ? <Ok ok={v} /> : <span className="mono">{v}</span>}</td></tr>)}</tbody></table></div>
          <div className="card"><h3>Database tables</h3>
            <table className="table"><tbody>{Object.entries(data.tables).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td><Ok ok={v === 'ok'} />{v !== 'ok' && <div className="small muted mono">{v}</div>}</td></tr>)}
              <tr><td className="mono">rl_hit() function</td><td><Ok ok={data.rate_limit === 'ok'} />{data.rate_limit !== 'ok' && <div className="small muted mono">{data.rate_limit}</div>}</td></tr></tbody></table>
            {Object.values(data.tables).some((v) => v !== 'ok') && <p className="alert warn">Some tables are missing. Paste <span className="mono">supabase/migrations/001_init_labops.sql</span> into Supabase SQL Editor and Run it.</p>}
            <p className="small muted">{data.blueprints.count} ticket blueprints loaded. Blueprint sync: {data.blueprints.synced}</p></div>
          <div className="card"><h3>Gemini</h3>
            {!data.env.GEMINI_API_KEY ? <p className="alert error">GEMINI_API_KEY is missing. Add it to .env.local and restart npm run dev.</p> : (<>
              <table className="table"><tbody>{data.gemini.configured.map((m) => { const p = data.gemini.pings[m]; return <tr key={m}><td className="mono">{m}</td><td><Ok ok={!!p?.ok} /><div className="small muted mono">{p?.message}</div></td></tr>; })}</tbody></table>
              {data.gemini.listError && <p className="alert warn mono small">Could not list models: {data.gemini.listError}</p>}
              {data.gemini.usable.length > 0 && <><p className="small" style={{ marginTop: 10 }}>Model names your key can use (copy one into <span className="mono">GEMINI_MODEL</span>):</p><p className="mono small" style={{ wordBreak: 'break-word' }}>{data.gemini.usable.join('  ')}</p></>}
            </>)}
          </div>
        </>)}
      </main>
    </div>
  );
}
