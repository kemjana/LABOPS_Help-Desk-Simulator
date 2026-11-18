// TEST-ONLY fake Supabase (auth + PostgREST subset) so the app can be tested without a real project.
// It does NOT test Row Level Security (that needs a real Supabase). It DOES check the apikey/Authorization header rule.
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.MOCK_SB_PORT || 54321);
const tables = {};
const T = (n) => (tables[n] ||= []);
const UNIQUE = {
  profiles: [['user_id']], lab_environments: [['user_id']], lab_directory_users: [['env_id', 'username']], seasons: [['user_id', 'season_no']],
  tickets: [['id'], ['user_id', 'ticket_code']], ticket_secrets: [['ticket_id']], ticket_attempts: [['id'], ['ticket_id', 'attempt_no'], ['user_id', 'attempt_key']],
  attempt_criteria: [['attempt_id', 'criterion_id']], points_ledger: [['idempotency_key']], ticket_blueprints: [['id']], console_sessions: [['ticket_id']], practice_queue: [['user_id', 'blueprint_id']], user_badges: [['user_id', 'badge_id']], ticket_replies: [['user_id', 'attempt_key']], daily_debriefs: [['user_id', 'local_day']],
};
const DEFAULTS = {
  profiles: () => ({ season_no: 1, points: 0, rank: 'Help Desk Intern', streak: 0, last_active_day: null }),
  lab_environments: () => ({ id: randomUUID(), setup_completed: false, setup_progress: {} }),
  lab_directory_users: () => ({ id: randomUUID(), is_active: true }),
  tickets: () => ({ source: 'normal', checkpoints_done: [], play_mode: null, solved_mode: null, attempts_count: 0, max_hint_level: 0, points_awarded: 0, reported: false, ai_feedback: null, reopen_message: null, started_at: null, resolved_at: null, status: 'open' }),
  ticket_attempts: () => ({ id: randomUUID() }), attempt_criteria: () => ({ id: randomUUID() }), ticket_messages: () => ({ id: randomUUID(), hint_level: null }),
  ticket_reports: () => ({ id: randomUUID() }),
  console_sessions: () => ({ id: randomUUID(), version: 1 }),
  practice_queue: () => ({ id: randomUUID(), box: 1, status: 'pending', last_ticket_id: null }),
  ticket_replies: () => ({ id: randomUUID() }),
  daily_debriefs: () => ({ id: randomUUID(), narrative: null }),
};
let ledgerSeq = 1;
const counters = new Map();
const sessions = new Map(); // access token -> user id
const users = new Map();   // user id -> { is_anonymous, email, new_email }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeSession(uid) {
  if (!users.has(uid)) users.set(uid, { is_anonymous: true, email: null, new_email: null });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated', is_anonymous: true, aud: 'authenticated' })}.${randomUUID().replace(/-/g, '')}`;
  sessions.set(access, uid);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${randomUUID()}`,
    user: { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
}
const refresh = new Map();

function match(row, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const cell = row[k];
    if (v.startsWith('eq.')) { if (String(cell) !== v.slice(3)) return false; }
    else if (v.startsWith('in.(')) { const set = v.slice(4, -1).split(',').map(decodeURIComponent); if (!set.includes(String(cell))) return false; }
    else if (v === 'is.null') { if (cell !== null && cell !== undefined) return false; }
    else return false;
  }
  return true;
}
const sameKey = (a, b, cols) => cols.every((c) => String(a[c]) === String(b[c]));

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*', ...extra });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = ''; for await (const c of req) raw += c;
  let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
  const apikey = req.headers.apikey || '';
  const auth = req.headers.authorization || '';

  // ---- auth ----
  if (url.pathname === '/auth/v1/signup' && req.method === 'POST') { const uid = randomUUID(); const s = makeSession(uid); refresh.set(s.refresh_token, uid); return send(res, 200, s); }
  if (url.pathname === '/auth/v1/token') {
    const uid = refresh.get(body?.refresh_token); if (!uid) return send(res, 400, { message: 'bad refresh' });
    const s = makeSession(uid); refresh.set(s.refresh_token, uid); return send(res, 200, s);
  }
  if (url.pathname === '/auth/v1/user') {
    const tok = auth.replace(/^Bearer /, ''); const uid = sessions.get(tok);
    if (!uid) return send(res, 401, { message: 'invalid JWT' });
    const u = users.get(uid) || { is_anonymous: true, email: null };
    if (req.method === 'PUT') { u.new_email = body?.email || u.new_email; users.set(uid, u); }
    return send(res, 200, { id: uid, aud: 'authenticated', role: 'authenticated', is_anonymous: u.is_anonymous, email: u.email, new_email: u.new_email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
  }
  if (url.pathname === '/auth/v1/otp') return send(res, 200, {});
  if (url.pathname === '/__confirm') { const uid = url.searchParams.get('uid'); const u = users.get(uid); if (u) { u.email = url.searchParams.get('email'); u.is_anonymous = false; u.new_email = null; } return send(res, 200, { ok: !!u }); }
  // ---- storage (private bucket, own-folder policy) ----
  if (url.pathname.startsWith('/storage/v1/')) {
    const uid = sessions.get(auth.replace(/^Bearer /, ''));
    const m2 = url.pathname.match(/^\/storage\/v1\/object\/(sign\/)?([a-z]+)\/(.+)$/);
    if (!uid || !m2) return send(res, 401, { message: 'unauthorized' });
    const path = decodeURIComponent(m2[3]);
    if (path.split('/')[0] !== uid) return send(res, 403, { message: 'new row violates row-level security policy' });
    if (m2[1]) return send(res, 200, { signedURL: `/object/sign/${m2[2]}/${m2[3]}?token=t` });
    if (req.method === 'POST') { (tables.__storage ||= []).push({ path, bytes: raw.length }); return send(res, 200, { Key: `${m2[2]}/${path}` }); }
    return send(res, 200, {});
  }
  // ---- the header rule that caused the old 405 problem ----
  if (!apikey) return send(res, 401, { message: 'No API key' });
  if (apikey.startsWith('sb_secret_') && auth) return send(res, 400, { message: 'Secret keys must not be sent in Authorization' });
  if (apikey.startsWith('eyJ') && !auth) return send(res, 401, { message: 'JWT key needs Authorization' });

  if (url.pathname === '/__tables') return send(res, 200, tables);
  if (url.pathname === '/__reset') { for (const k of Object.keys(tables)) delete tables[k]; return send(res, 200, { ok: true }); }
  if (url.pathname.startsWith('/rest/v1/rpc/rl_hit')) {
    const k = `${body.p_key}|${body.p_bucket}`; counters.set(k, (counters.get(k) || 0) + 1); return send(res, 200, counters.get(k));
  }
  const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
  if (!m) return send(res, 404, { message: 'not found' });
  const name = m[1]; const rows = T(name); const params = [...url.searchParams.entries()];
  const prefer = String(req.headers.prefer || '');

  if (req.method === 'GET') {
    let out = rows.filter((r) => match(r, params));
    const order = url.searchParams.get('order');
    if (order) { const [col, dir] = order.split('.'); out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
    const lim = Number(url.searchParams.get('limit') || 0); if (lim) out = out.slice(0, lim);
    return send(res, 200, out);
  }
  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body]; const out = [];
    const onConflict = url.searchParams.get('on_conflict'); const ignore = prefer.includes('ignore-duplicates'); const merge = prefer.includes('merge-duplicates');
    for (const item of list) {
      const row = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(DEFAULTS[name]?.() || {}), ...item };
      if (name === 'points_ledger') row.id = ledgerSeq++;
      const keys = onConflict ? [onConflict.split(',')] : (UNIQUE[name] || []);
      const dup = rows.find((r) => keys.some((cols) => sameKey(r, row, cols)));
      if (dup) {
        if (onConflict && ignore) continue;
        if (onConflict && merge) { Object.assign(dup, item); out.push(dup); continue; }
        return send(res, 409, { code: '23505', message: `duplicate key value violates unique constraint on ${name}` });
      }
      rows.push(row); out.push(row);
    }
    return send(res, 201, out);
  }
  if (req.method === 'PATCH') {
    if (name === 'points_ledger') return send(res, 400, { message: 'points_ledger is append-only.' });
    const hit = rows.filter((r) => match(r, params)); hit.forEach((r) => Object.assign(r, body)); return send(res, 200, hit);
  }
  if (req.method === 'DELETE') return send(res, 400, { message: `Deleting from ${name} is not allowed in LabOps (history is kept).` });
  return send(res, 405, { message: 'method not allowed' });
});
server.listen(PORT, () => console.log(`mock supabase on ${PORT}`));
