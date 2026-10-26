#!/usr/bin/env node
// Renders index.html frame by frame in headless Chromium (the pre-installed Playwright build, SwiftShader WebGL).
//   node render.js --stills 2,7.5,20.5,34 --out stills       one PNG per time in seconds
//   node render.js --frames 0 299 --out frames                PNG frames frame_00000.png … at 30 fps
// The page is served from a throwaway local HTTP server so the local fonts load like they would on the web.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname, FPS = 30;
const argv = process.argv.slice(2);
const arg = (name, n = 1) => { const i = argv.indexOf(name); return i < 0 ? null : argv.slice(i + 1, i + 1 + n); };
const outDir = path.resolve(ROOT, (arg('--out') || ['frames'])[0]);
let jobs;
if (arg('--stills')) jobs = arg('--stills')[0].split(',').map(Number).map(t => ({ t, file: `still_${t.toFixed(2).padStart(5, '0')}s.png` }));
else if (arg('--frames', 2)) {
  const [a, b] = arg('--frames', 2).map(Number); jobs = [];
  for (let f = a; f <= b; f++) jobs.push({ t: f / FPS, file: `frame_${String(f).padStart(5, '0')}.png` });
} else if (arg('--list')) jobs = arg('--list')[0].split(',').map(Number).map(f => ({ t: f / FPS, file: `frame_${String(f).padStart(5, '0')}.png` }));
else { console.error('usage: node render.js (--stills t1,t2,… | --frames first last | --list f1,f2,…) [--out dir]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
  page.on('pageerror', e => console.log('page error:', e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?render`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  page.setDefaultTimeout(180000);
  // warm-up: compile every shader variant (rewind VHS, X-ray, plumes) before the first captured frame
  for (const t of [2.3, 16, 20.5]) await page.evaluate(tt => window.__render(tt), t);
  const t0 = Date.now();
  for (const [i, job] of jobs.entries()) {
    await page.evaluate(t => window.__render(t), job.t);
    // let the compositor present both the WebGL canvas and the updated HTML overlay before capturing
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.join(outDir, job.file), timeout: 180000 });
    if (i % 30 === 0 || i === jobs.length - 1) console.log(`${job.file}  t=${job.t.toFixed(2)}s  ${((Date.now() - t0) / (i + 1) / 1000).toFixed(2)} s/frame`);
  }
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
