import { NextResponse } from 'next/server';

export class HttpError extends Error {
  status: number; code: string; detail?: string;
  constructor(status: number, message: string, code = 'error', detail?: string) {
    super(message); this.status = status; this.code = code; this.detail = detail;
  }
}
export const isDev = process.env.NODE_ENV !== 'production';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Wrap a route handler so every error becomes clean JSON. Real details only show in development. */
export function route(fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: e.message, code: e.code, ...(isDev && e.detail ? { detail: e.detail } : {}) }, e.status);
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[route error]', msg);
      return json({ error: isDev ? msg : 'Something went wrong on the server. Please try again.', code: 'server_error' }, 500);
    }
  };
}

export async function readJson(req: Request, maxBytes = 20000): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large.', 'too_large');
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return v as Record<string, unknown>;
  } catch { throw new HttpError(400, 'Invalid JSON body.', 'bad_json'); }
}

export function str(v: unknown, max: number, min = 0, name = 'field'): string {
  if (typeof v !== 'string') { if (min > 0) throw new HttpError(400, `${name} is required.`, 'validation'); return ''; }
  const s = v.replace(/\u0000/g, '').trim();
  if (s.length < min) throw new HttpError(400, `${name} must be at least ${min} characters.`, 'validation');
  if (s.length > max) throw new HttpError(400, `${name} must be at most ${max} characters.`, 'validation');
  return s;
}
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64);
  return (req.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}
export function localDay(req: Request, body?: Record<string, unknown>): string {
  const v = String(body?.day ?? req.headers.get('x-local-day') ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return new Date().toISOString().slice(0, 10);
}
