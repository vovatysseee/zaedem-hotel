// 19.10: проверка значка «З» и подписи платформы в кабинете партнёра (hotel.zaedem.by).
// Что проверяется:
//  1) вкладка: <link rel="icon"> — тот же SVG, что у сайта zaedem.by (zaedem-frontend, b92471f), браузер его
//     действительно рисует (тёмно-зелёный фон #0F2D1D, салатовая «З» #c9f135), прежней «H» нет;
//  2) apple-touch-icon.png (180×180), icon-192/512, icon-maskable-512 — байт в байт как у сайта (SHA-1),
//     manifest.webmanifest отдаётся, все иконки из него открываются и нужного размера, есть maskable;
//  3) шапка: «Заедем.by» на входе (390 и 1366) и в боковой панели (1366), плашка «Кабинет — как приложение»
//     на телефоне показывает новую иконку;
//  4) старых подписей платформы («агрегатор отелей», «Платформа бронирования жилья» и т. п.) нет ни в странице,
//     ни в манифесте, ни в README;
//  5) страница работает как раньше: вход (заглушка), брони, открытие брони по ссылке #booking=<номер>,
//     отмена брони (PATCH /api/bookings/<номер>/status), таблица после отмены;
//  6) ошибок в консоли нет, горизонтальной прокрутки нет.
// Все ответы API — заглушки (https://api.zaedem.by перехватывается), кабинет отдаётся локально.
// Запуск из корня репозитория:
//   node .github/znachok-test/znachok_19_10.test.js            (ZB_VP=390|1366 — только один экран)
//   ZB_ROOT=/путь/к/старой/копии node ...                      (прогон на другой копии — для сравнения со старой версией)
// Папка .github не попадает на GitHub Pages (Jekyll пропускает папки с точкой).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const cp = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(cp.execSync('npm root -g').toString().trim() + '/playwright'); }

const ROOT = process.env.ZB_ROOT ? path.resolve(process.env.ZB_ROOT) : path.resolve(__dirname, '..', '..');
const OUT = process.env.ZB_OUT || __dirname;
const SHOTS = path.join(OUT, 'shots_19_10');
fs.mkdirSync(SHOTS, { recursive: true });

// Эталон — значок сайта zaedem.by (zaedem-frontend, index.html и страницы документов)
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230F2D1D'/%3E%3Ctext x='32' y='44' font-family='Arial,sans-serif' font-size='38' font-weight='900' fill='%23c9f135' text-anchor='middle'%3E3%3C/text%3E%3C/svg%3E";
// SHA-1 иконок сайта zaedem.by (zaedem-frontend, b92471f). Если клон zaedem-frontend рядом (ZB_FRONT), берём из него.
const FRONT = process.env.ZB_FRONT || '/home/user/vovatysseee/zaedem-frontend';
const ICON_SHA1 = {
  'apple-touch-icon.png': 'a776b6a832ee0fbe99153f15474d8bbae7e93647',
  'icon-192.png': '3b186b78c27c407e3ca91377f3cf462cd274857e',
  'icon-512.png': '21a676fccd71e93c18295ea3118823ccab220afa',
  'icon-maskable-512.png': 'e3fe3cf803479fda427c6d78105711e6668896b4'
};
const sha1 = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

const OLD_WORDING = [
  /агрегатор/i, /Платформа\s+бронирования\s+жилья/, /платформа\s+для\s+бронирования/i,
  /Белорусск(ий|ая)\s+(агрегатор|сервис|портал|площадка)/i
];

const NEW_SIGNATURE = 'Белорусская платформа бронирования жилья';

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

// Заглушка API: одна бронь, которую можно отменить; всё остальное — пустые успешные ответы
function makeApi(log) {
  const state = { status: 'confirmed' };
  const booking = () => ({
    id: 1, booking_num: 'ZB-TEST-1', status: state.status, hotel_name: 'Тестовый отель', room_name: 'Стандарт',
    guest_name: 'Иван Тестов', guest_phone: '+375291112233', guest_email: 'g@test.by',
    check_in: '2026-11-10', check_out: '2026-11-12', total_price: 240, nights: 2, guests: 2,
    created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z',
    cancelled_at: state.status === 'cancelled' ? '2026-10-19T10:00:00Z' : null
  });
  return async route => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname, m = req.method();
    log.push(m + ' ' + p);
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (o, status = 200) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
    if (p === '/api/users/login') return json({ success: true, token: TOKEN, user: USER });
    if (p === '/api/bookings/my') return json({ success: true, bookings: [booking()] });
    let mm = /^\/api\/bookings\/([^/]+)\/status$/.exec(p);
    if (mm && m === 'PATCH') {
      log.push('PATCH-BODY ' + req.postData() + ' AUTH ' + (req.headers()['authorization'] || '').slice(0, 14));
      state.status = JSON.parse(req.postData() || '{}').status || state.status;
      return json({ success: true });
    }
    // всё прочее (объект, реквизиты, ical и т. д.) — пустой успешный ответ
    return json({ success: true, hotel: null, hotels: [], bookings: [], requisites: null, data: [] });
  };
}

