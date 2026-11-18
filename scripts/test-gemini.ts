// Tests the thinking-setting fallback against the fake Gemini server. Run (fake server must be running): npx tsx scripts/test-gemini.ts
process.env.GEMINI_API_KEY = 'fake'; process.env.GEMINI_BASE_URL = 'http://localhost:54322';
import { geminiJson, geminiText, pingModel } from '../lib/gemini';
let pass = 0, fail = 0; const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const log = async () => (await fetch('http://localhost:54322/__log')).json() as Promise<{ model: string; config: { thinking?: { thinkingLevel?: string; thinkingBudget?: number } } }[]>;
(async () => {
  await fetch('http://localhost:54322/__clear');
  const a = await pingModel('gemini-3-nominimal-flash'); ok(a.ok, 'model that rejects MINIMAL works after falling back to LOW');
  let l = (await log()).filter((x) => x.model === 'gemini-3-nominimal-flash'); ok(l.length === 2 && l[0].config.thinking?.thinkingLevel === 'MINIMAL' && l[1].config.thinking?.thinkingLevel === 'LOW', 'tried MINIMAL first, then LOW');
  await fetch('http://localhost:54322/__clear'); await pingModel('gemini-3-nominimal-flash'); l = (await log()).filter((x) => x.model === 'gemini-3-nominimal-flash');
  ok(l.length === 1 && l[0].config.thinking?.thinkingLevel === 'LOW', 'remembers the working setting (one request next time)');
  await fetch('http://localhost:54322/__clear');
  const b = await pingModel('gemini-3-nothinking-flash'); ok(b.ok, 'model that rejects every thinking setting still works');
  l = (await log()).filter((x) => x.model === 'gemini-3-nothinking-flash'); ok(l.length === 3 && l[2].config.thinking === undefined, 'last attempt sent no thinking config');
  const c = await pingModel('gemini-2.5-flash-x'); ok(c.ok, '2.5-flash style model works with thinkingBudget 0');
  const t = await geminiText({ system: 's', prompt: 'hi', maxTokens: 50 }); ok(t.length > 0, 'geminiText works');
  const j = await geminiJson<{ subject: string; description: string }>({ system: 'training simulator', prompt: 'Scenario (data):\n"""A user cannot sign in on WS01 at 10.0.10.10"""', schema: { type: 'object', properties: { subject: { type: 'string' }, description: { type: 'string' } } }, maxTokens: 200, validate: (x) => x as never }); ok(!!j.subject, 'geminiJson works');
  const d = await pingModel('gemini-missing-x'); ok(!d.ok && /not found/i.test(d.message), 'a missing model still reports a clear error');
  console.log(`gemini thinking tests: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
