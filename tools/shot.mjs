// usage: node tools/shot.mjs <baseUrl> <outDir> <route1,route2,...> [waitMs] [WxH] [jsToEvalBeforeEachShot]
// routes are hash routes, e.g. home,s1,s1/free,job/j2 . WxH e.g. 375x812 for a phone. Run ONE at a time.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const [base, out, list, waitMs = '3000', size = '1280x800', js = ''] = process.argv.slice(2);
const [W, H] = size.split('x').map(Number);
// Chrome picks its own debugging port; we read it from our own profile, so we can never attach to another Chrome
const prof = `${out}/chrome-prof-${process.pid}`;
mkdirSync(prof, { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--enable-gpu', '--use-angle=metal', '--hide-scrollbars', `--window-size=${W},${H}`, '--remote-debugging-port=0', '--no-first-run', '--disable-extensions', `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Never leave a headless Chrome behind: kill it on any exit path, and give up after a hard limit.
const bye = () => { try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', bye);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(1));
process.on('uncaughtException', (e) => { console.error('shot failed:', e.message); process.exit(1); });
process.on('unhandledRejection', (e) => { console.error('shot failed:', e?.message ?? e); process.exit(1); });
setTimeout(() => { console.error('shot timed out'); process.exit(1); }, 240000).unref();
let target;
for (let i = 0; i < 120 && !target; i++) { await sleep(250); try { const port = readFileSync(`${prof}/DevToolsActivePort`, 'utf8').split('\n')[0]; target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
if (!target) { console.error('shot failed: could not attach to the headless Chrome'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
const origin = new URL(base).origin + '/';
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === 'Fetch.requestPaused') { const ok = d.params.request.url.startsWith(origin); if (!ok) logs.push('refused a navigation to ' + d.params.request.url.slice(0, 60)); send(ok ? 'Fetch.continueRequest' : 'Fetch.failRequest', ok ? { requestId: d.params.requestId } : { requestId: d.params.requestId, errorReason: 'BlockedByClient' }); return; } if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '')); else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ' ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
// only the page under test may load as a document (something on this machine has been steering headless tabs elsewhere)
await send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document' }] });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
const ss = list.split(',');
await send('Page.navigate', { url: `${base}#${ss[0]}` });
await sleep(Number(waitMs) + 3000);
for (const s of ss) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify('#' + s)}` });
  await sleep(Number(waitMs));
  if (js) { const r = await send('Runtime.evaluate', { expression: js, awaitPromise: true }); if (r?.exceptionDetails) logs.push('EVAL ' + r.exceptionDetails.text); await sleep(Number(waitMs)); }
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
  writeFileSync(`${out}/${s.replace(/[^a-z0-9]+/gi, '_')}_${W}.jpg`, Buffer.from(r.data, 'base64'));
}
console.log(logs.length ? [...new Set(logs)].join('\n') : 'no console errors/warnings');
ws.close(); bye(); process.exit(0);
