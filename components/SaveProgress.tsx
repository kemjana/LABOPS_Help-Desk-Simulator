'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase-browser';

/** Turns the guest into a saved account: the same user id is kept, so tickets and points stay. */
export default function SaveProgress({ mode, onClose }: { mode: 'save' | 'signin'; onClose: () => void }) {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [sent, setSent] = useState(false);
  const here = () => `${location.origin}/dashboard`;
  const explain = (m: string) => /manual linking|linking is disabled/i.test(m) ? `${m} In Supabase turn on Authentication > Sign In / Providers > "Allow manual linking".` : /provider is not enabled|unsupported provider/i.test(m) ? `${m} In Supabase enable that provider under Authentication > Sign In / Providers.` : m;
  async function sendLink(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = mode === 'save'
        ? await sb().auth.updateUser({ email: email.trim() }, { emailRedirectTo: here() })
        : await sb().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: here() } });
      if (r.error) throw new Error(r.error.message);
      setSent(true);
    } catch (x) { setErr(explain(x instanceof Error ? x.message : 'Something went wrong.')); } finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setErr('');
    try {
      const r = mode === 'save' ? await sb().auth.linkIdentity({ provider: 'google', options: { redirectTo: here() } }) : await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } });
      if (r.error) throw new Error(r.error.message);
    } catch (x) { setErr(explain(x instanceof Error ? x.message : 'Something went wrong.')); setBusy(false); }
  }
  return (
    <div className="modal-bg" role="dialog" aria-modal="true" aria-label={mode === 'save' ? 'Save my progress' : 'Sign in'} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="modal">
        <h2>{mode === 'save' ? 'Save my progress' : 'Sign in to my saved progress'}</h2>
        {sent ? (<>
          <p className="alert ok" role="status">Check your inbox at <b>{email}</b> and open the link{mode === 'save' ? ' to confirm. Your tickets and points stay exactly as they are.' : '. You will be signed in here.'} It can take a minute. Also look in spam.</p>
          <div className="row-actions"><button className="btn primary" onClick={onClose}>Done</button></div>
        </>) : (<>
          <p className="muted small">{mode === 'save' ? 'Link an email or Google account to this guest session. Nothing is lost: it is the same workspace, now saved.' : 'Use the email you saved with. We send you a one-time link, no password needed. (Signing in replaces the guest session on this device.)'}</p>
          <form onSubmit={sendLink}>
            <label htmlFor="sp-email">Email</label>
            <input id="sp-email" type="text" inputMode="email" autoComplete="email" className="code" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
            {err && <p className="alert error" role="alert">{err}</p>}
            <div className="row-actions"><button className="btn primary" type="submit" disabled={busy || !/^\S+@\S+\.\S+$/.test(email.trim())}>{busy ? 'Sending...' : mode === 'save' ? 'Send confirmation link' : 'Send sign-in link'}</button>
              <button type="button" className="btn" onClick={google} disabled={busy}>Continue with Google</button><button type="button" className="btn ghost" onClick={onClose}>Cancel</button></div>
          </form>
        </>)}
      </div>
    </div>
  );
}
