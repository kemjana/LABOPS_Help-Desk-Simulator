import { route, json } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { limitGemini } from '@/lib/limits';
import { insert, rpc, select } from '@/lib/db';
import { hasGeminiKey, listUsableModels, models, pingModel } from '@/lib/gemini';
import { BLUEPRINTS, BLUEPRINT_VERSION } from '@/lib/blueprints';

const TABLES = ['profiles', 'lab_environments', 'lab_directory_users', 'tickets', 'ticket_secrets', 'ticket_attempts', 'attempt_criteria',
  'points_ledger', 'ticket_messages', 'ticket_reports', 'seasons', 'daily_debriefs', 'ticket_blueprints', 'rate_limit_hits', 'console_sessions', 'practice_queue', 'user_badges', 'ticket_replies'];
const errText = (e: unknown) => (e instanceof Error ? ((e as { detail?: string }).detail || e.message) : String(e)).slice(0, 300);

export const maxDuration = 45;
export const GET = route(async (req) => {
  const user = await requireUser(req);
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: !!process.env.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: !!process.env.SUPABASE_SECRET_KEY, GEMINI_API_KEY: hasGeminiKey(),
    GEMINI_MODEL: process.env.GEMINI_MODEL || '(not set, default used)', GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL || '(not set)',
  };
  const tables: Record<string, string> = {};
  for (const t of TABLES) { try { await select(t, {}, { limit: 1, columns: t === 'rate_limit_hits' ? 'key' : '*' }); tables[t] = 'ok'; } catch (e) { tables[t] = errText(e); } }
  // migration 002 adds these columns; a clear message beats a confusing error later
  try { await select('tickets', {}, { columns: 'play_mode,solved_mode', limit: 1 }); await select('ticket_attempts', {}, { columns: 'mode', limit: 1 }); tables['migration_002 (modes + console)'] = 'ok'; }
  catch (e) { tables['migration_002 (modes + console)'] = `not applied yet: run supabase/migrations/002_modes_console.sql. ${errText(e)}`; }
  let rate = 'ok';
  try { await rpc('rl_hit', { p_key: `check:${user.id}`, p_bucket: 'setup' }); } catch (e) { rate = errText(e); }
  let synced = 'ok';
  try {
    await insert('ticket_blueprints', BLUEPRINTS.map((b) => ({ id: b.id, category: b.cat, difficulty: b.diff, lab_mode: b.mode, title: b.title, concepts: b.criteria.map((c) => c.concept), version: BLUEPRINT_VERSION })), { onConflict: 'id' });
  } catch (e) { synced = errText(e); }
  const gemini: { configured: string[]; pings: Record<string, { ok: boolean; message: string }>; usable: string[]; listError?: string } = { configured: models(), pings: {}, usable: [] };
  if (hasGeminiKey()) {
    await limitGemini(req, user.id, 3);
    for (const m of gemini.configured) gemini.pings[m] = await pingModel(m);
    try { gemini.usable = await listUsableModels(); } catch (e) { gemini.listError = errText(e); }
  }
  return json({ env, tables, rate_limit: rate, blueprints: { count: BLUEPRINTS.length, synced }, gemini });
});
