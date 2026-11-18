import { SimError, type Obj } from './types';

export type Tok =
  | { t: 'str'; v: string } | { t: 'word'; v: string } | { t: 'param'; v: string; value?: Tok } | { t: 'var'; v: string }
  | { t: 'sub'; v: string } | { t: 'block'; v: string } | { t: 'hash'; v: string } | { t: 'arr'; v: string } | { t: 'list'; v: Tok[] };

/** Split on | that is not inside quotes, (), {} */
export function splitPipes(line: string): string[] {
  const out: string[] = []; let cur = ''; let depth = 0; let q = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { cur += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '{') depth++;
    if (ch === ')' || ch === '}') depth--;
    if (ch === '|' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (q || depth !== 0) throw new SimError('The command is incomplete: check your quotes and brackets.');
  out.push(cur.trim());
  return out;
}
function balanced(s: string, i: number, open: string, close: string): [string, number] {
  let d = 0; let q = '';
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (q) { if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === open) d++;
    if (ch === close) { d--; if (d === 0) return [s.slice(i + 1, j), j + 1]; }
  }
  throw new SimError(`Missing closing '${close}'.`);
}
function readOne(s: string, i: number): [Tok, number] {
  const ch = s[i];
  if (ch === "'") { let j = i + 1; let v = ''; while (j < s.length) { if (s[j] === "'") { if (s[j + 1] === "'") { v += "'"; j += 2; continue; } break; } v += s[j++]; } if (j >= s.length) throw new SimError('The string is missing the terminator: \'.'); return [{ t: 'str', v }, j + 1]; }
  if (ch === '"') { let j = i + 1; let v = ''; while (j < s.length && s[j] !== '"') { if (s[j] === '`' && j + 1 < s.length) j++; v += s[j++]; } if (j >= s.length) throw new SimError('The string is missing the terminator: ".'); return [{ t: 'str', v: '\u0001' + v }, j + 1]; }
  if (ch === '(') { const [v, n] = balanced(s, i, '(', ')'); return [{ t: 'sub', v }, n]; }
  if (ch === '{') { const [v, n] = balanced(s, i, '{', '}'); return [{ t: 'block', v }, n]; }
  if (ch === '@' && s[i + 1] === '{') { const [v, n] = balanced(s, i + 1, '{', '}'); return [{ t: 'hash', v }, n]; }
  if (ch === '@' && s[i + 1] === '(') { const [v, n] = balanced(s, i + 1, '(', ')'); return [{ t: 'arr', v }, n]; }
  let j = i; while (j < s.length && !/[\s,;]/.test(s[j]) && s[j] !== '|') j++;
  const w = s.slice(i, j);
  if (w.startsWith('$')) return [{ t: 'var', v: w.slice(1) }, j];
  return [{ t: 'word', v: w }, j];
}
export function tokenize(seg: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < seg.length) {
    if (/\s/.test(seg[i])) { i++; continue; }
    if (seg[i] === '-' && /[A-Za-z]/.test(seg[i + 1] || '')) {
      let j = i + 1; while (j < seg.length && !/[\s:]/.test(seg[j])) j++;
      const name = seg.slice(i + 1, j);
      if (seg[j] === ':' ) { const [t, n] = readOne(seg, j + 1); out.push({ t: 'param', v: name, value: t }); i = n; continue; }
      out.push({ t: 'param', v: name }); i = j; continue;
    }
    let [tok, n] = readOne(seg, i);
    const items: Tok[] = [tok];
    while (seg[n] === ',' || (/\s/.test(seg[n] || 'x') && /^\s*,/.test(seg.slice(n)))) {
      n = seg.indexOf(',', n) + 1; while (/\s/.test(seg[n] || '')) n++;
      const [t2, n2] = readOne(seg, n); items.push(t2); n = n2;
    }
    out.push(items.length > 1 ? { t: 'list', v: items } : tok); i = n;
  }
  return out;
}
export interface EvalCtx { vars: Record<string, unknown>; sub: (line: string) => unknown }
export function evalTok(t: Tok, c: EvalCtx): unknown {
  switch (t.t) {
    case 'str': return t.v.startsWith('\u0001') ? t.v.slice(1).replace(/\$(\w+)/g, (_m, k: string) => { const l = k.toLowerCase(); return l === 'true' ? 'True' : l === 'false' ? 'False' : l === 'null' ? '' : String(c.vars[l] ?? ''); }) : t.v;
    case 'word': return t.v;
    case 'var': { const k = t.v.toLowerCase(); if (k === 'true') return true; if (k === 'false') return false; if (k === 'null') return null; return c.vars[k] ?? null; }
    case 'sub': return c.sub(t.v);
    case 'block': return { __block: t.v };
    case 'list': return t.v.map((x) => evalTok(x, c));
    case 'arr': return t.v.trim() ? tokenize(t.v).flatMap((x) => (x.t === 'list' ? x.v.map((y) => evalTok(y, c)) : [evalTok(x, c)])) : [];
    case 'hash': {
      const o: Obj = {};
      for (const pair of t.v.split(';')) { const k = pair.indexOf('='); if (k < 1) continue; const key = pair.slice(0, k).trim(); const [tok] = readOne(pair.trim().slice(pair.trim().indexOf('=') + 1).trim(), 0); o[key] = evalTok(tok, c); }
      return o;
    }
    default: return null;
  }
}
export const lev = (a: string, b: string) => {
  a = a.toLowerCase(); b = b.toLowerCase(); const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
