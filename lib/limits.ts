// Rate limits. Anonymous sign-ins are cheap, so we limit per USER, per IP, and globally per day.
import { rpc } from './db';
import { HttpError, clientIp } from './http';

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

async function hit(key: string, bucket: string): Promise<number> {
  const n = await rpc<number>('rl_hit', { p_key: key, p_bucket: bucket });
  return Number(n);
}
const hourBucket = () => new Date().toISOString().slice(0, 13);
const dayBucket = () => new Date().toISOString().slice(0, 10);

/** Call before anything that spends Gemini quota. */
export async function limitGemini(req: Request, userId: string, weight = 1) {
  const perUser = num(process.env.GEMINI_USER_HOURLY, 30);
  const perIp = num(process.env.GEMINI_IP_HOURLY, 80);
  const perDay = num(process.env.GEMINI_DAILY_CAP, 800);
  const ip = clientIp(req);
  const u = await hit(`gu:${userId}`, hourBucket());
  if (u > perUser) throw new HttpError(429, 'You are going fast! Please wait a few minutes and try again.', 'rate_user');
  const i = await hit(`gi:${ip}`, hourBucket());
  if (i > perIp) throw new HttpError(429, 'Too many requests from your network. Please wait a bit.', 'rate_ip');
  const g = await hit('gglobal', dayBucket());
  if (g > perDay) throw new HttpError(429, 'LabOps reached its daily AI limit (it protects a free tier). Try again tomorrow.', 'rate_global');
  void weight;
}
/** Light limit for write routes that do not call Gemini. */
export async function limitWrites(req: Request, userId: string) {
  const w = await hit(`wu:${userId}`, hourBucket());
  if (w > num(process.env.WRITE_USER_HOURLY, 400)) throw new HttpError(429, 'Too many actions. Please slow down for a bit.', 'rate_write');
  const i = await hit(`wi:${clientIp(req)}`, hourBucket());
  if (i > num(process.env.WRITE_IP_HOURLY, 1500)) throw new HttpError(429, 'Too many requests from your network.', 'rate_ip');
}

/** Console commands are cheap (no Gemini) but still limited so one guest cannot flood the database. */
export async function limitConsole(req: Request, userId: string) {
  const u = await hit(`cu:${userId}`, hourBucket());
  if (u > num(process.env.CONSOLE_USER_HOURLY, 1200)) throw new HttpError(429, 'That is a lot of commands! Take a short break and try again.', 'rate_console');
  const i = await hit(`ci:${clientIp(req)}`, hourBucket());
  if (i > num(process.env.CONSOLE_IP_HOURLY, 4000)) throw new HttpError(429, 'Too many requests from your network.', 'rate_ip');
}
