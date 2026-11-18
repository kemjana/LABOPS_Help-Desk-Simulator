'use client';
// Browser-side Supabase: ONLY the URL and the PUBLISHABLE key. Used just for guest sign-in and the session token.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to .env.local and restart npm run dev (on Vercel: add them and Redeploy).');
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

export async function ensureSession(createIfMissing: boolean): Promise<string | null> {
  const { data } = await sb().auth.getSession();
  if (data.session) return data.session.access_token;
  if (!createIfMissing) return null;
  const { data: d2, error } = await sb().auth.signInAnonymously();
  if (error) throw new Error(`Guest sign-in failed: ${error.message}. In Supabase turn on Authentication > Sign In / Providers > Anonymous Sign-Ins.`);
  return d2.session?.access_token ?? null;
}
