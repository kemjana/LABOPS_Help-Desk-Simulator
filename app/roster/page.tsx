'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import NavTabs from '@/components/NavTabs';
import PasswordScript from '@/components/PasswordScript';
import type { AppState } from '@/components/types';
import { api, ApiError } from '@/lib/api-client';
import { ensureSession } from '@/lib/supabase-browser';

export default function Roster() {
  const router = useRouter();
  const [s, setS] = useState<AppState | null>(null); const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setS(await api<AppState>('/api/state')); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load.'); } }, []);
  useEffect(() => { (async () => { if (!(await ensureSession(false))) { router.replace('/'); return; } await load(); })(); }, [router, load]);
  async function toggle(username: string, v: boolean) {
    setErr(''); setS((p) => (p ? { ...p, roster: p.roster.map((r) => (r.username === username ? { ...r, is_active: v } : r)) } : p));
    try { await api(`/api/roster/${encodeURIComponent(username)}`, { method: 'PUT', body: { is_active: v } }); await load(); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not change.'); await load(); }
  }
  return (
    <div className="page">
      <header className="topbar"><div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}><Logo /><NavTabs current="roster" /></div><div className="topbar-right"><ThemeToggle /></div></header>
      <main className="hero" style={{ paddingTop: 24 }}>
        <h1 style={{ fontSize: 28 }}>Company roster</h1>
        <p className="lead" style={{ fontSize: 16 }}>These fictional employees are the people in your tickets. They must exist in your real Active Directory too (use the script below). If your VM and this list drift apart, run the script again.</p>
        {err && <p className="alert error" role="alert">{err}</p>}
        {!s ? <p className="muted">Loading...</p> : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table"><thead><tr><th>Name</th><th>Username</th><th>Department</th><th>Title</th><th>Active</th></tr></thead>
              <tbody>{s.roster.map((r) => (
                <tr key={r.username}><td>{r.full_name}</td><td className="mono">{r.username}</td><td>{r.department}</td><td>{(r as { job_title?: string }).job_title}</td>
                  <td><label className="switch"><input type="checkbox" checked={r.is_active} onChange={(e) => toggle(r.username, e.target.checked)} aria-label={`${r.full_name} is active`} /> {r.is_active ? 'Active' : 'Off'}</label></td></tr>))}</tbody></table>
            <p className="muted small" style={{ marginTop: 8 }}>Only active employees appear in new tickets. When you run the script, an employee switched off is created disabled.</p>
          </div>)}
        <PasswordScript />
        <p className="muted small">All names are fictional. Domain: <span className="mono">{s?.env.domain_name}</span>. Sandbox only.</p>
      </main>
    </div>
  );
}
