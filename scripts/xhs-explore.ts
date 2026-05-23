/**
 * XHS Publish — Playwright automation
 * =====================================
 * Confirmed from DOM + screenshot:
 *
 *   STEP 1  large grey drop zone, red "上传图片" button
 *     → click "上传图片" → fileChooser intercept → setFiles(all listing images)
 *     → wait for blob: thumbnails
 *     → click 下一步
 *
 *   STEP 2  title + body editor
 *     → fill title
 *     → fill body
 *     → report confirmed selectors to paste into xhs.js SEL block
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/xhs-explore.ts
 *
 * Config:
 *   TEST_IMAGE_PATHS  — local images for Step 1 upload test
 *   TEST_IMAGE_URLS   — real CDN URLs (downloaded at runtime) — leave empty to skip
 */

import { chromium, Page, FileChooser, BrowserContext } from 'playwright';
import * as path  from 'path';
import * as fs    from 'fs';
import * as os    from 'os';
import * as https from 'https';
import * as http  from 'http';

// ── Config ────────────────────────────────────────────────────────────────────

// Local test images (used when TEST_IMAGE_URLS is empty)
const TEST_IMAGE_PATHS = [
  path.resolve(__dirname, '..', 'image.png'),
].filter(fs.existsSync);

// Real Tourit CDN URLs — paste some listing image URLs here for a full test
const TEST_IMAGE_URLS: string[] = [
  // 'https://project.supabase.co/storage/v1/object/public/images/photo1.jpg',
];

const XHS_URL    = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image';
const TEST_TITLE = '多伦多2床1卫$2500/月';   // ≤ 20 chars
const TEST_BODY  = '📍 测试地址, 多伦多\n💰 月租：$2500\n🛏 卧室：2 间\n#多伦多租房 #测试';
const MAX_PHOTOS = 18;

// ── Main ──────────────────────────────────────────────────────────────────────

const USER_DATA_DIR = path.resolve(__dirname, '..', '.xhs-session');

