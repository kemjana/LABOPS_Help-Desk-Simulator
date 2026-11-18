'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { sb } from '@/lib/supabase-browser';
import { compressToWebp } from '@/lib/image';
import { CATEGORY_LABEL } from '@/lib/types';
import Console from './Console';
import VmPanel from './VmPanel';
import { REASON_LABEL, type Detail, type SubmitResult } from './types';

function ReplyCard({ ticketId, name, onDone }: { ticketId: string; name: string; onDone: () => void }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const key = useRef<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const r = await api<{ passed: boolean; met: number; total: number; review: string[]; bonus: number }>(`/api/tickets/${ticketId}/reply`, { method: 'POST', body: { attempt_key: key.current, reply: text } });
      key.current = null;
      if (r.passed) { setOk(true); setMsg(`Great reply! +${r.bonus} points.`); onDone(); } else { setMsg(`${r.met} of ${r.total} tone checks. Work on: ${r.review.join(', ')}. Edit and try again.`); }
    } catch (x) { setMsg(x instanceof ApiError ? x.message : 'Could not send.'); } finally { setBusy(false); }
  }
  return (
    <form className="card" onSubmit={send} aria-label="Reply to the user">
      <h3>Reply to {name} (optional, +3 points)</h3>
      <p className="muted small">Write the short message you would send to close the ticket. Be kind and clear, say what to do next, and never put a password in the message.</p>
      <label htmlFor="reply">Your reply</label>
      <textarea id="reply" value={text} onChange={(e) => setText(e.target.value)} minLength={30} maxLength={800} required />
      {msg && <p className={`alert ${ok ? 'ok' : 'info'}`} role="status">{msg}</p>}
      <div className="row-actions"><button className="btn primary" type="submit" disabled={busy || ok}>{busy ? 'Checking...' : 'Send reply'}</button></div>
    </form>
  );
}

