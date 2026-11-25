// End-to-end tests in a real Chromium against the production build.
// Usage: npm run build && npm run test:e2e
// Needs Playwright (npm i -D playwright && npx playwright install chromium) or a
// preinstalled copy on the machine.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = join(root, 'test-results');
mkdirSync(out, { recursive: true });
const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e?.message ?? e) });
    console.log(`  ✕ ${name}\n      ${String(e?.message ?? e).split('\n').slice(0, 6).join('\n      ')}`);
  }
}
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const server = spawn(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
server.stderr.on('data', (d) => process.stderr.write(d));
server.stdout.on('data', () => {});
{
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(BASE);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 20000) throw new Error('preview server did not start');
    await new Promise((r) => setTimeout(r, 200));
  }
}

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ['camera'] });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/favicon|WebGL|GPU stall|GL Driver/i.test(m.text()) && errors.push('console: ' + m.text()));
const shot = (n) => page.screenshot({ path: join(out, n + '.png') });

console.log('ESTATE AI e2e');

await test('dashboard loads without errors', async () => {
  await page.goto(BASE);
  await page.getByRole('heading', { name: 'Your properties' }).waitFor();
  await shot('01-dashboard-empty');
});

let propUrl = '';
await test('create a property', async () => {
  await page.getByTestId('new-property').click();
  await page.getByPlaceholder('e.g. Harbour View Apartment').fill('Test House');
  await page.getByPlaceholder('Street, suburb').fill('1 Test Lane');
  await page.getByTestId('create-property').click();
  await page.waitForURL(/#\/p\/.+\/scan/);
  propUrl = page.url().replace(/\/scan$/, '');
  await page.getByText('How scanning works here').waitFor();
});

await test('add a room and enter measured rectangle', async () => {
  await page.getByTestId('add-room').first().click();
  await page.getByRole('button', { name: 'Bedroom', exact: true }).click();
  await page.getByTestId('create-room').click();
  await page.getByLabel('Room length').fill('4.2');
  await page.getByLabel('Room width').fill('3.6');
  await page.getByLabel('Room width').press('Enter');
  await page.getByTestId('apply-rect').click();
  await page.getByText('15.12 m²').first().waitFor();
  const chip = await page.locator('.stat .chip').first().innerText();
  assert(/Measured/.test(chip), 'area should be measured, got ' + chip);
});

await test('ceiling height and a door', async () => {
  await page.getByLabel('Ceiling height').fill('2.55');
  await page.getByLabel('Ceiling height').press('Enter');
  await page.getByText('Net wall area').waitFor();
  await page.getByRole('button', { name: /Doors & windows/ }).click();
  await page.getByTestId('add-opening').click();
  await page.getByText('Door · wall 1').waitFor();
  await shot('02-room-openings');
});

await test('camera capture with a fake camera', async () => {
  await page.getByRole('button', { name: 'Photos & capture' }).click();
  await page.getByTestId('open-camera').click();
  await page.getByTestId('shutter').waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  await page.getByTestId('shutter').click();
  await page.getByText('1 taken').waitFor({ timeout: 8000 });
  await shot('03-camera');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.locator('.thumb').first().waitFor();
});

await test('plan editor: edit a dimension', async () => {
  await page.goto(propUrl + '/plan');
  await page.getByTestId('plan-svg').waitFor();
  await page.waitForTimeout(300);
  const dim = page.locator('[data-dim$=":0"]').first();
  await dim.click();
  const input = page.getByLabel('Measured length');
  await input.fill('4.5');
  await input.press('Enter');
  await page.getByTestId('apply-dim').click();
  await page.locator('text=16.2 m²').first().waitFor();
  await shot('04-plan-editor');
});

await test('plan editor: draw a room with the draw tool', async () => {
  await page.locator('[data-tool="room"]').click();
  const box = await page.getByTestId('plan-svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.45, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await page.getByText('Room 2').first().waitFor();
});

await test('3D model renders pixels', async () => {
  await page.goto(propUrl + '/3d');
  const canvas = page.locator('canvas').first();
  await canvas.waitFor();
  await page.waitForTimeout(1200);
  const stats = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const g = document.createElement('canvas');
    g.width = 64;
    g.height = 64;
    const x = g.getContext('2d');
    x.drawImage(c, 0, 0, 64, 64);
    const d = x.getImageData(0, 0, 64, 64).data;
    const set = new Set();
    for (let i = 0; i < d.length; i += 16) set.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return set.size;
  });
  assert(stats > 6, 'the 3D canvas looks empty (' + stats + ' colours)');
  await shot('05-3d');
});

