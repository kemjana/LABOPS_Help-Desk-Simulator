// TEST-ONLY fake Gemini server. Lets us test the REAL @google/genai SDK without a real key.
import http from 'node:http';
const PORT = Number(process.env.FAKE_GEMINI_PORT || 54322);
const log = [];
const send = (res, s, b) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = ''; for await (const c of req) raw += c;
  if (url.pathname === '/__log') return send(res, 200, log);
  if (url.pathname === '/__clear') { log.length = 0; return send(res, 200, {}); }
  if (req.method === 'GET' && /\/models$/.test(url.pathname)) return send(res, 200, { models: [
    { name: 'models/gemini-fake-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-fake-embed', supportedGenerationMethods: ['embedContent'] }] });
  const m = url.pathname.match(/models\/([^:]+):generateContent$/);
  if (!m) return send(res, 404, { error: { code: 404, message: 'not found', status: 'NOT_FOUND' } });
  const model = m[1]; const body = JSON.parse(raw);
  const prompt = (body.contents?.[0]?.parts?.[0]?.text) ?? (typeof body.contents === 'string' ? body.contents : JSON.stringify(body.contents));
  const system = body.systemInstruction?.parts?.[0]?.text || '';
  log.push({ model, system, prompt, config: { thinking: body.generationConfig?.thinkingConfig, schema: !!body.generationConfig?.responseJsonSchema } });
  // behave like real models that reject some thinking settings
  const tl = body.generationConfig?.thinkingConfig?.thinkingLevel; const hasTc = !!body.generationConfig?.thinkingConfig;
  if (model.includes('nominimal') && tl === 'MINIMAL') return send(res, 400, { error: { code: 400, message: 'Thinking level MINIMAL is not supported for this model. Please retry with other thinking level.', status: 'INVALID_ARGUMENT' } });
  if (model.includes('nothinking') && hasTc) return send(res, 400, { error: { code: 400, message: 'Thinking config is not supported for this model.', status: 'INVALID_ARGUMENT' } });
  if (model.includes('missing')) return send(res, 404, { error: { code: 404, message: `models/${model} is not found for API version v1beta`, status: 'NOT_FOUND' } });
  if (model.includes('quota')) return send(res, 429, { error: { code: 429, message: 'RESOURCE_EXHAUSTED quota', status: 'RESOURCE_EXHAUSTED' } });
  const schema = body.generationConfig?.responseJsonSchema; const props = schema?.properties || {};
  let text;
  if (props.headline) {
    text = JSON.stringify(process.env.FAKE_BAD_NARRATIVE ? { headline: 'Great shift today', summary: 'You resolved 99999 tickets today and kept learning every single step along the way.', tip: 'Review your weakest topic first.' }
      : { headline: 'Solid shift, keep going', summary: 'You worked through your tickets and learned from each one. Your weakest topics are listed below, so start there next time.', tip: 'Redo one ticket from your weakest topic tomorrow.' });
  } else if (props.subject) {
    const sc = (prompt.match(/"""([\s\S]*?)"""/) || [, 'x'])[1];
    text = JSON.stringify(process.env.FAKE_BAD_VARIATION ? { subject: 'x', description: 'short' } : { subject: `Help please: ${sc.slice(0, 40).replace(/[\r\n]/g, ' ')}`, description: `${sc} Thanks, I need this fixed today.` });
  } else if (props.results) {
    const ids = [...prompt.matchAll(/^- ([\w-]+): /gm)].map((x) => x[1]);
    const sub = prompt.split('<<<SUBMISSION')[1] || '';
    const good = /GOODANSWER/.test(sub); const partial = /PARTIAL/.test(sub); const fake = /FAKEQUOTE/.test(sub);
    text = JSON.stringify({ results: ids.map((id, i) => ({ id, met: fake ? true : good || (partial && i === 0), quote: fake ? 'this sentence never appears anywhere' : (good || (partial && i === 0)) ? (/GOODANSWER/.test(sub) ? 'GOODANSWER' : 'PARTIAL') : '' })) });
  } else if (/Reply with the single word OK/.test(prompt)) text = 'OK';
  else text = 'Think about where Windows records this kind of event, and what each field tells you. What have you checked so far?';
  send(res, 200, { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } });
}).listen(PORT, () => console.log(`fake gemini on ${PORT}`));