async function main() {
  // Persistent context saves cookies to disk — no re-login needed on next run
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    slowMo: 80,
    args: ['--start-maximized'],
    viewport: null,
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text()); });

  console.log('[1] Opening XHS publish page…');
  await page.goto(XHS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2000);

  // ── Login ─────────────────────────────────────────────────────────────────
  // Keep waiting as long as the URL is on the login page
  if (page.url().includes('/login')) {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  请扫描二维码登录 (scan QR to login)    ║');
    console.log('╚════════════════════════════════════════╝\n');
    await waitForLogin(page);
    console.log('[login] ✓\n');
  }

  // Ensure we land on the publish page after login
  if (!page.url().includes('/publish/publish')) {
    await page.goto(XHS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(2000);
  }

  // Wait for the publish page to fully render (button or upload area visible)
  console.log('[1] Waiting for publish page to render…');
  await page.waitForSelector('button:has-text("上传图片"), [class*="upload"]', { timeout: 30_000 });
  console.log('[1] Publish page ready.\n');

  // ── Step 1: explore ───────────────────────────────────────────────────────
  console.log('── STEP 1: explore upload zone ──────────────');
  try { await exploreStep1(page); } catch (e: any) { console.error('[explore error]', e?.message); }

  // ── Step 1: prepare images ────────────────────────────────────────────────
  const imagePaths = await prepareImages();
  if (imagePaths.length === 0) {
    console.log('\n[warn] No images to upload — skipping upload test.');
    console.log('       Set TEST_IMAGE_PATHS or TEST_IMAGE_URLS to test upload.\n');
  }

  // ── Step 1: upload via "上传图片" button ───────────────────────────────────
  if (imagePaths.length > 0) {
    console.log('\n── STEP 1: upload all images ─────────────────');
    try { await uploadStep1(page, imagePaths); } catch (e: any) { console.error('[upload error]', e?.message); }
  }

  // ── Step 1: click 下一步 ──────────────────────────────────────────────────
  console.log('\n── STEP 1: click 下一步 ──────────────────────');
  const advanced = await clickNext(page);
  if (!advanced) {
    console.log('[next] Please click 下一步 manually in the browser…');
    await waitForStep2DOM(page, 60_000);
  }

  // ── Step 2: explore + fill ────────────────────────────────────────────────
  await page.waitForTimeout(1500);
  console.log('\n── STEP 2: explore + fill ────────────────────');
  try {
    await exploreAndFillStep2(page);
  } catch (err: any) {
    console.error('[step2 error]', err?.message ?? err);
  }

  console.log('\n════════════════════════════════════════════');
  console.log(' Done. Browser open for inspection. Ctrl+C to quit.');
  console.log('════════════════════════════════════════════\n');
  await new Promise(() => {}); // keep browser alive — Ctrl+C to exit
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function waitForLogin(page: Page) {
  // Wait until the URL leaves the login page (up to 10 minutes)
  await page.waitForFunction(
    () => !window.location.href.includes('/login'),
    { timeout: 10 * 60_000, polling: 1000 }
  );
}

// ── Step 1: explore ───────────────────────────────────────────────────────────

async function exploreStep1(page: Page) {
  const report = await page.evaluate(() => {
    const vis = (el: Element) => {
      const s = getComputedStyle(el as HTMLElement), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0;
    };
    const cls = (e: Element) => (e.getAttribute('class') || '').slice(0, 80);
    return {
      fileInputs: [...document.querySelectorAll('input[type="file"]')].map(e => ({
        accept: (e as HTMLInputElement).accept, id: e.id,
        class: cls(e), display: getComputedStyle(e as HTMLElement).display,
      })),
      buttons: [...document.querySelectorAll('button')].filter(vis).map(e => ({
        text: (e as HTMLElement).innerText?.trim().slice(0, 40),
        class: cls(e), id: e.id,
      })),
      uploadAreas: [...document.querySelectorAll('[class*="upload"],[class*="drag"],[class*="drop"]')]
        .filter(vis).map(e => ({
          tag: e.tagName, class: cls(e),
          text: (e as HTMLElement).innerText?.trim().slice(0, 40),
        })),
    };
  });

  console.log('File inputs:', JSON.stringify(report.fileInputs, null, 2));
  console.log('Buttons:', JSON.stringify(report.buttons, null, 2));
  console.log('Upload areas:', JSON.stringify(report.uploadAreas.slice(0, 8), null, 2));
}

// ── Prepare images (download CDN URLs if provided, else use local) ────────────

async function prepareImages(): Promise<string[]> {
  if (TEST_IMAGE_URLS.length > 0) {
    console.log(`[images] Downloading ${Math.min(TEST_IMAGE_URLS.length, MAX_PHOTOS)} image(s) from CDN…`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-'));
    const paths: string[] = [];
    await Promise.all(
      TEST_IMAGE_URLS.slice(0, MAX_PHOTOS).map((url, i) =>
        downloadFile(url, path.join(tmpDir, `photo_${i + 1}${extFromUrl(url)}`))
          .then(p => { paths.push(p); console.log(`[images] ✓ ${i + 1} downloaded`); })
          .catch(err => console.log(`[images] ✗ ${url.slice(-40)}:`, err.message))
      )
    );
    return paths;
  }
  if (TEST_IMAGE_PATHS.length > 0) {
    console.log(`[images] Using ${TEST_IMAGE_PATHS.length} local test image(s)`);
    return TEST_IMAGE_PATHS.slice(0, MAX_PHOTOS);
  }
  return [];
}

// ── Step 1: upload via "上传图片" button (fileChooser intercept) ───────────────

async function uploadStep1(page: Page, imagePaths: string[]) {
  console.log(`[upload] Waiting for "上传图片" button…`);

  // Wait for the red upload button
  const uploadBtnSel = 'button:has-text("上传图片")';
  await page.waitForSelector(uploadBtnSel, { timeout: 30_000 });

  let chooser: FileChooser | null = null;
  try {
    [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15_000 }),
      page.locator(uploadBtnSel).first().click(),
    ]);
    console.log('[upload] ✓ fileChooser opened via "上传图片" button');
  } catch (e: any) {
    console.log('[upload] fileChooser via button failed:', e.message);
    // Fallback: drag-and-drop simulation
    console.log('[upload] Trying drag-and-drop fallback…');
    await simulateDrop(page, imagePaths);
    return;
  }

  await chooser.setFiles(imagePaths);
  console.log(`[upload] ✓ setFiles(${imagePaths.length} file(s))`);

  // Wait for thumbnails
  console.log('[upload] Waiting for blob: thumbnails…');
  try {
    await page.waitForSelector('img[src^="blob:"]', { timeout: 30_000 });
    const count = await page.locator('img[src^="blob:"]').count();
    console.log(`[upload] ✓ ${count} thumbnail(s) visible`);
  } catch {
    console.log('[upload] ⚠ No thumbnails detected — check browser visually');
  }

  // Also log the "上传图片" button selector for xhs.js
  const btnClass = await page.locator(uploadBtnSel).first().getAttribute('class') || '';
  const btnId    = await page.locator(uploadBtnSel).first().getAttribute('id')    || '';
  console.log(`\n[upload] *** SEL.uploadBtn = '${btnId ? '#'+btnId : 'button.' + btnClass.trim().split(/\s+/)[0]}' ***`);
}