function ProofThumb({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { sb().storage.from('proofs').createSignedUrl(path, 300).then(({ data }) => setUrl(data?.signedUrl ?? '')).catch(() => setUrl('')); }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img className="thumb" src={url} alt="Screenshot you attached" /></a> : <span className="muted small">(screenshot)</span>;
}

export default function TicketView({ detail, onChanged, onSubmitted, onReport, onBack, onOpenMentor }: {
  detail: Detail; onChanged: () => void; onSubmitted: (r: SubmitResult) => void; onReport: () => void; onBack: () => void; onOpenMentor: () => void;
}) {
  const t = detail.ticket;
  const [root, setRoot] = useState(''); const [steps, setSteps] = useState(''); const [proof, setProof] = useState('');
  const [shot, setShot] = useState<{ blob: Blob; preview: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [replyDone, setReplyDone] = useState(false);
  const keyRef = useRef<string | null>(null);      // same key if the request is retried => never graded twice
  const shotPath = useRef<string | null>(null);

  useEffect(() => { setRoot(''); setSteps(''); setProof(''); setShot(null); setErr(''); setResult(null); setChoosing(false); setReplyDone(false); keyRef.current = null; shotPath.current = null; }, [t.id]);
  useEffect(() => {
    if (!t.started_at || t.status === 'resolved') { setElapsed(null); return; }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(t.started_at as string)) / 60000)));
    tick(); const i = setInterval(tick, 30000); return () => clearInterval(i);
  }, [t.started_at, t.status]);

  const closed = t.status === 'resolved' || t.status === 'archived';
  const cps = detail.checkpoints; const doneIds = t.checkpoints_done || [];
  const cur = cps ? cps.find((c) => !doneIds.includes(c.id)) ?? null : null;
  const mode = t.play_mode;
  const canSwitch = mode && t.attempts_count === 0;

  async function choose(m: 'console' | 'vm') {
    setBusy(true); setErr('');
    try { await api(`/api/tickets/${t.id}/start`, { method: 'POST', body: { mode: m } }); setChoosing(false); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not start the ticket.'); } finally { setBusy(false); }
  }
  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setErr('');
    try { const blob = await compressToWebp(f); setShot({ blob, preview: URL.createObjectURL(blob) }); shotPath.current = null; }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not use that image.'); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setErr('');
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    try {
      const body: Record<string, unknown> = { attempt_key: keyRef.current, root_cause: root };
      if (cur) body.checkpoint = cur.id;
      if (mode === 'vm') {
        body.steps = steps; body.proof_value = proof;
        if (shot) {
          if (!shotPath.current) {
            const { data } = await sb().auth.getSession(); const uid = data.session?.user.id; if (!uid) throw new Error('Session missing. Reload the page.');
            const path = `${uid}/${t.id}/${crypto.randomUUID()}.webp`;
            const up = await sb().storage.from('proofs').upload(path, shot.blob, { contentType: 'image/webp', upsert: false });
            if (up.error) throw new Error(`Screenshot upload failed: ${up.error.message}`);
            shotPath.current = path;
          }
          body.screenshot_path = shotPath.current;
        }
      }
      const r = await api<SubmitResult>(`/api/tickets/${t.id}/submit`, { method: 'POST', body });
      keyRef.current = null; shotPath.current = null; setResult(r); onSubmitted(r);
      if (!r.passed) { setRoot(''); setSteps(''); setProof(''); setShot(null); }
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message + (e2.detail ? `\n${e2.detail}` : '') : e2 instanceof Error ? e2.message : 'Submit failed.'); }
    finally { setBusy(false); }
  }

  const showChoice = !closed && (!mode || choosing);
  return (
    <div className="work">
      <button className="btn ghost sm" onClick={onBack} style={{ marginBottom: 10 }} aria-label="Back to ticket board">&larr; Board</button>
      <article className="card">
        <div className="tk-head">
          <div>
            <span className="mono muted">{t.ticket_code}</span>
            <h2>{t.subject}</h2>
            <div className="tags">
              <span className={`tag ${t.difficulty}`}>{t.tier} - {t.difficulty}</span><span className="tag">{CATEGORY_LABEL[t.category]}</span>
              <span className="tag">Priority: {t.priority}</span><span className="tag pts">{t.points} pts</span>
              {t.status === 'reopened' && <span className="tag reopened">Reopened</span>}
            </div>
          </div>
          <button className="btn sm" onClick={onOpenMentor}>Open mentor</button>
        </div>
        <div className="meta">
          <div><span>Requester</span>{t.requester_name} <span className="mono">({t.requester_username})</span></div>
          <div><span>Department</span>{t.department}</div>
          <div><span>Affected machine</span><b className="mono">{t.affected_host}</b></div>
          <div><span>Suggested time</span>{t.suggested_minutes} min{elapsed !== null ? ` (working ${elapsed} min)` : ''}</div>
        </div>
        <p className="desc">{t.description}</p>
        {t.status === 'reopened' && t.reopen_message && <div className="push" role="status"><b>{t.requester_name} replied:</b> {t.reopen_message}{t.ai_feedback && <div className="muted small" style={{ marginTop: 4 }}>{t.ai_feedback}</div>}</div>}
        <div className="row-actions">
          {!closed && mode && <span className="tag">Working in: {mode === 'console' ? 'Pre-built lab' : 'My own VM'}</span>}
          {!closed && canSwitch && !choosing && <button className="btn sm ghost" onClick={() => setChoosing(true)}>Switch mode</button>}
          <button className="btn sm ghost" onClick={onReport} disabled={t.reported}>{t.reported ? 'Reported - thank you' : 'Report a bad ticket'}</button>
        </div>
      </article>

      {showChoice && (
        <section className="card" aria-label="Choose how to work this ticket">
          <h3>How do you want to work this ticket?</h3>
          <div className="mode-choice">
            <button className="mode-card" disabled={busy || !t.console_ready} onClick={() => choose('console')}>
              <b>Pre-built lab</b>
              <span>The problem is already set up in a practice console in your browser. Nothing to install. Simulated, not real Windows.</span>
              {!t.console_ready && <span className="tag">Not available for this ticket yet</span>}
            </button>
            <button className="mode-card" disabled={busy} onClick={() => choose('vm')}>
              <b>My own VM</b>
              <span>Work in your own Windows Server lab. {t.script_ready ? 'You get a ready-made script that sets up the problem.' : 'No script for this ticket yet: you set up the problem yourself.'}</span>
              <span className="tag">+{t.difficulty === 'easy' ? 3 : t.difficulty === 'medium' ? 5 : 10} bonus points</span>
            </button>
          </div>
          {choosing && <button className="btn sm ghost" onClick={() => setChoosing(false)}>Keep my current choice</button>}
          {err && <p className="alert error" role="alert">{err}</p>}
        </section>
      )}

      {!closed && mode === 'console' && !choosing && <Console ticketId={t.id} onCommand={() => undefined} />}
      {!closed && mode === 'vm' && !choosing && <VmPanel ticketId={t.id} scriptReady={!!t.script_ready} />}

      {result?.passed && !result.resolved && <div className="alert ok" role="status"><b>Checkpoint passed.</b> {result.feedback}</div>}
      {result?.resolved && (
        <div className="success" role="status">
          <b>Ticket resolved!</b> {result.feedback}
          {result.points && <ul className="pt-lines">{result.points.lines.map((l) => <li key={l.reason}><span>{REASON_LABEL[l.reason] || l.reason}</span><b>{l.delta > 0 ? '+' : ''}{l.delta}</b></li>)}<li><span>Total</span><b>+{result.points.total}</b></li></ul>}
          <p className="small" style={{ marginTop: 6 }}>Rank: {result.profile.rank.name} - {result.profile.points} pts - streak {result.profile.streak} day(s)</p>
          {result.new_badges?.length > 0 && <p className="small"><b>New badge{result.new_badges.length > 1 ? 's' : ''}:</b> {result.new_badges.join(', ').replace(/_/g, ' ')}</p>}
        </div>
      )}
      {result && !result.passed && <div className="push" role="status"><b>Not quite yet.</b> {result.feedback}{result.pushback && <div style={{ marginTop: 4 }}>{t.requester_name}: &ldquo;{result.pushback}&rdquo;</div>}</div>}

      {cps && !closed && (
        <section className="card" aria-label="Checkpoints"><h3>Multi-step ticket: {doneIds.length} of {cps.length} checkpoints done</h3>
          <ol className="stepper">{cps.map((c, i) => <li key={c.id} className={doneIds.includes(c.id) ? 'ok' : cur?.id === c.id ? 'cur' : ''}><b>{doneIds.includes(c.id) ? '\u2713' : i + 1}</b><span><b>{c.title}</b>{cur?.id === c.id && <span className="muted"> - {c.prompt}</span>}</span></li>)}</ol>
          <p className="muted small">Each step is graded on its own. Points are paid when the last step passes. Multi-step tickets are done in your own VM.</p></section>
      )}
      {!closed && mode && !choosing && (
        <form className="card" onSubmit={submit} aria-label="Resolution form">
          <h3>Resolution</h3>
          <p className="muted small">{mode === 'console' ? 'Fix it in the pre-built lab above. The commands you ran are recorded automatically. Then explain the cause. Your text is treated as data only.' : 'Fix it in your own lab VMs first. Then write what you found. Your text is treated as data only.'}</p>
          <label htmlFor="root">Root cause (what was wrong and why)</label>
          <textarea id="root" value={root} onChange={(e) => setRoot(e.target.value)} maxLength={1500} required minLength={15} placeholder="Explain the cause in your own words..." />
          {mode === 'vm' && (<>
            <label htmlFor="steps">Steps / commands you used</label>
            <textarea id="steps" className="code" value={steps} onChange={(e) => setSteps(e.target.value)} maxLength={2500} required minLength={5} placeholder="e.g. Get-ADUser ... ; Set-... ; gpupdate /force" />
            <div className="proof-box"><b>Lab evidence {(!cur || cur.proof) ? 'needed' : '(optional for this step)'}:</b> {t.proof_prompt}</div>
            <label htmlFor="proof">Paste the output from YOUR lab</label>
            <textarea id="proof" className="code" value={proof} onChange={(e) => setProof(e.target.value)} maxLength={1500} required={!cur || cur.proof} minLength={!cur || cur.proof ? 3 : 0} placeholder={!cur || cur.proof ? 'Output copied from your VM...' : 'Optional for this step'} />
            <label htmlFor="shot">Screenshot (optional)</label>
            <input id="shot" type="file" accept="image/*" onChange={pickFile} />
            <p className="hint-text">Shrunk in your browser to WebP under 300 KB, then stored in your private folder.</p>
            {shot && <div className="row-actions"><img className="thumb" src={shot.preview} alt="Preview of your screenshot" /><span className="muted small">{Math.round(shot.blob.size / 1024)} KB</span><button type="button" className="btn sm ghost" onClick={() => { setShot(null); shotPath.current = null; }}>Remove</button></div>}
          </>)}
          {err && <p className="alert error" role="alert" style={{ whiteSpace: 'pre-wrap' }}>{err}</p>}
          <div className="row-actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? 'Grading... (up to 30 s)' : 'Submit resolution'}</button></div>
        </form>
      )}
      {detail.attempts.some((a) => a.screenshot_path) && <div className="card"><h3>Your screenshots</h3><div className="row-actions">{detail.attempts.filter((a) => a.screenshot_path).map((a) => <ProofThumb key={a.id} path={a.screenshot_path as string} />)}</div></div>}
      {t.status === 'resolved' && (!detail.reply.passed || replyDone) && <ReplyCard ticketId={t.id} name={t.requester_name} onDone={() => { setReplyDone(true); onChanged(); }} />}
      {t.status === 'resolved' && !result && <p className="alert ok">This ticket is resolved (+{t.points_awarded} pts{t.solved_mode ? `, ${t.solved_mode === 'vm' ? 'own VM' : 'pre-built lab'}` : ''}). {t.ai_feedback}</p>}
    </div>
  );
}
