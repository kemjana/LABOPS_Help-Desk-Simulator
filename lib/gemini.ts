// Server-only Gemini wrapper. Model names come from env (they change often).
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { HttpError } from './http';

export class GeminiError extends HttpError {
  kind: 'no_key' | 'quota' | 'model' | 'invalid' | 'network';
  constructor(kind: GeminiError['kind'], message: string, detail?: string) {
    super(kind === 'quota' ? 429 : kind === 'no_key' ? 503 : 502, message, `gemini_${kind}`, detail);
    this.kind = kind;
  }
}

export function models(): string[] {
  const a = (process.env.GEMINI_MODEL || 'gemini-3.5-flash').trim();
  const b = (process.env.GEMINI_FALLBACK_MODEL || '').trim();
  return b && b !== a ? [a, b] : [a];
}
export function hasGeminiKey() { return !!(process.env.GEMINI_API_KEY || '').trim(); }

export function client(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new GeminiError('no_key', 'The AI key is not set up yet. Open /setup-check for help.');
  // GEMINI_BASE_URL exists ONLY so automated tests can point at a fake local server.
  const base = (process.env.GEMINI_BASE_URL || '').trim();
  return new GoogleGenAI({ apiKey, ...(base ? { httpOptions: { baseUrl: base } } : {}) });
}

/**
 * We want the model to think as little as possible (fast, cheap). Models differ in what they accept:
 * Gemini 3.x uses thinkingLevel (some accept MINIMAL, some only LOW), Gemini 2.5 Flash uses thinkingBudget.
 * So we try the options from most to least restrictive and REMEMBER which one worked for each model.
 */
type Thinking = { thinkingLevel: ThinkingLevel } | { thinkingBudget: number } | undefined;
function thinkingOptions(model: string): Thinking[] {
  if (/^gemini-3/.test(model)) return [{ thinkingLevel: ThinkingLevel.MINIMAL }, { thinkingLevel: ThinkingLevel.LOW }, undefined];
  if (/^gemini-2\.5-flash/.test(model)) return [{ thinkingBudget: 0 }, undefined];
  return [undefined];
}
const workingOption = new Map<string, number>();
const isThinkingSettingError = (msg: string) => /think/i.test(msg) && /(400|INVALID_ARGUMENT|not supported|unsupported|invalid)/i.test(msg);

interface GenArgs { model: string; contents: string; system?: string; maxTokens: number; temperature: number; json?: { schema: object }; timeoutMs?: number }
const DEFAULT_TIMEOUT_MS = 25000;
async function generate(ai: GoogleGenAI, a: GenArgs) {
  const opts = thinkingOptions(a.model);
  for (let i = workingOption.get(a.model) ?? 0; i < opts.length; i++) {
    const tc = opts[i];
    // if thinking cannot be limited, leave room in the output budget so the answer is not cut off
    const maxOutputTokens = tc || !/^gemini-(3|2\.5)/.test(a.model) ? a.maxTokens : a.maxTokens * 4;
    try {
      const r = await ai.models.generateContent({
        model: a.model, contents: a.contents,
        config: {
          // hard time limit and NO hidden retries (the SDK retries up to 5 times by default, which can exceed Vercel's time limit)
          httpOptions: { timeout: a.timeoutMs ?? DEFAULT_TIMEOUT_MS, retryOptions: { attempts: 1 } }, abortSignal: AbortSignal.timeout(a.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          ...(a.system ? { systemInstruction: a.system } : {}), maxOutputTokens, temperature: a.temperature,
          ...(a.json ? { responseMimeType: 'application/json', responseJsonSchema: a.json.schema } : {}),
          ...(tc ? { thinkingConfig: tc } : {}),
        },
      });
      workingOption.set(a.model, i);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isThinkingSettingError(msg) && i < opts.length - 1) continue; // this model does not accept that thinking setting: try the next one
      throw e;
    }
  }
  throw new Error('no usable thinking setting');
}

