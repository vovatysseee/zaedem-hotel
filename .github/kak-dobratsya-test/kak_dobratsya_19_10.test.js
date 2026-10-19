// 19.10: «Как добраться» в карточке объекта (hotels.directions, бэкенд zaedem-backend#22).
// Проверяем: поле есть в форме «Объект», заполняется из ответа сервера, уходит в PATCH /api/hotels/:id,
// пустое поле уходит пустой строкой (очистка), без ошибок в консоли и горизонтальной прокрутки.
// Запуск: node .github/kak-dobratsya-test/kak_dobratsya_19_10.test.js  (ZB_CHROME — путь к Chromium, если нужен)
const path = require('path');
const fs = require('fs');
const http = require('http');
const cp = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(cp.execSync('npm root -g').toString().trim() + '/playwright'); }

const ROOT = process.env.ZB_ROOT ? path.resolve(process.env.ZB_ROOT) : path.resolve(__dirname, '..', '..');
const DIR = 'Вход со двора, синяя калитка · От вокзала 10 минут';

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.writeHead(404); return resp.end('nf'); }
      const ct = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(f)] || 'application/octet-stream';
      resp.writeHead(200, { 'Content-Type': ct });
      fs.createReadStream(f).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const TOKEN = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ id: 7, role: 'hotelowner', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';
const USER = { id: 7, email: 'owner@test.by', name: 'Тестовый хозяин', role: 'hotelowner' };
const HID = '11111111-2222-3333-4444-555555555555';
const HOTEL = { id: HID, name_ru: 'Тестовая усадьба', address: 'д. Тестовая, 1', city_id: 1, phone: '+375291112233', email: 'h@test.by',
  object_type: 'guest', sync_mode: 'own', checkin_time: '14:00', checkout_time: '12:00', house_rules: '', cancel_rules: '', directions: DIR };

function makeApi(log) {
  return async route => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname, m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (o, status = 200) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
    if (p === '/api/users/login') return json({ success: true, token: TOKEN, user: USER });
    if (p === '/api/hotels/owner/my') return json([HOTEL]);
    if (p === '/api/cities') return json([{ id: 1, name_ru: 'Минск' }]);
    if (p === '/api/hotels/' + HID && m === 'PATCH') { log.push(JSON.parse(req.postData() || '{}')); return json({ ...HOTEL, directions_saved: true }); }
    if (p === '/api/hotels/' + HID) return json(HOTEL);
    return json({ success: true, hotel: null, hotels: [], bookings: [], requisites: null, data: [] });
  };
}

async function run(vp) {
  const isTouch = vp.w < 800;
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch({ executablePath: process.env.ZB_CHROME || undefined });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: isTouch, isMobile: isTouch });
  const patches = [], errors = [], results = [];
  await ctx.route('https://api.zaedem.by/**', makeApi(patches));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  // Известное (есть и на main): прескан Chrome запрашивает «${safeUrl(...)}» и т. п. из текста скрипта — 404 у локального сервера
  const KNOWN = /%7BsafeUrl\(|\$\{safeUrl\(|\/x$/;
  page.on('console', m => { if (m.type() === 'error' && !KNOWN.test(m.location().url || '') && !/404/.test(m.text())) errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  const ok = (name, cond, extra) => { results.push(!!cond); console.log((cond ? '  ✓ ' : '  ✗ ') + vp.w + ' ' + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };

  await page.goto(base + '/', { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.setItem('cab_pwa_dismissed', String(Date.now())); } catch (e) {} });
  await page.fill('#loginEmail', 'owner@test.by');
  await page.fill('#loginPass', 'pass12345');
  await page.click('.login-btn');
  await page.waitForFunction(() => document.getElementById('app') && document.getElementById('app').style.display === 'flex', null, { timeout: 8000 });
  await page.evaluate(() => showPage('hotel'));
  await page.waitForFunction(v => (document.getElementById('h-directions') || {}).value === v, DIR, { timeout: 8000 }).catch(() => {});

  const f = await page.evaluate(() => {
    const t = document.getElementById('h-directions'); if (!t) return null;
    const r = t.getBoundingClientRect(); const lab = document.querySelector('label[for="h-directions"]');
    const rules = document.getElementById('h-rules').getBoundingClientRect();
    return { val: t.value, max: t.maxLength, vis: r.width > 0 && r.height > 0, label: lab && lab.textContent.trim(), afterRules: r.top > rules.bottom };
  });
  ok('поле «Как добраться» есть и видно', f && f.vis, f);
  ok('подпись поля', f && /Как добраться/.test(f.label || ''), f);
  ok('стоит после «Правила дома»', f && f.afterRules, f);
  ok('ограничение 1000 знаков', f && f.max === 1000, f);
  ok('заполнено из ответа сервера', f && f.val === DIR, f);

  await page.fill('#h-directions', '  Парковка у дома  ');
  await page.click('#hotel-save-btn');
  await page.waitForTimeout(600);
  ok('PATCH: directions уходит без пробелов по краям', patches.length === 1 && patches[0].directions === 'Парковка у дома', patches);
  ok('PATCH: прочие поля карточки на месте', patches[0] && patches[0].name_ru === HOTEL.name_ru && patches[0].house_rules === '', patches[0]);

  await page.fill('#h-directions', '');
  await page.click('#hotel-save-btn');
  await page.waitForTimeout(600);
  ok('PATCH: пустое поле уходит пустой строкой (очистка)', patches.length === 2 && patches[1].directions === '', patches[1]);

  const hs = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('нет горизонтальной прокрутки', hs.sw <= hs.cw + 1, hs);
  ok('нет ошибок в консоли', errors.length === 0, errors);
  await browser.close(); srv.close();
  return results;
}

(async () => {
  let all = [];
  for (const vp of [{ w: 390, h: 844 }, { w: 1366, h: 768 }]) all = all.concat(await run(vp));
  const good = all.filter(Boolean).length;
  console.log('Итого: ' + good + ' из ' + all.length);
  process.exit(good === all.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
