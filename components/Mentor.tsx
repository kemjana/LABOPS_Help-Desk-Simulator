'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { HINT_PENALTY_PCT } from '@/lib/points';
import type { Detail } from './types';

export default function Mentor({ detail, onClose, onChanged }: { detail: Detail | null; onClose: () => void; onChanged: () => void }) {
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [local, setLocal] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const t = detail?.ticket;
  useEffect(() => { setLocal([]); setErr(''); }, [t?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [detail?.messages.length, local.length]);
  const open = !!t && t.status !== 'resolved' && t.status !== 'archived';
  const level = t?.max_hint_level ?? 0;

  async function hint(l: number) {
    if (!t) return; setBusy(true); setErr('');
    try { await api(`/api/tickets/${t.id}/hint`, { method: 'POST', body: { level: l } }); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not get the hint.'); } finally { setBusy(false); }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!t || !text.trim() || busy) return;
    const msg = text.trim(); setText(''); setBusy(true); setErr('');
    setLocal((l) => [...l, { role: 'user', content: msg }]);
    try {
      const r = await api<{ reply: string }>('/api/chat', { method: 'POST', body: { ticket_id: t.id, message: msg } });
      setLocal((l) => [...l, { role: 'assistant', content: r.reply }]);
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message + (e2.detail ? `\n${e2.detail}` : '') : 'The mentor could not answer.'); }
    finally { setBusy(false); }
  }
  const saved = detail?.messages || [];
  const savedKeys = new Set(saved.map((m) => `${m.role}:${m.content}`));
  const extra = local.filter((m) => !savedKeys.has(`${m.role}:${m.content}`));

  return (
    <aside className="mentor" aria-label="SysAdmin Mentor">
      <div className="mentor-head"><div><b>SysAdmin Mentor</b><div className="muted small">Guides you. Does not know the answer key.</div></div><button className="btn sm" onClick={onClose} aria-label="Close mentor">Close</button></div>
      <div className="mentor-body" aria-live="polite">
        {!t && <p className="muted small">Pick a ticket to talk about it.</p>}
        {t && !saved.length && !extra.length && <p className="muted small">Ask about a concept, a command, or where to look. Use the hint ladder below if you are stuck (each level costs points).</p>}
        {saved.map((m) => <div key={m.id} className={`msg ${m.role} ${m.kind === 'hint' ? 'hint' : ''}`}>{m.kind === 'hint' && <small>Hint {m.hint_level} (-{HINT_PENALTY_PCT[m.hint_level || 1]}% points)</small>}{m.content}</div>)}
        {extra.map((m, i) => <div key={`l${i}`} className={`msg ${m.role}`}>{m.content}</div>)}
        {busy && <div className="msg assistant">Thinking...</div>}
        <div ref={endRef} />
      </div>
      <div className="mentor-foot">
        {open && <div className="hint-row" role="group" aria-label="Hint ladder">
          {[1, 2, 3].map((l) => (
            <button key={l} className="btn sm" disabled={busy || l > level + 1} onClick={() => hint(l)} title={`Costs ${HINT_PENALTY_PCT[l]}% of base points`}>
              {l <= level ? `Hint ${l} (shown)` : `Hint ${l} (-${HINT_PENALTY_PCT[l]}%)`}
            </button>))}
        </div>}
        {err && <p className="alert error" role="alert" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{err}</p>}
        <form className="chat-form" onSubmit={send}>
          <label htmlFor="chat" className="sr-only">Message to mentor</label>
          <input id="chat" type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} placeholder={open ? 'Ask the mentor...' : 'Ticket is closed'} disabled={!open || busy} />
          <button className="btn primary" type="submit" disabled={!open || busy || !text.trim()}>Send</button>
        </form>
      </div>
    </aside>
  );
}
