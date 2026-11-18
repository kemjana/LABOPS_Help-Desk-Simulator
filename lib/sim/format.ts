import type { Obj } from './types';

const str = (v: unknown): string => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'True' : 'False') : Array.isArray(v) ? v.map(str).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
export const visibleKeys = (o: Obj) => Object.keys(o).filter((k) => !k.startsWith('__'));

export function formatTable(rows: Obj[], cols: string[]): string {
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => str(r[c]).split('\n')[0].length)));
  const line = (cells: string[]) => cells.map((x, i) => (i === cells.length - 1 ? x : x.padEnd(w[i] + 2))).join('').trimEnd();
  return ['', line(cols), line(cols.map((c) => '-'.repeat(c.length))), ...rows.map((r) => line(cols.map((c) => str(r[c]).split('\n')[0].slice(0, 70)))), ''].join('\n');
}
export function formatList(rows: Obj[], cols: string[]): string {
  const w = Math.max(...cols.map((c) => c.length));
  return rows.map((r) => cols.map((c) => `${c.padEnd(w)} : ${str(r[c]).replace(/\n/g, '\n' + ' '.repeat(w + 3))}`).join('\n')).join('\n\n') + '\n';
}
/** PowerShell rule of thumb: 4 or fewer properties => table, otherwise list (unless the type says otherwise). */
export function formatAuto(items: Obj[], forced?: 'table' | 'list', cols?: string[]): string {
  if (!items.length) return '';
  const first = items[0];
  const columns = cols ?? ((first.__default as string[] | undefined) ?? visibleKeys(first));
  const view = forced ?? ((first.__view as 'table' | 'list' | undefined) ?? (columns.length <= 4 ? 'table' : 'list'));
  return view === 'table' ? formatTable(items, columns) : formatList(items, columns);
}
export const asText = (v: unknown, none = ''): string => (v === null || v === undefined ? none : typeof v === 'string' ? v : formatAuto(Array.isArray(v) ? (v as Obj[]) : [v as Obj]));
