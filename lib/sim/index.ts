import { COMMANDS, type Bound, type Cmd } from './commands';
import { formatAuto } from './format';
import { evalTok, lev, splitPipes, tokenize, type Tok } from './parse';
import { SimError, type HistoryEntry, type Machine, type Obj, type SimState } from './types';

export interface RunResult { out: string; error: boolean; clear: boolean }
const COMMON = ['erroraction', 'verbose', 'confirm', 'whatif', 'warningaction'];

function allNames(m: Machine) { return COMMANDS.filter((c) => c.on === 'both' || c.on === m).flatMap((c) => [c.name, ...(c.alias ?? [])]); }
export function findCmd(name: string): Cmd | undefined { const n = name.toLowerCase(); return COMMANDS.find((c) => c.name.toLowerCase() === n || c.alias?.some((a) => a.toLowerCase() === n)); }
export function completionData(m: Machine) {
  return { commands: allNames(m).sort(), params: Object.fromEntries(COMMANDS.filter((c) => c.on === 'both' || c.on === m).map((c) => [c.name, c.params.map((p) => p.n)])) };
}
function notRecognized(name: string, m: Machine): SimError {
  const c = findCmd(name);
  let tip = '';
  if (c && c.on !== 'both' && c.on !== m) tip = `\n[LabOps tip] ${c.name} runs on ${c.on} in this lab (it needs Active Directory or DHCP tools). Switch to the ${c.on} tab above the console.`;
  else { const best = allNames(m).map((n) => [n, lev(name, n)] as const).sort((a, b) => a[1] - b[1])[0]; if (best && best[1] <= Math.max(2, Math.floor(name.length * 0.3))) tip = `\n[LabOps tip] Did you mean '${best[0]}'?`; else tip = "\n[LabOps tip] Type Get-Command to see the commands available here, or look at 'Commands for this ticket'."; }
  return new SimError(`${name} : The term '${name}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.${tip}`);
}
function tokText(t: Tok, c: { vars: Record<string, unknown>; sub: (l: string) => unknown }): string {
  if (t.t === 'param') return '-' + t.v; const v = evalTok(t, c); return Array.isArray(v) ? v.join(',') : String(v ?? '');
}
function bind(cmd: Cmd, toks: Tok[], c: { vars: Record<string, unknown>; sub: (l: string) => unknown }): Bound {
  const a: Bound = { _name: cmd.name };
  if (cmd.raw) { a._raw = toks.map((t) => tokText(t, c)); return a; }
  const pos: unknown[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'param') { pos.push(evalTok(t, c)); continue; }
    const n = t.v.toLowerCase();
    if (COMMON.some((x) => x.startsWith(n) && n.length >= 3)) { if (!t.value && toks[i + 1] && toks[i + 1].t !== 'param' && !/^(confirm|whatif|verbose)/.test(n)) i++; continue; }
    let p = cmd.params.find((x) => x.n.toLowerCase() === n || x.al?.some((y) => y.toLowerCase() === n));
    if (!p) { const cand = cmd.params.filter((x) => x.n.toLowerCase().startsWith(n)); if (cand.length > 1) throw new SimError(`${cmd.name} : Parameter cannot be processed because the parameter name '${t.v}' is ambiguous. Possible matches: ${cand.map((x) => '-' + x.n).join(', ')}.`); p = cand[0]; }
    if (!p) throw new SimError(`${cmd.name} : A parameter cannot be found that matches parameter name '${t.v}'. [LabOps tip] Type Get-Help ${cmd.name} to see the parameters.`);
    if (t.value) { a[p.n] = p.sw ? evalTok(t.value, c) !== false : evalTok(t.value, c); continue; }
    if (p.sw) { a[p.n] = true; continue; }
    const nxt = toks[i + 1];
    if (!nxt || nxt.t === 'param') throw new SimError(`${cmd.name} : Missing an argument for parameter '${p.n}'. Specify a parameter of type 'String' and try again.`);
    a[p.n] = evalTok(nxt, c); i++;
  }
  const free = cmd.params.filter((p) => p.pos !== undefined && a[p.n] === undefined).sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0));
  pos.forEach((v, i) => { const p = free[i]; if (!p) throw new SimError(`${cmd.name} : A positional parameter cannot be found that accepts argument '${String(v)}'. [LabOps tip] Type Get-Help ${cmd.name}`); a[p.n] = v; });
  return a;
}

function runPipeline(s: SimState, m: Machine, line: string): unknown {
  const vars = s.vars[m];
  const c = { vars, sub: (l: string) => runPipeline(s, m, l) };
  const segs = splitPipes(line);
  let data: unknown;
  segs.forEach((seg, i) => {
    const toks = tokenize(seg);
    if (!toks.length) return;
    const head = toks[0];
    if (i === 0 && head.t !== 'word') { data = toks.length === 1 ? evalTok(head, c) : undefined; if (data && typeof data === 'object' && !Array.isArray(data) && '__secure' in (data as Obj)) data = '(hidden secure string)'; return; }
    if (head.t !== 'word') throw new SimError('The syntax of this command is not understood.');
    const cmd = findCmd(head.v);
    if (!cmd || (cmd.on !== 'both' && cmd.on !== m)) throw notRecognized(head.v, m);
    const bound = bind(cmd, toks.slice(1), c);
    if (i > 0) {
      if (typeof data === 'string') throw new SimError(`${cmd.name} : The previous command printed plain text, not objects, so it cannot be piped. [LabOps tip] Put Format-Table / Format-List last.`);
      const items = Array.isArray(data) ? (data as Obj[]) : data ? [data as Obj] : [];
      if (cmd.pipeOnly) bound._pipe = items;
      else if (cmd.pipeId) { items.forEach((o) => cmd.run({ ...bound, Identity: bound.Identity ?? o }, { s, m })); data = undefined; return; }
      else throw new SimError(`${cmd.name} : This command does not accept pipeline input in this lab. [LabOps tip] Use its -Identity parameter instead.`);
    } else if (cmd.pipeOnly) { bound._pipe = []; }
    data = cmd.run(bound, { s, m });
  });
  return data;
}
function toText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length && typeof v[0] === 'object' ? formatAuto(v as Obj[]) : v.map(String).join('\n') + '\n';
  if (typeof v === 'object') return formatAuto([v as Obj]);
  return String(v) + '\n';
}

export function runLine(s: SimState, m: Machine, raw: string): RunResult {
  const line = raw.trim();
  if (!line) return { out: '', error: false, clear: false };
  try {
    const as = line.match(/^\$(\w+)\s*=\s*([\s\S]+)$/);
    if (as) { s.vars[m][as[1].toLowerCase()] = runPipeline(s, m, as[2]); return { out: '', error: false, clear: false }; }
    const v = runPipeline(s, m, line);
    if (v === '\u0000CLEAR') return { out: '', error: false, clear: true };
    return { out: toText(v), error: false, clear: false };
  } catch (e) {
    if (e instanceof SimError) return { out: e.message + '\n', error: true, clear: false };
    return { out: 'The console could not run that command. [LabOps tip] Check the syntax with Get-Help.\n', error: true, clear: false };
  }
}
export const prompt = (s: SimState, m: Machine) => (m === 'DC01' ? 'PS C:\\Users\\Administrator>' : `PS C:\\Users\\${s.sessionUser}>`);
export type { HistoryEntry };