async function simulateDrop(page: Page, imagePaths: string[]) {
  const filesData = imagePaths.map(p => ({
    base64: fs.readFileSync(p).toString('base64'),
    mime:   p.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
    name:   path.basename(p),
  }));

  await page.evaluate((files) => {
    const dt = new DataTransfer();
    for (const f of files) {
      const bytes = atob(f.base64);
      const arr   = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      dt.items.add(new File([arr], f.name, { type: f.mime }));
    }
    const zone =
      document.querySelector<HTMLElement>('[class*="drag"], [class*="upload-wrapper"], [class*="upload-area"]') ||
      [...document.querySelectorAll<HTMLElement>('div')]
        .find(el => (el.textContent || '').includes('上传图片，或写文字'));
    if (!zone) { console.error('[drop] zone not found'); return; }
    zone.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('dragover',  { bubbles: true, cancelable: true, dataTransfer: dt }));
    zone.dispatchEvent(new DragEvent('drop',      { bubbles: true, cancelable: true, dataTransfer: dt }));
    console.log('[drop] dispatched drop event with', dt.files.length, 'file(s)');
  }, filesData);

  await page.waitForTimeout(2000);
}

// ── Step 1: click 下一步 ──────────────────────────────────────────────────────

async function clickNext(page: Page): Promise<boolean> {
  for (const kw of ['下一步', 'Next']) {
    const btn = page.locator(`button:has-text("${kw}")`).first();
    if (await btn.count() > 0 && await btn.isVisible()) {
      await btn.click();
      console.log(`[next] ✓ Clicked "${kw}"`);
      return true;
    }
  }
  return false;
}

async function waitForStep2DOM(page: Page, ms: number) {
  await page.waitForFunction(
    () => !!document.querySelector('input[placeholder*="标题"], [contenteditable="true"]'),
    { timeout: ms }
  ).catch(() => {});
}

// ── Step 2: explore + fill ────────────────────────────────────────────────────