async function run(vp) {
  const isTouch = vp.w < 800;
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch({ executablePath: process.env.ZB_CHROME || undefined });
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h }, hasTouch: isTouch, isMobile: isTouch, deviceScaleFactor: isTouch ? 2 : 1,
    userAgent: isTouch ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' : undefined
  });
  const apiLog = [], errors = [], results = [];
  await ctx.route('https://api.zaedem.by/**', makeApi(apiLog));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  // Известное замечание, не связанное со значком (есть и на main до правки): при холодной загрузке Chrome сам
  // запрашивает «/${safeUrl(...)}» из текста скрипта (прескан HTML) и получает 404. Считаем отдельно, не прячем.
  const KNOWN = /%7BsafeUrl\(|\$\{safeUrl\(/;
  const known = [];
  page.on('console', m => { if (m.type() !== 'error') return; if (KNOWN.test(m.location().url || '')) { known.push('console'); return; } errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) { if (KNOWN.test(r.url())) known.push(r.url()); else errors.push('HTTP ' + r.status() + ' ' + r.url()); } });
  page.on('dialog', d => d.accept());

  const ok = (name, cond, extra) => { results.push({ vp: vp.w, name, ok: !!cond, extra: cond ? undefined : extra }); console.log((cond ? '  ✓ ' : '  ✗ ') + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };
  const noHScroll = async name => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(name + ': нет горизонтальной прокрутки', r.sw <= r.cw + 1, r);
  };

  // ───────── 1. Экран входа ─────────
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForSelector('#loginWrap');

  const head = await page.evaluate(() => ({
    icons: [...document.querySelectorAll('link[rel~="icon"]')].map(l => l.getAttribute('href')),
    apple: [...document.querySelectorAll('link[rel="apple-touch-icon"]')].map(l => l.getAttribute('href')),
    manifest: (document.querySelector('link[rel="manifest"]') || {}).href || null,
    title: document.title
  }));
  ok('вкладка: один rel=icon', head.icons.length === 1, head.icons.length);
  ok('вкладка: значок — тот же SVG, что у zaedem.by', head.icons[0] === FAVICON, (head.icons[0] || '').slice(0, 120));
  ok('вкладка: прежней «H» нет', !/%3EH%3C\/text/.test(head.icons[0] || ''), null);
  ok('вкладка: apple-touch-icon → apple-touch-icon.png', head.apple.length === 1 && head.apple[0] === 'apple-touch-icon.png', head.apple);

  // Браузер рисует значок: на холсте — тёмно-зелёный фон и салатовая цифра
  const px = await page.evaluate(async href => {
    const img = new Image(); img.src = href;
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 64, 64);
    const d = g.getImageData(0, 0, 64, 64).data;
    let lime = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a > 200 && Math.abs(r - 0xc9) < 40 && Math.abs(gg - 0xf1) < 40 && Math.abs(b - 0x35) < 60) lime++;
      if (a > 200 && Math.abs(r - 0x0F) < 8 && Math.abs(gg - 0x2D) < 8 && Math.abs(b - 0x1D) < 8) dark++;
    }
    return { w: img.naturalWidth, lime, dark };
  }, head.icons[0] || FAVICON).catch(e => ({ err: String(e) }));
  ok('вкладка: значок рисуется (фон #0F2D1D + салатовый знак #c9f135)', px.w > 0 && px.dark > 1500 && px.lime > 150, px);

  // apple-touch-icon и PNG-иконки: открываются, размер, совпадение с сайтом
  const fetchImg = async rel => page.evaluate(async rel => {
    const r = await fetch(rel); const ct = r.headers.get('content-type');
    const bl = await r.blob(); const u = URL.createObjectURL(bl);
    const img = new Image(); img.src = u; await img.decode().catch(() => {});
    return { status: r.status, ct, w: img.naturalWidth, h: img.naturalHeight };
  }, rel);
  const shaFront = {};
  for (const f of Object.keys(ICON_SHA1)) {
    const fp = path.join(FRONT, f);
    shaFront[f] = fs.existsSync(fp) ? sha1(fp) : ICON_SHA1[f];
  }
  const sizes = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'icon-maskable-512.png': 512 };
  for (const f of Object.keys(sizes)) {
    const r = await fetchImg(head.apple[0] && f === 'apple-touch-icon.png' ? head.apple[0] : f);
    ok(f + ': открывается как PNG ' + sizes[f] + '×' + sizes[f], r.status === 200 && /png/.test(r.ct || '') && r.w === sizes[f] && r.h === sizes[f], r);
    const mine = path.join(ROOT, f);
    ok(f + ': файл совпадает с сайтом zaedem.by (SHA-1)', fs.existsSync(mine) && sha1(mine) === shaFront[f], { mine: fs.existsSync(mine) ? sha1(mine) : null, front: shaFront[f] });
  }

  // manifest: отдаётся, иконки открываются, есть maskable
  const mf = await page.evaluate(async () => { const r = await fetch(document.querySelector('link[rel="manifest"]').href); return { status: r.status, j: await r.json() }; });
  ok('manifest.webmanifest отдаётся, JSON читается', mf.status === 200 && mf.j && Array.isArray(mf.j.icons), mf.status);
  const mi = (mf.j && mf.j.icons) || [];
  ok('manifest: есть иконки 192, 512 и maskable 512', ['192x192:any', '512x512:any', '512x512:maskable'].every(k => mi.some(i => i.sizes + ':' + i.purpose === k)), mi);
  for (const i of mi) {
    const r = await fetchImg(i.src);
    ok('manifest: ' + i.src + ' (' + i.purpose + ') открывается, размер ' + i.sizes, r.status === 200 && (r.w + 'x' + r.h) === i.sizes, r);
  }
  ok('manifest: название и запуск кабинета не изменились', mf.j.name === 'Заедем.by — кабинет партнёра' && mf.j.short_name === 'Заедем Партнёр' && mf.j.start_url === './#dashboard' && mf.j.scope === './' && mf.j.display === 'standalone', mf.j);

  // шапка (вход) — название «Заедем.by»
  const lg = await page.evaluate(() => { const e = document.querySelector('.login-logo'); const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), vis: r.width > 0 && r.height > 0, ff: getComputedStyle(e).fontFamily }; });
  ok('вход: логотип «Заедем.by» виден', lg.t === 'Заедем.by' && lg.vis, lg);
  ok('вход: подзаголовок кабинета на месте', (await page.textContent('.login-sub')).trim() === 'Личный кабинет партнёра', null);

  // старые подписи
  const html = await page.content();
  const text = await page.evaluate(() => document.body.innerText);
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8') + (fs.existsSync(path.join(ROOT, 'README.md')) ? fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8') : '');
  const bad = OLD_WORDING.filter(re => re.test(html) || re.test(text) || re.test(src)).map(String);
  ok('старых подписей платформы нет (страница, манифест, README)', bad.length === 0, bad);
  await noHScroll('вход');
  await page.screenshot({ path: path.join(SHOTS, vp.w + '_1_vhod.png') });

  // ───────── 2. Вход по заглушке, шапка кабинета ─────────
  await page.fill('#loginEmail', 'owner@test.by');
  await page.fill('#loginPass', 'pass12345');
  await page.click('.login-btn');
  await page.waitForFunction(() => document.getElementById('app') && document.getElementById('app').style.display === 'flex', null, { timeout: 8000 });
  ok('вход: кабинет открылся (заглушка логина)', true);
  await page.waitForSelector('#bookings-table, #dash-bookings', { timeout: 8000 }).catch(() => {});
  if (!isTouch) {
    const sb = await page.evaluate(() => { const e = document.querySelector('.sb-logo-main'); const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), vis: r.width > 0 && r.height > 0 }; });
    ok('шапка кабинета: «Заедем.by» в боковой панели видно', sb.t === 'Заедем.by' && sb.vis, sb);
  } else {
    const sbHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).display === 'none');
    ok('телефон: боковая панель скрыта, как и раньше (в шапке — название раздела)', sbHidden, null);
    // плашка «Кабинет — как приложение» (через 4 с) с иконкой
    await page.waitForSelector('#cab-pwa.show', { timeout: 9000 }).catch(() => {});
    const pw_ = await page.evaluate(async () => {
      const i = document.querySelector('#cab-pwa img'); if (!i) return null;
      await i.decode().catch(() => {}); return { src: i.getAttribute('src'), w: i.naturalWidth };
    });
    ok('телефон: плашка «Кабинет — как приложение» показывает иконку icon-192.png', pw_ && pw_.src === 'icon-192.png' && pw_.w === 192, pw_);
    await page.screenshot({ path: path.join(SHOTS, vp.w + '_2_plashka_ikonka.png') });
    await page.click('#cab-pwa-x').catch(() => {});
  }
  await page.waitForFunction(() => /ZB-TEST-1/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  ok('брони: бронь из заглушки показана на дашборде', /ZB-TEST-1/.test(await page.evaluate(() => document.body.innerText)), null);
  await noHScroll('кабинет');
  await page.screenshot({ path: path.join(SHOTS, vp.w + '_3_kabinet.png') });

  // ───────── 3. Бронь по ссылке #booking=<номер> (после перезагрузки сессия сохранена) ─────────
  await page.evaluate(() => { try { localStorage.setItem('cab_pwa_dismissed', String(Date.now())); } catch (e) {} });
  await page.goto(base + '/#booking=ZB-TEST-1', { waitUntil: 'load' });
  await page.waitForSelector('#bookings-table tr[data-bk]', { timeout: 8000 }).catch(() => {});
  const focus = await page.evaluate(() => { const tr = document.querySelector('#bookings-table tr[data-bk="ZB-TEST-1"]'); return tr ? { hl: tr.classList.contains('bk-focus'), page: (document.getElementById('pageTitle') || {}).textContent } : null; });
  ok('ссылка #booking=ZB-TEST-1: открыт раздел «Мои брони», строка найдена и подсвечена', focus && focus.hl, focus);
  ok('ссылка #booking=…: номер убран из адреса', !/booking=/.test(page.url()), page.url());
  await page.screenshot({ path: path.join(SHOTS, vp.w + '_4_bron_po_ssylke.png') });

  // ───────── 4. Отмена брони ─────────
  const row = '#bookings-table tr[data-bk="ZB-TEST-1"]';
  const cancelBtn = page.locator(row + " button[onclick^='hotelCancelBooking']");
  ok('отмена: у подтверждённой брони есть кнопка отмены', (await cancelBtn.count()) === 1, await cancelBtn.count());
  await cancelBtn.first().click();
  await page.waitForFunction(() => { const tr = document.querySelector('#bookings-table tr[data-bk="ZB-TEST-1"]'); return tr && !tr.querySelector("button[onclick^='hotelCancelBooking']"); }, null, { timeout: 8000 }).catch(() => {});
  const patch = apiLog.filter(x => /^PATCH/.test(x));
  ok('отмена: ушёл PATCH /api/bookings/ZB-TEST-1/status с {"status":"cancelled"} и токеном', patch.some(x => /PATCH \/api\/bookings\/ZB-TEST-1\/status/.test(x)) && patch.some(x => /"status":"cancelled"/.test(x) && /Bearer/.test(x)), patch);
  const after = await page.evaluate(() => { const tr = document.querySelector('#bookings-table tr[data-bk="ZB-TEST-1"]'); return tr ? { txt: tr.innerText, btn: !!tr.querySelector("button[onclick^='hotelCancelBooking']") } : null; });
  ok('отмена: в таблице бронь «Отменено», кнопки отмены больше нет', after && /Отменено/.test(after.txt) && !after.btn, after);
  await noHScroll('«Мои брони»');
  await page.screenshot({ path: path.join(SHOTS, vp.w + '_5_posle_otmeny.png') });

  // ───────── 5. Консоль ─────────
  ok('ошибок в консоли, исключений и неудачных запросов нет', errors.length === 0, errors);
  if (known.length) console.log('  ℹ известное замечание (было и до правки, к значку не относится): холодная загрузка → запрос «/${safeUrl(…)}» (404) × ' + known.filter(x => x !== 'console').length);

  await browser.close(); srv.close();
  return results;
}

(async () => {
  const VPS = [{ w: 390, h: 844 }, { w: 1366, h: 768 }].filter(v => !process.env.ZB_VP || String(v.w) === process.env.ZB_VP);
  let all = [];
  console.log('Корень: ' + ROOT);
  for (const v of VPS) { console.log('\n== ' + v.w + '×' + v.h + (v.w < 800 ? ' (тач)' : '') + ' =='); all = all.concat(await run(v)); }
  const fail = all.filter(r => !r.ok);
  console.log('\nИтого: ' + (all.length - fail.length) + ' из ' + all.length + ' пройдено' + (fail.length ? ', упало ' + fail.length : ''));
  fs.writeFileSync(path.join(OUT, 'result_znachok_19_10' + (process.env.ZB_VP ? '_' + process.env.ZB_VP : '') + '.json'), JSON.stringify({ root: ROOT, total: all.length, failed: fail.length, results: all }, null, 1));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
