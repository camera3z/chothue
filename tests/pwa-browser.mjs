import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const temporary = await mkdtemp(join(tmpdir(), 'rentbook-pwa-test-'));
const dist = join(temporary, 'dist');
let server, context, browser, revision = 1, installPrompts = 0;
const userId = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'owner@example.test', user_metadata: { shop_name: 'Shop thử PWA' } };
const token = 'e30.' + Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: 'authenticated' })).toString('base64url') + '.test';
const errors = [];
try {
  const build = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', dist, '--emptyOutDir'], {
    env: { ...process.env, VITE_SUPABASE_URL: 'https://lkwnbvervvgbbvfosohi.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-only-publishable-placeholder', VITE_FILEZUNO_SSO: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = ''; build.stdout.on('data', b => logs += b); build.stderr.on('data', b => logs += b);
  assert.equal(await new Promise(r => build.once('exit', r)), 0, logs);
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/private') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ private_record: 'test-only' })); return;
    }
    let path = resolve(dist, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(dist + '/') && path !== dist) { response.writeHead(403); response.end(); return; }
    try { if ((await stat(path)).isDirectory()) path = join(path, 'index.html'); }
    catch { path = join(dist, 'index.html'); }
    try {
      let body = await readFile(path);
      if (path.endsWith('/sw.js') && revision > 1) body = Buffer.concat([body, Buffer.from('\n// Fixture release ' + revision)]);
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/manifest+json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(path)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }); response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox'], viewport: { width: 1440, height: 1000 },
  });
  browser = context.browser();
  await context.addInitScript(({ token, user }) => {
    if (!localStorage.getItem('pwa-fixture-initialized')) {
      localStorage.setItem('pwa-fixture-initialized', '1');
      localStorage.setItem('sb-lkwnbvervvgbbvfosohi-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
    }
  }, { token, user });
  let authorize;
  const mock = async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/authorize')) {
      authorize = url; await route.fulfill({ contentType: 'text/html', body: '<h1>Mock Supabase authorize</h1>' }); return;
    }
    if (url.pathname.endsWith('/logout')) { await route.fulfill({ status: 204 }); return; }
    let data = [];
    if (url.pathname.endsWith('/user')) data = user;
    else if (url.pathname.endsWith('/members')) data = [{ organization_id: orgId }];
    else if (url.pathname.endsWith('/organizations')) data = { id: orgId, name: 'Shop thử PWA' };
    else if (url.pathname.endsWith('/records')) data = { organization_id: orgId, data: { assets: [], customers: [], contracts: [] }, version: 1 };
    else if (url.pathname.endsWith('/licenses')) data = { organization_id: orgId, expires_at: '2099-01-01T00:00:00Z' };
    else if (url.pathname.endsWith('/storefronts')) data = null;
    await route.fulfill({ contentType: 'application/json', headers: { 'Cache-Control': 'no-store', 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(data) });
  };
  await context.route('https://*.supabase.co/**', mock);
  const page = context.pages()[0]; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin); await page.getByRole('heading', { name: 'Hôm nay', exact: true }).waitFor();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const protocol = await context.newCDPSession(page);
  const appManifest = await protocol.send('Page.getAppManifest');
  assert.deepEqual(appManifest.errors, []);
  const manifest = JSON.parse(appManifest.data);
  assert.equal(manifest.name, 'Rentbook – Quản lý cho thuê'); assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  const installability = await protocol.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).updateViaCache), 'none');
  console.log('PASS PWA: production manifest, icons and service worker pass Chromium installability checks');

  // Test the install-button interaction without installing into the host OS.
  await page.exposeFunction('fixtureInstallPrompt', () => installPrompts++);
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = async () => { await window.fixtureInstallPrompt(); };
    event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.dispatchEvent(event);
  });
  await page.locator('[data-pwa-install]').click(); assert.equal(installPrompts, 1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  assert.equal(await page.locator('[data-pwa-install]').isHidden(), true);
  await page.getByText('Đã cài Rentbook. Bạn có thể mở ứng dụng từ menu Start.').waitFor();
  assert.equal(await page.evaluate(async () => (await caches.keys()).length), 0);
  console.log('PASS install controls: offered prompt is used once; installed state hides button; no app data cache');

  await page.locator('.snav [data-view=assets]').click(); await page.locator('[data-add=asset]').click();
  await page.locator('#modal [name=name]').fill('Bản nháp cần giữ');
  revision = 2;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.locator('[data-pwa-update]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#modal [name=name]').inputValue(), 'Bản nháp cần giữ');
  await page.locator('#cancel').click();
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('[data-pwa-update]').click();
  assert.equal(await page.locator('.page-title h1').textContent(), 'Tài sản');
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-pwa-update]').click();
  await page.getByRole('heading', { name: 'Hôm nay', exact: true }).waitFor();
  assert.equal(await page.locator('.shop-label').textContent(), 'Shop thử PWA');
  console.log('PASS update: new worker waits; unsaved form survives until explicit reload; same account returns');

  assert.equal(await page.evaluate(async () => (await (await fetch('/api/private')).json()).private_record), 'test-only');
  assert.equal(await page.evaluate(async () => (await caches.keys()).length), 0);
  const authBefore = await page.evaluate(() => localStorage.getItem('sb-lkwnbvervvgbbvfosohi-auth-token'));
  await context.setOffline(true); await page.getByText(/Mất kết nối mạng/).waitFor();
  await page.reload(); await page.getByRole('heading', { name: 'Rentbook cần kết nối mạng.' }).waitFor();
  assert.equal(await page.locator('.shell,.auth,.demo-banner').count(), 0);
  assert.equal(await page.evaluate(() => fetch('/api/private').then(() => false, () => true)), true);
  assert.equal(await page.evaluate(async () => (await caches.keys()).length), 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-lkwnbvervvgbbvfosohi-auth-token')), authBefore);
  const callback = origin + '/?code=pending-test-code&state=pending-state';
  await page.goto(callback); await page.getByRole('heading', { name: 'Rentbook cần kết nối mạng.' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Thử kết nối lại' }).getAttribute('href'), '');
  assert.equal(await page.getByRole('link', { name: 'Thử kết nối lại' }).evaluate(el => el.href), callback);
  await context.setOffline(false); await page.goto(origin);
  await page.getByRole('heading', { name: 'Hôm nay', exact: true }).waitFor();
  console.log('PASS offline: static network notice, no demo/private records, API bypass, session and callback preserved');

  const customer = await browser.newContext(); await customer.route('https://*.supabase.co/**', mock);
  const storefront = await customer.newPage(); await storefront.goto(origin + '/?shop=sample');
  await storefront.waitForFunction(() => !document.querySelector('link[rel="manifest"]'));
  assert.equal(await storefront.locator('[data-pwa-install]').count(), 0);
  assert.equal(await storefront.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  await customer.close();
  console.log('PASS public storefront: no admin install prompt or new worker registration');

  await page.locator('[data-signout]:visible').first().click(); await page.locator('#filezunoSignIn').waitFor();
  assert.equal(await page.evaluate(async () => (await caches.keys()).length), 0);
  await page.locator('#filezunoSignIn').click(); await page.waitForURL('https://*.supabase.co/**');
  assert.equal(authorize.searchParams.get('provider'), 'custom:filezuno');
  assert.equal(authorize.searchParams.get('redirect_to'), origin + '/');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 's256');
  assert.deepEqual(errors, []);
  console.log('PASS production SSO: old sign-in, exact callback and PKCE preserved with PWA enabled');
} finally {
  await context?.close();
  if (server) await new Promise(r => server.close(r));
  await rm(temporary, { recursive: true, force: true });
}