async function exploreAndFillStep2(page: Page) {
  const report = await page.evaluate(() => {
    const vis = (el: Element) => {
      const s = getComputedStyle(el as HTMLElement), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0;
    };
    const cls = (e: Element, n = 80) => (e.getAttribute('class') || '').slice(0, n);
    return {
      inputs: [...document.querySelectorAll('input[type="text"],input:not([type]),textarea')]
        .filter(vis).map(e => ({
          tag: e.tagName, placeholder: (e as HTMLInputElement).placeholder,
          maxlength: (e as HTMLInputElement).maxLength, id: e.id,
          class: cls(e),
        })),
      ces: [...document.querySelectorAll('[contenteditable="true"]')].filter(vis).map(e => {
        const r = e.getBoundingClientRect();
        return { id: e.id, class: cls(e), w: Math.round(r.width), h: Math.round(r.height) };
      }),
      buttons: [...document.querySelectorAll('button')].filter(vis)
        .map(e => ({ text: (e as HTMLElement).innerText?.trim().slice(0, 30), class: cls(e, 60), id: e.id })),
    };
  });

  console.log('\nInputs:', JSON.stringify(report.inputs, null, 2));
  console.log('\nContenteditable:', JSON.stringify(report.ces, null, 2));
  console.log('\nButtons:', JSON.stringify(report.buttons, null, 2));

  // Fill title
  console.log('\n[title] Filling…');
  for (const sel of ['input[placeholder*="标题"]', 'input[maxlength="20"]', 'input[class*="title"]']) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0 && await loc.isVisible()) {
      const ml = Number(await loc.getAttribute('maxlength') || 20);
      await loc.click({ clickCount: 3 });
      await loc.fill(TEST_TITLE.slice(0, ml));
      console.log(`[title] ✓  *** SEL.title = '${sel}' ***`);
      break;
    }
  }

  await page.waitForTimeout(400);

  // Fill body
  console.log('\n[body] Filling…');
  const bodyCandidates = [
    '.ql-editor',
    '[contenteditable="true"][class*="content"]',
    '[contenteditable="true"][class*="editor"]',
    '[contenteditable="true"][class*="note"]',
    'textarea[placeholder*="正文"]',
    'textarea[placeholder*="内容"]',
  ];
  let bodyFilled = false;
  for (const sel of bodyCandidates) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0 && await loc.isVisible()) {
      await loc.click();
      await loc.fill(TEST_BODY).catch(async () => {
        await loc.evaluate((el: HTMLElement, t) => {
          el.textContent = t;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
        }, TEST_BODY);
      });
      console.log(`[body]  ✓  *** SEL.body = '${sel}' ***`);
      bodyFilled = true; break;
    }
  }
  if (!bodyFilled) {
    let biggest: any = null, biggestArea = 0;
    for (const ce of await page.$$('[contenteditable="true"]')) {
      if (!await ce.isVisible()) continue;
      const box = await ce.boundingBox();
      if (box && box.width * box.height > biggestArea) { biggestArea = box.width * box.height; biggest = ce; }
    }
    if (biggest) {
      const cls = await biggest.getAttribute('class') || '';
      await biggest.click();
      await biggest.evaluate((el: HTMLElement, t: string) => {
        el.textContent = t;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }, TEST_BODY);
      console.log(`[body]  ✓ fallback  *** SEL.body = '[contenteditable="true"].${cls.trim().split(/\s+/)[0]}' ***`);
    } else { console.log('[body]  ✗ not found'); }
  }

  // Publish button
  console.log('\n[publish] Scanning…');
  for (const btn of await page.$$('button')) {
    const text = (await btn.textContent() || '').trim();
    if (['发布', '提交', '发表'].some(k => text.includes(k))) {
      const cls = await btn.getAttribute('class') || '';
      const bid = await btn.getAttribute('id')    || '';
      console.log(`[publish] ✓  text="${text}"  *** SEL.publishBtn = '${bid ? '#'+bid : 'button.'+cls.trim().split(/\s+/)[0]}' ***`);
    }
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function extFromUrl(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
  return ['jpg','jpeg','png','webp'].includes(ext) ? `.${ext}` : '.jpg';
}

function downloadFile(url: string, dest: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const file   = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

main().catch(err => { console.error('[fatal]', err); console.log('Browser left open — Ctrl+C to quit.'); });
