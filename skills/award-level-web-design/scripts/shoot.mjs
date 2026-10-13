#!/usr/bin/env node
/*
 * shoot.mjs — capture a page at several widths (and optionally audit it) in one go.
 *
 * Usage:
 *   node shoot.mjs <url-or-html-file> [options]
 *
 * Options:
 *   --out <dir>            output folder (default: ./shots)
 *   --widths 375,768,1440,1920
 *   --sections "#work,.pricing"   extra screenshots scrolled to these selectors
 *   --full                 also save a full-page screenshot per width
 *   --audit                run audit.js at every width, print a summary, save audit.json
 *   --perf                 collect LCP, CLS, resource bytes and font bytes at every width
 *   --axe                  run axe-core (npm install axe-core, or --axe-source <file>)
 *   --axe-source <file>    local axe.min.js; never fetched by the page
 *   --max-lcp <ms>         performance warning threshold (default 2500)
 *   --max-cls <number>     performance warning threshold (default 0.1)
 *   --max-bytes <bytes>    page body bytes threshold (default 1500000)
 *   --max-font-bytes <n>   font body bytes threshold (default 300000)
 *   --settle <ms>          wait after load for entrance animations (default 2500)
 *   --chrome <path>        Chrome/Chromium/Edge binary (or set CHROME env var)
 *
 * Needs Node 22+ (built-in WebSocket) and a local Chrome, Edge or Chromium.
 * It waits for load + document.fonts.ready, then lets reveal animations finish,
 * which avoids the classic "blank page / half-faded content" screenshot artifacts.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (!args[0] || args[0] === '-h' || args[0] === '--help') {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(args[0] ? 0 : 1);
}
if (typeof WebSocket === 'undefined') { console.error('Node 22+ is required (global WebSocket).'); process.exit(1); }
const opt = (name, def) => { const i = args.indexOf('--' + name); return i > -1 ? args[i + 1] : def; };
const flag = name => args.includes('--' + name);

let target = args[0];
if (!/^https?:|^file:/.test(target)) {
  if (!existsSync(target)) { console.error('File not found: ' + target); process.exit(1); }
  target = pathToFileURL(realpathSync.native(resolve(target))).href; // realpath expands Windows 8.3 short names
}
const OUT = resolve(opt('out', 'shots'));
const WIDTHS = opt('widths', '375,768,1440,1920').split(',').map(Number);
const SECTIONS = (opt('sections', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const SETTLE = Number(opt('settle', 2500));
const AUDIT = flag('audit'), PERF = flag('perf'), AXE = flag('axe'), FULL = flag('full');
const AUDIT_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'audit.js'), 'utf8');
const PERF_SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'performance.js'), 'utf8');
let AXE_SRC;
if (AXE) {
  try { AXE_SRC = readFileSync(opt('axe-source', createRequire(import.meta.url).resolve('axe-core/axe.min.js')), 'utf8'); }
  catch { const given=opt('axe-source'); if(given) AXE_SRC=readFileSync(given,'utf8'); else throw new Error('--axe requires npm install axe-core, or --axe-source /path/to/axe.min.js'); }
}
const limits = { lcp:Number(opt('max-lcp',2500)), cls:Number(opt('max-cls',0.1)), totalBytes:Number(opt('max-bytes',1500000)), fontBytes:Number(opt('max-font-bytes',300000)) };
if (!WIDTHS.length || WIDTHS.some(w=>!Number.isInteger(w)||w<100||w>7680) || !Number.isFinite(SETTLE) || SETTLE<0 || Object.values(limits).some(n=>!Number.isFinite(n)||n<0)) throw new Error('Invalid viewport, settle time or performance threshold');

function findChrome() {
  const given = opt('chrome', process.env.CHROME);
  if (given) return given;
  const c = {
    win32: [`${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`, `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge'],
  }[platform()] || [];
  const hit = c.find(p => p && existsSync(p));
  if (!hit) { console.error('No Chrome/Edge/Chromium found. Pass --chrome <path> or set CHROME.'); process.exit(1); }
  return hit;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'shoot-'));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(findChrome(), ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
    if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(200);
}
if (!ws) { console.error('Could not connect to Chrome.'); chrome.kill(); process.exit(1); }
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const waiters = [];
let network = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.responseReceived') network.set(m.params.requestId,{type:m.params.type,url:m.params.response.url,bytes:0,transferBytes:0});
  if (m.method === 'Network.dataReceived' && network.has(m.params.requestId)) network.get(m.params.requestId).bytes += m.params.dataLength;
  if (m.method === 'Network.loadingFinished' && network.has(m.params.requestId)) network.get(m.params.requestId).transferBytes = m.params.encodedDataLength;
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method) for (const w of waiters.filter(w => w.method === m.method)) { w.fn(m); waiters.splice(waiters.indexOf(w), 1); }
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const once = method => new Promise(fn => waiters.push({ method, fn }));
const js = async expr => {
  const response=await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout:30000 });
  if(response.error || response.result?.exceptionDetails) throw new Error(JSON.stringify(response.error||response.result.exceptionDetails));
  return response.result?.result?.value;
};
const save = async (name, extra = {}) => {
  const r = await send('Page.captureScreenshot', { format: 'png', ...extra });
  const file = join(OUT, name + '.png');
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  return file;
};
const slug = s => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

await send('Page.enable');
if(PERF){
  await send('Network.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:PERF_SRC});
}
const report = {};
const files = [];
for (const w of WIDTHS) {
  const h = w < 768 ? 844 : w < 1200 ? 1024 : w >= 1900 ? 1080 : 900;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 768 ? 2 : 1, mobile: w < 768 });
  network = new Map();
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: target });
  await Promise.race([loaded, sleep(20000)]);
  const errPage = await js("location.href.startsWith('chrome-error://') || !!document.querySelector('#main-frame-error')");
  if (errPage) {
    console.error('Page failed to load: ' + target);
    if (target.startsWith('file:') && target.length > 250) console.error('Hint: very long local paths (Windows 260-char limit) fail in Chrome. Copy the file somewhere shorter or serve it over http.');
    ws.close(); chrome.kill(); process.exit(1);
  }
  await js('document.fonts.ready.then(()=>true)');
  await sleep(SETTLE);
  files.push(await save(`${w}-top`));

  for (const sel of SECTIONS) {
    const ok = await js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;
      const head=[...document.querySelectorAll('header,nav')].find(n=>['fixed','sticky'].includes(getComputedStyle(n).position));
      scrollTo(0,el.getBoundingClientRect().top+scrollY-(head?head.offsetHeight:0)-32);return true})()`);
    if (!ok) { console.warn(`  [${w}] selector not found: ${sel}`); continue; }
    await sleep(1800);
    await js('document.fonts.ready.then(()=>true)');
    files.push(await save(`${w}-${slug(sel)}`));
  }

  if (FULL) {
    // scroll through once so scroll-reveal content is visible, then capture beyond the viewport
    await js(`(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight*.8){scrollTo(0,y);await new Promise(r=>setTimeout(r,250))}scrollTo(0,0)})()`);
    await sleep(1200);
    const height = await js('document.documentElement.scrollHeight');
    files.push(await save(`${w}-full`, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.min(height, 16000), scale: 1 } }));
  }

  if (AUDIT || PERF || AXE) {
    await js('scrollTo(0,0)');
    const result = {};
    if (AUDIT) result.audit = await js(AUDIT_SRC);
    if (PERF) {
      const timing=await js('window.__shootPerformance');
      const resources=[...network.values()];
      result.perf={lcp:timing.lcp===null?null:Math.round(timing.lcp),cls:timing.supported.includes('layout-shift')?Number(timing.cls.toFixed(4)):null,totalBytes:resources.reduce((s,r)=>s+r.bytes,0),fontBytes:resources.filter(r=>r.type==='Font').reduce((s,r)=>s+r.bytes,0),transferBytes:resources.reduce((s,r)=>s+r.transferBytes,0),resources:resources.length,limits,warnings:[],scope:FULL?'Loaded resources after full-page scroll':'Loaded resources only; lazy resources below the viewport may be excluded',measurement:'Unthrottled lab sample; bytes are decoded response bodies measured with CDP, transferBytes includes protocol overhead'};
      for(const [key,limit] of Object.entries(limits)) if(result.perf[key]!==null&&result.perf[key]>limit) result.perf.warnings.push(`${key}: ${result.perf[key]} > ${limit}`);
      if(result.perf.lcp===null) result.perf.warnings.push('LCP unavailable; do not interpret as zero');
    }
    if (AXE) {
      await js(AXE_SRC);
      result.axe=await js(`axe.run(document,{resultTypes:['violations','incomplete'],runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}}).then(r=>({version:r.testEngine.version,violations:r.violations,incomplete:r.incomplete,note:'Automatic scan only. Pause behavior, keyboard interaction and screen-reader experience require manual verification.'}))`);
    }
    report[w] = result;
  }
}
ws.close(); chrome.kill();
await sleep(400);
try { rmSync(profile, { recursive: true, force: true }); } catch {}

console.log(`Saved ${files.length} screenshots to ${OUT}`);
if (AUDIT || PERF || AXE) {
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  if(AUDIT) writeFileSync(join(OUT,'audit.json'),JSON.stringify(Object.fromEntries(Object.entries(report).map(([w,r])=>[w,r.audit])),null,2));
  for (const [w, r] of Object.entries(report)) {
    console.log(`\n[${w}px]`);
    if (r.audit) { console.log(`  audit: ${r.audit.errors} errors, ${r.audit.warnings} warnings`); for (const i of r.audit.issues) console.log(`    ${i.severity === 'error' ? '✗' : '!'} ${i.check.padEnd(17)} ${i.target ?? ''}  ${i.detail}`); }
    if (r.perf) { console.log(`  perf: LCP ${r.perf.lcp===null?'unavailable':r.perf.lcp+'ms'} · CLS ${r.perf.cls ?? 'unavailable'} · ${(r.perf.totalBytes/1024).toFixed(1)}KB total · ${(r.perf.fontBytes/1024).toFixed(1)}KB fonts`); for(const warning of r.perf.warnings) console.warn('    ! '+warning); }
    if (r.axe) console.log(r.axe.error ? `  axe: unavailable (${r.axe.error})` : `  axe: ${r.axe.violations.length} violations, ${r.axe.incomplete.length} incomplete`);
  }
  console.log(`\nFull report: ${join(OUT, 'report.json')}`);
}