await test('sample property: studio concept and furniture', async () => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.waitForURL(/#\/p\/.+/);
  const sampleUrl = page.url();
  await page.goto(sampleUrl + '/studio');
  await page.getByTestId('new-concept').click();
  await page.getByTestId('add-furniture').click();
  await page.getByRole('button', { name: 'Before / after' }).click();
  await page.getByRole('dialog', { name: 'Before / after' }).waitFor({ timeout: 10000 });
  await shot('06-studio-compare');
  await page.keyboard.press('Escape');
  globalThis.sampleUrl = sampleUrl;
});

await test('virtual staging: stage a room in 3D', async () => {
  await page.goto(globalThis.sampleUrl + '/staging');
  await page.getByTestId('stage-3d').click();
  await page.waitForURL(/studio/);
  await page.getByText(/staging/).first().waitFor();
});

await test('area calculator shows statuses', async () => {
  await page.goto(globalThis.sampleUrl + '/area');
  await page.getByText('Total interior area').waitFor();
  await page.getByText('The totals are not fully verified').waitFor();
  await shot('07-area');
});

await test('copilot answers from data', async () => {
  await page.goto(globalThis.sampleUrl + '/copilot');
  await page.getByTestId('copilot-input').fill('How large is the living room?');
  await page.getByTestId('copilot-input').press('Enter');
  await page.getByText(/Living is 21\.32 m²/).waitFor();
  await page.getByTestId('copilot-input').fill('Will a king-size bed fit in the main bedroom?');
  await page.getByTestId('copilot-input').press('Enter');
  await page.getByText(/Testing a King bed/).waitFor();
  await shot('08-copilot');
});

await test('inspection: observation kept separate', async () => {
  await page.goto(globalThis.sampleUrl + '/inspect');
  await page.getByTestId('add-inspection').click();
  await page.getByPlaceholder(/Water stain/).fill('Cracked tile near door');
  await page.getByTestId('save-inspection').click();
  await page.getByText('Cracked tile near door').waitFor();
  await page.getByRole('tab', { name: /Professional findings/ }).click();
  assert((await page.getByText('Cracked tile near door').count()) === 0, 'observation leaked into professional findings');
});

await test('elevation PNG export', async () => {
  await page.goto(globalThis.sampleUrl + '/elevations');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-elevation').click()]);
  const p = join(out, 'elevation.png');
  await dl.saveAs(p);
  const b = readFileSync(p);
  assert(b.length > 5000 && b[1] === 0x50, 'not a PNG');
});

await test('listing PDF and PNG export', async () => {
  await page.goto(globalThis.sampleUrl + '/listing');
  await page.getByRole('button', { name: /Write from data/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByTestId('export-pdf').click()]);
  const p = join(out, 'presentation.pdf');
  await dl.saveAs(p);
  const b = readFileSync(p);
  assert(b.subarray(0, 4).toString() === '%PDF' && b.length > 20000, 'PDF looks wrong, ' + b.length + ' bytes');
  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByTestId('export-png').click()]);
  await png.saveAs(join(out, 'plan.png'));
  await page.getByText('Exported documents (2)').waitFor({ timeout: 10000 });
  await shot('09-listing');
});

await test('backup and restore round trip', async () => {
  await page.goto(BASE + '#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').click()]);
  const p = join(out, 'backup.json');
  await dl.saveAs(p);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  assert(j.format === 'estate-ai-backup' && j.properties.length === 2, 'backup content wrong');
  assert(j.photos.length >= 1 && j.photos[0].data?.startsWith('data:image'), 'photo missing from backup');
  // restore into a fresh browser profile
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + '#/settings');
  const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: 'Restore from file' }).click()]);
  await chooser.setFiles(p);
  await p2.getByTestId('restore-merge').click();
  await p2.getByText(/Restored 2 propert/).waitFor();
  await p2.goto(BASE);
  await p2.getByText('Test House').waitFor();
  assert((await p2.getByTestId('property-card').count()) === 2, 'restored property count wrong');
  await ctx2.close();
});

await test('offline: app shell loads with no network', async () => {
  const ctx3 = await browser.newContext();
  const p3 = await ctx3.newPage();
  await p3.goto(BASE);
  await p3.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.ready.then(() => true), null, { timeout: 15000 });
  await p3.evaluate(() => navigator.serviceWorker.ready);
  await p3.reload();
  await p3.waitForTimeout(800);
  await ctx3.setOffline(true);
  await p3.reload();
  await p3.getByRole('heading', { name: 'Your properties' }).waitFor({ timeout: 8000 });
  await p3.getByRole('button', { name: 'Load sample' }).click();
  await p3.waitForURL(/#\/p\//);
  await p3.goto(p3.url() + '/plan');
  await p3.getByTestId('plan-svg').waitFor({ timeout: 8000 });
  await ctx3.close();
});

