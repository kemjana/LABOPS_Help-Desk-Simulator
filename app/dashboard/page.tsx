'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import NavTabs from '@/components/NavTabs';
import RadarChart from '@/components/RadarChart';
import SaveProgress from '@/components/SaveProgress';
import Board from '@/components/Board';
import TicketView from '@/components/TicketView';
import Mentor from '@/components/Mentor';
import { LabSettings, ReportDialog, ResetDialog } from '@/components/Modals';
import type { AppState, Detail, SubmitResult } from '@/components/types';
import { api, ApiError, localDayString, tzOffset } from '@/lib/api-client';
import { sb } from '@/lib/supabase-browser';
import { ensureSession } from '@/lib/supabase-browser';
import { CATEGORIES, CATEGORY_LABEL } from '@/lib/types';

export default function Dashboard() {
  const router = useRouter();
  const [state, setState] = useState<AppState | null>(null);
  const [fatal, setFatal] = useState<{ message: string; detail?: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [view, setView] = useState<'board' | 'ticket'>('board');
  const [mentor, setMentor] = useState(false);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<'lab' | 'reset' | 'report' | null>(null);
  const [toast, setToast] = useState('');
  const [progress, setProgress] = useState({ running: false, open: 0, target: 7 });
  const [bannerOff, setBannerOff] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [yDay, setYDay] = useState<string | null>(null);
  const refilling = useRef(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const fail = (e: unknown) => setFatal({ message: e instanceof Error ? e.message : 'Unexpected error', detail: e instanceof ApiError ? e.detail : undefined });

  const loadState = useCallback(async () => { const s = await api<AppState>('/api/state'); setState(s); return s; }, []);
  const loadDetail = useCallback(async (id: string) => { setDetail(await api<Detail>(`/api/tickets/${id}/messages`)); }, []);

  // Fill the board in small separate requests (2 tickets each) so we stay inside Vercel time limits.
  const refill = useCallback(async () => {
    if (refilling.current) return; refilling.current = true;
    try {
      setProgress((p) => ({ ...p, running: true }));
      for (let i = 0; i < 6; i++) {
        let r: { created: number; open: number; target: number; done: boolean };
        try { r = await api('/api/board/refill', { method: 'POST', body: {} }); }
        catch { r = await api('/api/board/refill', { method: 'POST', body: { fast: true } }); } // slow AI or server? retry once with simple wording (no AI)
        setProgress({ running: !r.done && r.created > 0, open: r.open, target: r.target });
        await loadState();
        if (r.done || r.created === 0) break;
      }
    } catch (e) { say(e instanceof ApiError ? `Could not prepare tickets: ${e.message}` : 'Could not prepare tickets.'); }
    finally { refilling.current = false; setProgress((p) => ({ ...p, running: false })); }
  }, [loadState]);

  // Prepare yesterday's debrief when the app opens (no background jobs). Once per local day.
  async function prepareYesterday() {
    try {
      const today = localDayString(); if (localStorage.getItem('labops-prep') === today) { const d = localStorage.getItem('labops-ydebrief'); if (d && localStorage.getItem('labops-seen-debrief') !== d) setYDay(d); return; }
      const r = await api<{ day: string; ready: boolean }>('/api/debrief/prepare', { method: 'POST', body: { today, tz: tzOffset() } });
      localStorage.setItem('labops-prep', today); if (r.ready) { localStorage.setItem('labops-ydebrief', r.day); if (localStorage.getItem('labops-seen-debrief') !== r.day) setYDay(r.day); }
    } catch { /* optional feature: ignore */ }
  }
  useEffect(() => {
    (async () => {
      try {
        const token = await ensureSession(false);
        if (!token) { router.replace('/'); return; }
        await api('/api/bootstrap', { method: 'POST', body: {} });
        const s = await loadState();
        try { setBannerOff(localStorage.getItem('labops-banner-off') === '1'); } catch { /* ignore */ }
        if (s.board.needs_refill) await refill();
        prepareYesterday();
      } catch (e) { fail(e); }
    })();
  }, [router, loadState, refill]);

  useEffect(() => { if (selected) loadDetail(selected).catch(fail); }, [selected, loadDetail]);

  function pick(id: string) { setSelected(id); setView('ticket'); }
  async function afterChange() { if (selected) await loadDetail(selected); await loadState(); }
  async function afterSubmit(r: SubmitResult) {
    if (selected) await loadDetail(selected);
    const s = await loadState();
    if (r.resolved) { say(`+${r.points?.total ?? 0} points!${r.new_badges?.length ? ` Badge: ${r.new_badges.join(', ').replace(/_/g, ' ')}` : ''}`); if (s.tickets.length < s.board.target) refill(); }
    else if (r.passed) say('Checkpoint passed!');
  }

  if (fatal) return (
    <div className="center"><div className="card" style={{ maxWidth: 560 }}>
      <h2>Could not open your workspace</h2>
      <p className="alert error" role="alert">{fatal.message}</p>
      {fatal.detail && <pre className="code small" style={{ whiteSpace: 'pre-wrap' }}>{fatal.detail}</pre>}
      <div className="row-actions"><button className="btn primary" onClick={() => location.reload()}>Retry</button><Link className="btn" href="/setup-check">Run Setup check</Link><Link className="btn" href="/">Home</Link></div>
    </div></div>
  );
  if (!state) return <div className="center"><div className="progress"><p>Opening your workspace...</p><div className="bar" style={{ marginTop: 10 }}><i style={{ width: '40%' }} /></div></div></div>;

  const { env, profile } = state;
  const rankPct = profile.rank.next ? Math.min(100, ((profile.points - profile.rank.floor) / (profile.rank.next.at - profile.rank.floor)) * 100) : 100;
  const maxSkill = Math.max(10, ...CATEGORIES.map((c) => state.skills[c].points));
  const showBanner = !bannerOff && profile.resolved_total >= 1 && state.account.is_anonymous;

  return (
    <div className="app">
      <header className="app-head">
        <Logo />
        <NavTabs current="tickets" />
        <span className="badge lab mono" title="Active lab">{env.domain_name} &bull; {env.subnet_cidr}</span>
        <span className="badge" title="Lab mode">{env.lab_mode === 'lightweight' ? 'Lightweight' : 'Enterprise'}</span>
        <div className="spacer" />
        <div className="rank-chip" aria-label="Rank and points">
          <span className="row"><b>{profile.rank.name}</b><span>{profile.points} pts</span></span>
          <span className="bar" role="progressbar" aria-valuenow={Math.round(rankPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next rank"><i style={{ width: `${rankPct}%` }} /></span>
        </div>
        <span className="badge" title="Days in a row with a resolved ticket">Streak {profile.streak}</span>
        <ThemeToggle />
        <div className="menu-wrap">
          <button className="icon-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((m) => !m)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          {menu && <div className="menu" role="menu" onClick={() => setMenu(false)}>
            <div className="muted small" style={{ padding: '6px 10px' }}>{state.account.is_anonymous ? 'Guest session active' : `Saved: ${state.account.email ?? 'account'}`}</div>
            {state.account.is_anonymous && <button role="menuitem" onClick={() => setSaveOpen(true)}>Save my progress</button>}
            <Link role="menuitem" href="/debrief">End my shift (debrief)</Link>
            <Link role="menuitem" href="/export">Runbook and journal</Link>
            <button role="menuitem" onClick={() => setModal('lab')}>Lab settings</button>
            <button role="menuitem" onClick={() => setMentor(true)}>Open mentor</button>
            <Link role="menuitem" href="/setup-check">Setup check</Link>
            <button role="menuitem" onClick={() => setModal('reset')}>Reset workspace</button>
            {!state.account.is_anonymous && <button role="menuitem" onClick={async () => { await sb().auth.signOut(); location.href = '/'; }}>Sign out</button>}
          </div>}
        </div>
      </header>
      {showBanner && <div className="banner" role="note"><span>Your progress lives in this browser session. <b>Save it to an email or Google account</b> so you never lose it.</span><span style={{ display: 'flex', gap: 6 }}><button className="btn sm primary" onClick={() => setSaveOpen(true)}>Save my progress</button><button className="btn sm" onClick={() => { setBannerOff(true); try { localStorage.setItem('labops-banner-off', '1'); } catch { /* ignore */ } }}>Later</button></span></div>}
      {yDay && <div className="banner" role="note"><span>Yesterday&apos;s debrief ({yDay}) is ready.</span><span style={{ display: 'flex', gap: 6 }}><Link className="btn sm primary" href={`/debrief?day=${yDay}`} onClick={() => { try { localStorage.setItem('labops-seen-debrief', yDay); } catch { /* ignore */ } }}>View</Link><button className="btn sm" onClick={() => { try { localStorage.setItem('labops-seen-debrief', yDay); } catch { /* ignore */ } setYDay(null); }}>Dismiss</button></span></div>}
      {state.practice.due > 0 && <div className="banner" role="note"><span>{state.practice.due} review ticket{state.practice.due > 1 ? 's are' : ' is'} due. They appear on your board with a <b>Review</b> tag when a slot opens.</span></div>}

      <div className={`layout ${mentor ? 'with-mentor' : ''}`} data-view={view}>
        <nav className="pane rail" aria-label="Tickets">
          <Board tickets={state.tickets} recent={state.recent_resolved} selectedId={selected} onSelect={pick} progress={progress} examTags={state.exam.tags} examNote={state.exam.note} />
          <div className="card" style={{ marginTop: 14 }}>
            <h3>Skill points</h3>
            <RadarChart skills={state.skills} size={240} />
            <div className="skills">{CATEGORIES.map((c) => (
              <div className="s" key={c}><span>{CATEGORY_LABEL[c]}</span><span className="bar"><i style={{ width: `${(state.skills[c].points / maxSkill) * 100}%` }} /></span><b>{state.skills[c].points}</b></div>))}</div>
          </div>
          <div className="card"><h3>Badges ({state.badges.earned.length}/{state.badges.catalog.length})</h3><div className="badge-strip">{state.badges.catalog.map((b) => { const got = state.badges.earned.some((e) => e.badge_id === b.id); return <span key={b.id} className={`badge-chip ${got ? '' : 'locked'}`} title={b.desc}><i>{b.icon}</i>{b.name}</span>; })}</div></div>
        </nav>
        <main className="pane">
          {detail && selected && detail.ticket.id === selected ? (
            <TicketView detail={detail} onChanged={afterChange} onSubmitted={afterSubmit} onReport={() => setModal('report')} onBack={() => setView('board')} onOpenMentor={() => setMentor(true)} />
          ) : (
            <div className="work"><div className="card"><h2>Pick a ticket</h2><p className="muted" style={{ marginTop: 6 }}>Choose any ticket from the board. You can leave it and come back later. Nothing is deleted.</p>
              <p className="muted small" style={{ marginTop: 10 }}>Sandbox only: all people and data are fictional. <span className="mono">.local</span> domains are for learning.</p></div></div>
          )}
        </main>
        {mentor && <Mentor detail={detail && detail.ticket.id === selected ? detail : null} onClose={() => setMentor(false)} onChanged={afterChange} />}
      </div>

      {modal === 'lab' && <LabSettings env={env} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await loadState(); say('Lab saved. New tickets will use these values.'); }} />}
      {modal === 'reset' && <ResetDialog season={profile.season_no} onClose={() => setModal(null)} onDone={async () => { setModal(null); setSelected(null); setDetail(null); setView('board'); await loadState(); say('New season started. Old tickets are archived.'); refill(); }} />}
      {modal === 'report' && selected && <ReportDialog ticketId={selected} onClose={() => setModal(null)} onDone={async () => { setModal(null); await afterChange(); say('Report sent. Thank you!'); }} />}
      {saveOpen && <SaveProgress mode="save" onClose={() => setSaveOpen(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
