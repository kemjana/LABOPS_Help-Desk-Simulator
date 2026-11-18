'use client';
import { useState } from 'react';
import { CATEGORY_LABEL, type PublicTicket, type Difficulty } from '@/lib/types';

export default function Board({ tickets, recent, selectedId, onSelect, progress, examTags = [], examNote = '' }: {
  examTags?: string[]; examNote?: string;
  tickets: PublicTicket[]; recent: PublicTicket[]; selectedId: string | null; onSelect: (id: string) => void;
  progress: { running: boolean; open: number; target: number };
}) {
  const [f, setF] = useState<'all' | Difficulty>('all');
  const [exam, setExam] = useState<string>('');
  const [showDone, setShowDone] = useState(false);
  const list = tickets.filter((t) => (f === 'all' || t.difficulty === f) && (!exam || (t.exam_tags ?? []).includes(exam)));
  const filters: { k: 'all' | Difficulty; label: string }[] = [{ k: 'all', label: 'All' }, { k: 'easy', label: 'Easy' }, { k: 'medium', label: 'Medium' }, { k: 'hard', label: 'Hard' }];
  return (
    <section aria-label="Ticket board">
      <div className="rail-head"><h2>Ticket board</h2><span className="muted small">{tickets.length} open</span></div>
      <div className="chips" role="group" aria-label="Filter by difficulty">
        {filters.map((x) => <button key={x.k} className="chip" aria-pressed={f === x.k} onClick={() => setF(x.k)}>{x.label}</button>)}
      </div>
      {examTags.length > 0 && <div className="chips" role="group" aria-label="Filter by exam topic"><span className="muted small" style={{ alignSelf: 'center' }}>Topic:</span>{examTags.map((x) => <button key={x} className="chip" aria-pressed={exam === x} onClick={() => setExam(exam === x ? '' : x)}>{x}</button>)}</div>}
      {exam && examNote && <p className="muted small">{examNote}</p>}
      {progress.running && (
        <div className="alert info" role="status">
          Preparing tickets ({progress.open}/{progress.target})
          <div className="bar" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (progress.open / progress.target) * 100)}%` }} /></div>
        </div>
      )}
      {list.map((t) => <TicketCard key={t.id} t={t} active={t.id === selectedId} onSelect={onSelect} />)}
      {!list.length && !progress.running && <p className="muted small">No tickets in this filter.</p>}
      <button className="btn ghost sm" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone} style={{ marginTop: 6 }}>
        {showDone ? 'Hide' : 'Show'} recently resolved ({recent.length})
      </button>
      {showDone && <div style={{ marginTop: 8 }}>{recent.map((t) => <TicketCard key={t.id} t={t} active={t.id === selectedId} onSelect={onSelect} />)}</div>}
    </section>
  );
}

function TicketCard({ t, active, onSelect }: { t: PublicTicket; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button className={`tcard ${t.difficulty}`} aria-current={active} onClick={() => onSelect(t.id)}>
      <span className="top"><span className="mono">{t.ticket_code}</span><span>{t.suggested_minutes} min</span></span>
      <span className="subj">{t.subject}</span>
      <span className="tags">
        <span className={`tag ${t.difficulty}`}>{t.tier} - {t.difficulty}</span>
        <span className="tag">{CATEGORY_LABEL[t.category]}</span>
        <span className="tag pts">{t.status === 'resolved' ? `+${t.points_awarded}` : t.points} pts</span>
        {t.source === 'spaced' && <span className="tag pts" title="A weak topic coming back for review">Review</span>}
        {(t.checkpoint_total ?? 0) > 1 && <span className="tag">{(t.checkpoints_done || []).length}/{t.checkpoint_total} steps</span>}
        {(t.exam_tags ?? []).slice(0, 2).map((x) => <span key={x} className="tag" title="Topic-aligned only">{x}</span>)}
        {t.play_mode === 'console' && <span className="tag">Pre-built lab</span>}
        {t.play_mode === 'vm' && <span className="tag">Own VM</span>}
        {!t.play_mode && t.console_ready && <span className="tag" title="This ticket has a pre-built lab">Lab ready</span>}
        {t.status === 'reopened' && <span className="tag reopened">Reopened</span>}
        {t.status === 'in_progress' && <span className="tag">In progress</span>}
        {t.status === 'resolved' && <span className="tag">Resolved</span>}
      </span>
    </button>
  );
}