function classify(e: unknown): GeminiError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort|timeout|timed out|deadline|ETIMEDOUT|ECONNRESET/i.test(msg) && !/think/i.test(msg)) return new GeminiError('network', 'The AI took too long to answer. Please retry.', msg);
  if (isThinkingSettingError(msg)) return new GeminiError('model', 'This AI model rejected a setting. Try another GEMINI_MODEL (see /setup-check).', msg);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return new GeminiError('quota', 'The AI is busy or over its free limit. Wait a minute and retry.', msg);
  if (/404|NOT_FOUND|not found|not supported|deprecated|no longer/i.test(msg)) return new GeminiError('model', 'The AI model name is not available. Check GEMINI_MODEL on /setup-check.', msg);
  if (/API key|API_KEY|403|401|PERMISSION/i.test(msg)) return new GeminiError('no_key', 'The Gemini API key was rejected. Check GEMINI_API_KEY.', msg);
  return new GeminiError('network', 'The AI did not answer. Please retry.', msg);
}

interface JsonOpts<T> { system: string; prompt: string; schema: object; maxTokens: number; validate: (x: unknown) => T; timeoutMs?: number; tries?: number; useFallback?: boolean }

export async function geminiJson<T>(o: JsonOpts<T>): Promise<T> {
  const ai = client();
  let last: GeminiError | null = null;
  const list = o.useFallback === false ? models().slice(0, 1) : models();
  for (const model of list) {
    for (let attempt = 0; attempt < (o.tries ?? 2); attempt++) {
      try {
        const r = await generate(ai, { model, contents: o.prompt, system: o.system, maxTokens: o.maxTokens, temperature: 0.4, json: { schema: o.schema }, timeoutMs: o.timeoutMs });
        const text = (r.text || '').replace(/^```json\s*|```$/g, '').trim();
        return o.validate(JSON.parse(text));
      } catch (e) {
        if (e instanceof GeminiError) { last = e; continue; }
        if (e instanceof SyntaxError || (e instanceof Error && e.name === 'ValidationError')) {
          last = new GeminiError('invalid', 'The AI answer was not in the expected format. Please retry.', String(e)); continue;
        }
        last = classify(e);
        if (last.kind === 'quota' || last.kind === 'no_key') throw last;
        break; // model problem: try the fallback model
      }
    }
  }
  throw last ?? new GeminiError('network', 'The AI did not answer.');
}

export async function geminiText(o: { system: string; prompt: string; maxTokens: number; timeoutMs?: number }): Promise<string> {
  const ai = client();
  let last: GeminiError | null = null;
  for (const model of models()) {
    try {
      const r = await generate(ai, { model, contents: o.prompt, system: o.system, maxTokens: o.maxTokens, temperature: 0.5, timeoutMs: o.timeoutMs });
      const t = (r.text || '').trim();
      if (!t) throw new GeminiError('invalid', 'The AI returned an empty answer.');
      return t;
    } catch (e) {
      last = e instanceof GeminiError ? e : classify(e);
      if (last.kind === 'quota' || last.kind === 'no_key') throw last;
    }
  }
  throw last ?? new GeminiError('network', 'The AI did not answer.');
}

export class ValidationError extends Error { constructor(m: string) { super(m); this.name = 'ValidationError'; } }
export const bad = (m: string): never => { throw new ValidationError(m); };

/** For the Setup check page: one tiny request against one model. */
export async function pingModel(model: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ai = client();
    const r = await generate(ai, { model, contents: 'Reply with the single word OK.', maxTokens: 20, temperature: 0, timeoutMs: 12000 });
    return { ok: true, message: (r.text || '(empty answer)').trim().slice(0, 40) };
  } catch (e) {
    return { ok: false, message: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
export async function listUsableModels(): Promise<string[]> {
  const ai = client();
  const out: string[] = [];
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  for await (const m of pager) {
    const acts = (m as { supportedActions?: string[] }).supportedActions;
    const name = (m.name || '').replace(/^models\//, '');
    if (/^gemini/.test(name) && (!acts || acts.includes('generateContent'))) out.push(name);
    if (out.length >= 60) break;
  }
  return out.sort();
}
