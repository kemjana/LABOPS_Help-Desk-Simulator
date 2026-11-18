'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { ensureSession } from '@/lib/supabase-browser';
import { api } from '@/lib/api-client';
import SaveProgress from '@/components/SaveProgress';

export default function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [signin, setSignin] = useState(false);

  async function launch() {
    setBusy(true); setError('');
    try {
      await ensureSession(true);          // silent guest sign-in, no forms
      await api('/api/bootstrap', { method: 'POST', body: {} });
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Logo />
        <div className="topbar-right">
          <Link className="link-quiet" href="/setup-check">Setup check</Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="hero">
        <p className="eyebrow mono">IT service desk simulator</p>
        <h1>Learn sysadmin work by fixing real tickets in <span className="hl">your own</span> Active Directory lab.</h1>
        <p className="lead">Build a small Windows Server lab, then work a board of realistic help desk tickets. Fix them in your own VMs, write up what you found, and get checklist-based feedback.</p>
        <div className="cta-row">
          <button className="btn primary big" onClick={launch} disabled={busy}>{busy ? 'Starting your workspace...' : 'Launch LabOps Workspace'}</button>
          <span className="muted small">No sign-up. Starts as a guest.</span>
          <button className="btn ghost" onClick={() => setSignin(true)}>I saved my progress: sign in</button>
        </div>
        {error && <p className="alert error" role="alert">{error}</p>}
        <ul className="feature-grid">
          <li><h3>Ticket board</h3><p>6-8 tickets at a time, from Tier 1 to Tier 3. You choose what to work on.</p></li>
          <li><h3>Your lab, your values</h3><p>Answers must include output from your own lab, so copied answers fail.</p></li>
          <li><h3>Hints, not spoilers</h3><p>A 3-level hint ladder and a mentor chat that never sees the answer key.</p></li>
        </ul>
        <p className="muted small disclaimer">Sandbox only. All people, companies and data are fictional. <span className="mono">.local</span> domains and self-signed settings are for learning, never for production.</p>
      </main>
      {signin && <SaveProgress mode="signin" onClose={() => setSignin(false)} />}
    </div>
  );
}
