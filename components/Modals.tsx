'use client';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import type { LabEnv } from '@/lib/types';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal"><h2>{title}</h2>{children}</div>
    </div>
  );
}

export function LabSettings({ env, onClose, onSaved }: { env: LabEnv; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ lab_name: env.lab_name, domain_name: env.domain_name, subnet_cidr: env.subnet_cidr, gateway_ip: env.gateway_ip, dc_ip: env.dc_ip, fs_ip: env.fs_ip, lab_mode: env.lab_mode });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/api/lab', { method: 'PUT', body: f }); onSaved(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not save.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Lab settings" onClose={onClose}>
      <p className="muted small">Use the real values from YOUR lab. Tickets and answer checks use them, so copied answers from other labs fail. Changes apply to new tickets.</p>
      <form onSubmit={save}>
        <label htmlFor="ln">Lab name</label><input id="ln" type="text" value={f.lab_name} onChange={set('lab_name')} maxLength={40} />
        <div className="grid2">
          <div><label htmlFor="dn">Domain name</label><input id="dn" type="text" className="code" value={f.domain_name} onChange={set('domain_name')} /></div>
          <div><label htmlFor="sn">Subnet (CIDR)</label><input id="sn" type="text" className="code" value={f.subnet_cidr} onChange={set('subnet_cidr')} /></div>
          <div><label htmlFor="gw">Gateway IP</label><input id="gw" type="text" className="code" value={f.gateway_ip} onChange={set('gateway_ip')} /></div>
          <div><label htmlFor="dc">Domain controller IP (DC01)</label><input id="dc" type="text" className="code" value={f.dc_ip} onChange={set('dc_ip')} /></div>
          <div><label htmlFor="fs">File server IP (FS01)</label><input id="fs" type="text" className="code" value={f.fs_ip} onChange={set('fs_ip')} /></div>
          <div><label htmlFor="lm">Lab mode</label><select id="lm" value={f.lab_mode} onChange={set('lab_mode')}><option value="lightweight">Lightweight (1 server + 1 client)</option><option value="enterprise">Full enterprise</option></select></div>
        </div>
        <p className="hint-text">Sandbox only: <span className="mono">.local</span> domains and self-signed settings are for learning.</p>
        {err && <p className="alert error" role="alert">{err}</p>}
        <div className="row-actions"><button className="btn primary" type="submit" disabled={busy}>Save</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function ResetDialog({ season, onClose, onDone }: { season: number; onClose: () => void; onDone: () => void }) {
  const [txt, setTxt] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api('/api/reset', { method: 'POST', body: { confirm: txt, from_season: season } }); onDone(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not reset.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Reset workspace" onClose={onClose}>
      <p className="muted small">Nothing is deleted. Your open tickets are archived with your history, a new season starts, and you get a fresh board. Your points and rank stay.</p>
      <form onSubmit={go}>
        <label htmlFor="rs">Type <span className="mono">RESET WORKSPACE</span> to confirm</label>
        <input id="rs" type="text" className="code" value={txt} onChange={(e) => setTxt(e.target.value)} autoComplete="off" />
        {err && <p className="alert error" role="alert">{err}</p>}
        <div className="row-actions"><button className="btn danger" type="submit" disabled={busy || txt !== 'RESET WORKSPACE'}>Archive season and start new</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function ReportDialog({ ticketId, onClose, onDone }: { ticketId: string; onClose: () => void; onDone: () => void }) {
  const [txt, setTxt] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api(`/api/tickets/${ticketId}/report`, { method: 'POST', body: { reason: txt } }); onDone(); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Could not send.'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Report a bad ticket" onClose={onClose}>
      <p className="muted small">Confusing, unrealistic, or impossible in your lab? Tell us briefly. The ticket stays on your board.</p>
      <form onSubmit={go}>
        <label htmlFor="rp">What is wrong?</label>
        <textarea id="rp" value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={500} minLength={5} required />
        {err && <p className="alert error" role="alert">{err}</p>}
        <div className="row-actions"><button className="btn primary" type="submit" disabled={busy}>Send report</button><button type="button" className="btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