await test('iPhone layout: bottom navigation and plan', async () => {
  const ctx4 = await browser.newContext({ ...devices['iPhone 13'] });
  const p4 = await ctx4.newPage();
  p4.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  await p4.goto(BASE);
  await p4.getByRole('button', { name: 'Load sample' }).click();
  await p4.waitForURL(/#\/p\//);
  await p4.locator('.bottom-nav').waitFor();
  await p4.screenshot({ path: join(out, '10-iphone-overview.png') });
  await p4.locator('.bottom-nav button', { hasText: 'Plan' }).click();
  await p4.getByTestId('plan-svg').waitFor();
  await p4.waitForTimeout(300);
  await p4.screenshot({ path: join(out, '11-iphone-plan.png') });
  const overflow = await p4.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, 'horizontal overflow on phone');
  await p4.locator('.bottom-nav button', { hasText: 'More' }).click();
  await p4.getByRole('dialog', { name: 'More tools' }).waitFor();
  await ctx4.close();
});

await test('camera scan builds a room from aimed corners (phone)', async () => {
  const ctx5 = await browser.newContext({ ...devices['iPhone 13'], permissions: ['camera', 'accelerometer', 'gyroscope', 'magnetometer'] });
  const p5 = await ctx5.newPage();
  p5.setDefaultTimeout(15000);
  p5.on('pageerror', (e) => errors.push('scan pageerror: ' + e.message));
  await p5.goto(BASE);
  await p5.getByTestId('new-property').click();
  await p5.getByPlaceholder('e.g. Harbour View Apartment').fill('Scan Test');
  await p5.getByTestId('create-property').click();
  await p5.getByTestId('add-room').first().click();
  await p5.getByTestId('create-room').click();
  await p5.getByTestId('scan-room').click();
  await p5.getByLabel('Phone height').fill('1.3');
  await p5.getByLabel('Phone height').press('Enter');
  await p5.getByTestId('mode-tap').click();
  await p5.getByTestId('scan-start').click();
  await p5.getByTestId('scan-live').waitFor();
  // A 4.0 × 3.0 m room with the phone 1.3 m up, standing off-centre.
  const room = [{ x: -1500, y: -1200 }, { x: 2500, y: -1200 }, { x: 2500, y: 1800 }, { x: -1500, y: 1800 }];
  for (const c of room) {
    await p5.evaluate(({ c, h }) => {
      const nx = c.x, ny = -c.y;
      const theta = Math.atan2(h, Math.hypot(nx, ny));
      const o = { alpha: (Math.atan2(-nx, ny) * 180) / Math.PI, beta: 90 - (theta * 180) / Math.PI, gamma: 0 };
      for (let i = 0; i < 10; i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', o));
    }, { c, h: 1300 });
    await p5.getByTestId('scan-mark').click();
  }
  await p5.getByTestId('scan-done').click();
  await p5.getByRole('button', { name: 'Skip' }).click();
  await p5.getByText('12.0 m²').first().waitFor();
  await p5.screenshot({ path: join(out, '12-scan-review.png') });
  await p5.getByTestId('scan-create').click();
  await p5.getByText('12.00 m²').first().waitFor();
  const chip = await p5.locator('.stat .chip').first().innerText();
  assert(/Estimate/.test(chip), 'scanned area must be an estimate, got ' + chip);
  await ctx5.close();
});

await test('automatic scan from simulated camera frames, then Measure', async () => {
  const ctx6 = await browser.newContext({ ...devices['iPhone 13'], permissions: ['camera', 'accelerometer', 'gyroscope', 'magnetometer'] });
  const p6 = await ctx6.newPage();
  p6.setDefaultTimeout(20000);
  p6.on('pageerror', (e) => errors.push('auto pageerror: ' + e.message));
  await p6.goto(BASE);
  // Feed the scanner frames rendered from a virtual 4.5 × 3.5 m room, turning on the spot.
  await p6.evaluate(() => {
    const room = [{ x: -2100, y: -1600 }, { x: 2400, y: -1600 }, { x: 2400, y: 1900 }, { x: -2100, y: 1900 }];
    const H = 1350, W = 72, Hh = 96, fov = 66;
    const inside = (p) => { let c = false; for (let i = 0, j = room.length - 1; i < room.length; j = i++) { const a = room[i], b = room[j]; if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    let alpha = 0;
    window.__estateScanSource = () => {
      alpha = (alpha + 5) % 360;
      if (window.__scanTurns === undefined) window.__scanTurns = 0;
      window.__scanTurns += 5;
      const o = { alpha, beta: 62, gamma: 0 };
      const r = Math.PI / 180, sA = Math.sin(o.alpha * r), cA = Math.cos(o.alpha * r), sB = Math.sin(o.beta * r), cB = Math.cos(o.beta * r), sG = 0, cG = 1;
      const R = [cA * cG - sA * sB * sG, -cB * sA, cG * sA * sB + cA * sG, cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB, -cB * sG, sB, cB * cG];
      const f = Math.max(W, Hh) / 2 / Math.tan((fov * Math.PI) / 360);
      const data = new Uint8ClampedArray(W * Hh * 4);
      for (let v = 0; v < Hh; v++) for (let u = 0; u < W; u++) {
        const dx = (u + 0.5 - W / 2) / f, dy = -(v + 0.5 - Hh / 2) / f;
        const d = { x: R[0] * dx + R[1] * dy - R[2], y: R[3] * dx + R[4] * dy - R[5], z: R[6] * dx + R[7] * dy - R[8] };
        let c = [225, 222, 214];
        if (d.z < 0) { const t = H / -d.z; const p = { x: d.x * t, y: -d.y * t }; if (inside(p)) c = [150, 108, 70]; }
        const i = (v * W + u) * 4; const n = (Math.random() - 0.5) * 12;
        data[i] = c[0] + n; data[i + 1] = c[1] + n; data[i + 2] = c[2] + n; data[i + 3] = 255;
      }
      return { frame: { data, width: W, height: Hh }, orientation: o, screenAngle: 0 };
    };
  });
  await p6.getByTestId('new-property').click();
  await p6.getByTestId('create-property').click();
  await p6.getByTestId('add-room').first().click();
  await p6.getByTestId('create-room-scan').click();
  await p6.getByLabel('Phone height').fill('1.35');
  await p6.getByLabel('Phone height').press('Enter');
  await p6.getByTestId('mode-auto').click();
  await p6.getByTestId('scan-start').click();
  await p6.getByTestId('scan-auto').waitFor();
  await p6.waitForFunction(() => /9\d%|100%/.test(document.querySelector('[data-testid="scan-coverage"]')?.textContent ?? ''), null, { timeout: 30000 });
  await p6.screenshot({ path: join(out, '13-auto-scan.png') });
  await p6.getByTestId('scan-auto-finish').click();
  await p6.getByRole('button', { name: 'Skip' }).click();
  const areaText = await p6.locator('.scan-overlay').getByText(/Floor area/).first().innerText();
  const m2 = parseFloat(areaText.match(/([\d.]+) m²/)[1]);
  assert(Math.abs(m2 - 15.75) < 1.2, 'auto scan area should be about 15.75 m², got ' + m2);
  await p6.getByTestId('scan-create').click();
  // measure sheet opens straight after the scan
  const sheet = p6.getByRole('dialog', { name: /Measure:/ });
  await sheet.waitFor();
  await sheet.getByLabel('Ceiling height').fill('2.6');
  await sheet.getByLabel('Ceiling height').press('Enter');
  await p6.getByTestId('custom-measure-name').fill('Fridge gap');
  await p6.getByTestId('custom-measure-add').click();
  await sheet.getByText('1/5 measured').waitFor();
  await sheet.getByText('Ceiling height').first().waitFor();
  await p6.screenshot({ path: join(out, '14-measure-sheet.png') });
  const wide = await p6.evaluate(() => [...document.querySelectorAll('.modal *')].some((el) => el.getBoundingClientRect().right > window.innerWidth + 1));
  assert(!wide, 'measure sheet is wider than the phone screen');
  await p6.getByTestId('measure-done').click();
  await ctx6.close();
});

await test('plan tape tool records a measured line', async () => {
  await page.goto(globalThis.sampleUrl + '/plan');
  await page.getByTestId('plan-svg').waitFor();
  await page.locator('[data-tool="measure"]').click();
  const box = await page.getByTestId('plan-svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId('annotation-label').fill('Bench run');
  await page.getByLabel('Measured length').fill('2.4');
  await page.getByLabel('Measured length').press('Enter');
  await page.getByTestId('save-annotation').click();
  await page.getByText(/Bench run: 2\.40 m/).waitFor();
  await shot('15-plan-tape');
});

await test('no uncaught errors', async () => {
  assert(errors.length === 0, errors.slice(0, 8).join('\n'));
});

await browser.close();
server.kill();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, 'e2e-results.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
