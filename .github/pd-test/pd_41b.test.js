// 23.10 (порция 41Б): защита данных гостей в кабинете партнёра. Ответы API — заглушки (бэкенд порции 40А, zaedem-backend#24).
// Проверяем, в двух режимах — с pd_mask (маски в списке) и без него (как раньше), на 390×844 и 1366×768:
//  • список: с pd_mask телефон и e-mail маской, без ссылки tel:, карточка не запрашивается; без pd_mask — как раньше;
//  • «Показать контакты»: один запрос карточки GET /api/bookings/:num только на нажатие, только для этой брони; tel: и e-mail полностью;
//  • печать: «Лист сведений» → guest-data?purpose=print_info, «Анкета МВД» → ?purpose=print_mvd, «Данные гостя» — без purpose;
//    «Контакт для связи» — полный телефон (если guest-data вдруг отдал маску — берётся из карточки);
//  • 429 от guest-data — текст из error, без белого экрана и без повторных запросов;
//  • purged: contract_purged в списке и purged в guest-data — текст вместо данных и кнопок;
//  • «Выйти на всех устройствах»: отмена — ничего не уходит; подтверждение → POST /api/users/logout-all → экран входа;
//  • без ошибок в консоли и без горизонтальной прокрутки.
// Запуск: node .github/pd-test/pd_41b.test.js  (ZB_CHROME — путь к Chromium, если нужен)
const path = require('path');
const fs = require('fs');
const http = require('http');
const cp = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(cp.execSync('npm root -g').toString().trim() + '/playwright'); }

const ROOT = process.env.ZB_ROOT ? path.resolve(process.env.ZB_ROOT) : path.resolve(__dirname, '..', '..');

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
  object_type: 'guest', sync_mode: 'own', checkin_time: '14:00', checkout_time: '12:00', house_rules: '', cancel_rules: '', directions: '' };

const PURGED = 'Данные удалены по сроку хранения';
const FULL = {
  'ZB-100001': { phone: '+375 29 123-45-33', email: 'ivan@mail.ru', name: 'Иван Иванов' },
  'ZB-100002': { phone: '+375 44 765-43-21', email: 'anna@gmail.com', name: 'Анна Петрова' },
  'ZB-100003': { phone: '+375 33 555-00-99', email: 'olga@tut.by', name: 'Ольга Сидорова' },
};
const MASKED = {
  'ZB-100001': { phone: '+375 29 ***-**-33', email: 'i***@mail.ru' },
  'ZB-100002': { phone: '+375 44 ***-**-21', email: 'a***@gmail.com' },
  'ZB-100003': { phone: '+375 33 ***-**-99', email: 'o***@tut.by' },
};
const digits = s => String(s).replace(/[^\d+]/g, '');

function listRow(num, mask, extra) {
  const f = FULL[num], m = MASKED[num];
  return Object.assign({
    id: num, booking_num: num, hotel_id: HID, hotel_name: 'Тестовая усадьба', room_name: 'Номер 1',
    guest_name: f.name, guest_email: mask ? m.email : f.email, guest_phone: mask ? m.phone : f.phone,
    check_in: '2026-11-10', check_out: '2026-11-12', nights: 2, guests_count: 2, total_price: 200, currency: 'BYN',
    status: 'confirmed', source: 'own', contract_filled_at: '2026-10-20T10:00:00Z', contract_guests_count: 2, contract_has_foreign: false,
    guest_citizenship: 'BY', contract_has_data: true, created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z',
  }, mask ? { pd_masked: true } : {}, extra || {});
}

function guestDataBody(num, state) {
  if (state.gdPurged) return { ok: true, booking: { booking_num: num, guest_phone: FULL[num].phone }, guests: [], purged: true, purged_text: PURGED };
  const g = num === 'ZB-100001'
    ? [{ last: 'Мюллер', first: 'Ганс', citizenship: 'DE', citizenship_other: 'Германия', doc_type: 'passport_foreign', doc_series: 'C', doc_number: '123456', birth: '1980-01-02' }]
    : [{ last: 'Петрова', first: 'Анна', citizenship: 'BY', doc_type: 'passport_by', doc_series: 'MP', doc_number: '7654321', birth: '1990-05-06', personal_no: '3010590A001PB1' }];
  // для ZB-100001 в режиме «маска» guest-data отдаёт маску — печать должна взять полный телефон из карточки
  const phone = (num === 'ZB-100001' && state.gdMaskedPhone) ? MASKED[num].phone : FULL[num].phone;
  return { ok: true, booking: { booking_num: num, hotel_name: 'Тестовая усадьба', hotel_address: 'д. Тестовая, 1', room_name: 'Номер 1',
    guest_name: FULL[num].name, guest_phone: phone, guest_email: FULL[num].email, check_in: '2026-11-10', check_out: '2026-11-12', nights: 2, guests_count: 2 },
    guests: g, filled: true, filled_at: '2026-10-20T10:00:00Z' };
}

function makeApi(mask, log, state) {
  return async route => {
    const req = route.request();
    const u = new URL(req.url());
    const p = u.pathname, m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const json = (o, status = 200) => route.fulfill({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
    if (p === '/api/users/login') return json({ success: true, token: TOKEN, user: USER });
    if (p === '/api/hotels/owner/my') return json([HOTEL]);
    if (p === '/api/cities') return json([{ id: 1, name_ru: 'Минск' }]);
    if (p === '/api/hotels/' + HID) return json(HOTEL);
    if (p === '/api/bookings/my') {
      return json(Object.assign({
        bookings: [
          listRow('ZB-100001', mask, { guest_citizenship: 'DE', contract_has_foreign: true }),
          listRow('ZB-100002', mask),
          listRow('ZB-100003', mask, { contract_purged: true, contract_purged_text: PURGED }),
        ], total: 3, hotel_ids: [HID] }, mask ? { pd_mask: true } : {}));
    }
    let mm;
    if ((mm = p.match(/^\/api\/bookings\/(ZB-\d+)\/guest-data$/)) && m === 'GET') {
      log.gd.push({ num: mm[1], purpose: u.searchParams.has('purpose') ? u.searchParams.get('purpose') : null });
      if (state.rate429) return json({ ok: false, error: 'Слишком много запросов данных гостей. Попробуйте через час или напишите на hotel@zaedem.by.', limit_per_hour: 30 }, 429);
      return json(guestDataBody(mm[1], state));
    }
    if ((mm = p.match(/^\/api\/bookings\/(ZB-\d+)$/)) && m === 'GET') {
      log.card.push(mm[1]);
      const f = FULL[mm[1]];
      return json({ booking: { booking_num: mm[1], guest_name: f.name, guest_phone: f.phone, guest_email: f.email, pd_card: mask ? true : undefined,
        contract_has_data: true, contract_purged: mm[1] === 'ZB-100003' ? true : undefined } });
    }
    if (p === '/api/users/logout-all' && m === 'POST') {
      if (state.logoutFail) { log.logoutFail.push(1); return json({ error: 'Ошибка сервера' }, 500); }
      log.logout.push(1); return json({ success: true, message: 'Все сессии завершены' });
    }
    return json({ success: true, hotel: null, hotels: [], bookings: [], requisites: null, data: [] });
  };
}

async function run(vp, mask) {
  const tag = vp.w + (mask ? ' [pd_mask]' : ' [без маски]');
  const isTouch = vp.w < 800;
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch({ executablePath: process.env.ZB_CHROME || undefined });
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: isTouch, isMobile: isTouch });
  const log = { gd: [], card: [], logout: [], logoutFail: [] };
  const state = { logoutFail: false, rate429: false, gdPurged: false, gdMaskedPhone: mask };
  const errors = [], results = [], dialogs = [], popups = [];
  let dismissNext = false;
  await ctx.route('https://api.zaedem.by/**', makeApi(mask, log, state));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const KNOWN = /%7BsafeUrl\(|\$\{safeUrl\(|\/x$/;
  // Chrome сам пишет «Failed to load resource» на каждый ответ 429/500 — их заглушка отдаёт нарочно (предел запросов, сбой выхода).
  // Считаем их отдельно и проверяем число; любая другая ошибка в консоли — провал
  const netExpected = [];
  page.on('console', m => {
    if (m.type() !== 'error' || KNOWN.test(m.location().url || '') || /404/.test(m.text())) return;
    const mm = /Failed to load resource.*status of (429|500)/.exec(m.text());
    if (mm) netExpected.push(mm[1]); else errors.push('console.error: ' + m.text());
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => { dialogs.push(d.message()); if (dismissNext) { dismissNext = false; d.dismiss(); } else d.accept(); });
  page.on('popup', p => popups.push(p));
  const ok = (name, cond, extra) => { results.push(!!cond); console.log((cond ? '  ✓ ' : '  ✗ ') + tag + ' ' + name + (cond ? '' : '  → ' + JSON.stringify(extra))); };
  const row = n => page.locator('tr[data-bk="' + n + '"]');
  const rowInfo = async n => page.evaluate(num => {
    const tr = document.querySelector('tr[data-bk="' + num + '"]'); if (!tr) return null;
    const tel = tr.querySelector('a[href^="tel:"]');
    return { text: tr.innerText, tel: tel ? tel.getAttribute('href') : null,
      btns: Array.from(tr.querySelectorAll('button')).map(b => b.textContent.trim()) };
  }, n);
  const lastPopupText = async () => { const p = popups[popups.length - 1]; await p.waitForLoadState('load').catch(() => {}); const t = await p.evaluate(() => document.body.innerText); await p.close(); return t; };

  await page.goto(base + '/', { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.setItem('cab_pwa_dismissed', String(Date.now())); } catch (e) {} });
  await page.fill('#loginEmail', 'owner@test.by');
  await page.fill('#loginPass', 'pass12345');
  await page.click('.login-btn');
  await page.waitForFunction(() => document.getElementById('app') && document.getElementById('app').style.display === 'flex', null, { timeout: 8000 });
  await page.evaluate(() => showPage('bookings'));
  await page.waitForSelector('tr[data-bk="ZB-100002"]', { timeout: 8000 });

  // ── 1. Список ──
  let r1 = await rowInfo('ZB-100001'), r2 = await rowInfo('ZB-100002'), r3 = await rowInfo('ZB-100003');
  if (mask) {
    ok('список: телефон и e-mail маской как пришли', r2.text.includes(MASKED['ZB-100002'].phone) && r2.text.includes(MASKED['ZB-100002'].email), r2.text);
    ok('список: ни одной ссылки tel: в таблице', (await page.locator('#bookings-table a[href^="tel:"]').count()) === 0, await page.locator('#bookings-table a[href^="tel:"]').count());
    ok('список: полных контактов в тексте нет', !r2.text.includes(FULL['ZB-100002'].email) && !r2.text.includes('765-43-21'), r2.text);
    ok('список: у каждой строки кнопка «Показать контакты»', [r1, r2, r3].every(r => r.btns.some(b => /Показать контакты/.test(b))), [r1.btns, r2.btns, r3.btns]);
    ok('список: карточки не запрашивались ни для одной строки', log.card.length === 0, log.card);
  } else {
    ok('без pd_mask: телефон — ссылкой tel: как раньше', r2.tel === 'tel:' + digits(FULL['ZB-100002'].phone), r2.tel);
    ok('без pd_mask: e-mail полностью', r2.text.includes(FULL['ZB-100002'].email), r2.text);
    ok('без pd_mask: кнопки «Показать контакты» нет', ![r1, r2, r3].some(r => r.btns.some(b => /контакты/.test(b))), [r1.btns, r2.btns]);
    ok('без pd_mask: карточки не запрашивались', log.card.length === 0, log.card);
  }

  // ── 2. «Показать контакты» (с pd_mask) ──
  if (mask) {
    await row('ZB-100002').locator('button', { hasText: 'Показать контакты' }).click();
    await page.waitForFunction(() => { const t = document.querySelector('tr[data-bk="ZB-100002"] a[href^="tel:"]'); return !!t; }, null, { timeout: 5000 }).catch(() => {});
    r2 = await rowInfo('ZB-100002'); r1 = await rowInfo('ZB-100001');
    ok('контакты: ровно один запрос карточки и только этой брони', log.card.length === 1 && log.card[0] === 'ZB-100002', log.card);
    ok('контакты: телефон ссылкой tel: полностью', r2.tel === 'tel:' + digits(FULL['ZB-100002'].phone), r2.tel);
    ok('контакты: e-mail полностью', r2.text.includes(FULL['ZB-100002'].email), r2.text);
    ok('контакты: соседняя строка осталась маской, без tel:', r1.tel === null && r1.text.includes(MASKED['ZB-100001'].phone), r1);
    await row('ZB-100002').locator('button', { hasText: 'Скрыть контакты' }).click();
    r2 = await rowInfo('ZB-100002');
    ok('контакты: «Скрыть» возвращает маску, tel: пропадает, нового запроса нет', r2.tel === null && r2.text.includes(MASKED['ZB-100002'].phone) && log.card.length === 1, { r2, card: log.card });
    // раскрываем снова — для проверки печати
    await row('ZB-100002').locator('button', { hasText: 'Показать контакты' }).click();
    await page.waitForFunction(() => !!document.querySelector('tr[data-bk="ZB-100002"] a[href^="tel:"]'), null, { timeout: 5000 }).catch(() => {});
    log.card.length = 0;
  }

  // ── 3. Печать и просмотр: purpose ──
  log.gd.length = 0;
  await row('ZB-100002').locator('button', { hasText: 'Лист сведений' }).click();
  await page.waitForTimeout(500);
  let txt = popups.length ? await lastPopupText() : '';
  ok('«Лист сведений» → guest-data?purpose=print_info', log.gd.length === 1 && log.gd[0].num === 'ZB-100002' && log.gd[0].purpose === 'print_info', log.gd);
  ok('лист: «Контакт для связи» — полный телефон', txt.includes('Контакт для связи: ' + FULL['ZB-100002'].phone) && !txt.includes('***'), txt.slice(0, 400));
  ok('лист: данные проживающего на месте', txt.includes('Петрова Анна') && txt.includes('MP 7654321'), txt.slice(0, 400));

  const nBefore = popups.length;
  await row('ZB-100001').locator('button', { hasText: 'Анкета МВД' }).click();
  await page.waitForTimeout(500);
  txt = popups.length > nBefore ? await lastPopupText() : '';
  const gdMvd = log.gd[log.gd.length - 1];
  ok('«Анкета МВД» → guest-data?purpose=print_mvd', log.gd.length === 2 && gdMvd.num === 'ZB-100001' && gdMvd.purpose === 'print_mvd', log.gd);
  ok('анкета МВД: «Контакт для связи» — полный телефон, не маска', txt.includes('Контакт для связи: ' + FULL['ZB-100001'].phone) && !txt.includes('***'), txt.slice(0, 400));
  if (mask) ok('анкета МВД: guest-data отдал маску — полный телефон взят из карточки (один запрос)', log.card.length === 1 && log.card[0] === 'ZB-100001', log.card);

  dialogs.length = 0;
  await row('ZB-100002').locator('button', { hasText: 'Данные гостя' }).click();
  await page.waitForTimeout(400);
  const gdView = log.gd[log.gd.length - 1];
  ok('«Данные гостя» → guest-data без purpose', log.gd.length === 3 && gdView.num === 'ZB-100002' && gdView.purpose === null, log.gd);
  ok('«Данные гостя»: данные показаны', dialogs.length === 1 && /Петрова Анна/.test(dialogs[0]), dialogs);

  // ── 4. 429 ──
  state.rate429 = true; dialogs.length = 0; log.gd.length = 0;
  const popBefore = popups.length;
  await row('ZB-100002').locator('button', { hasText: 'Данные гостя' }).click();
  await page.waitForTimeout(500);
  ok('429: показан текст из error', dialogs.length === 1 && /Слишком много запросов данных гостей/.test(dialogs[0]), dialogs);
  ok('429: один запрос, без повторов', log.gd.length === 1, log.gd);
  await page.waitForTimeout(1500);
  ok('429: и через 1.5 с запросов не прибавилось', log.gd.length === 1, log.gd);
  await row('ZB-100002').locator('button', { hasText: 'Лист сведений' }).click();
  await page.waitForTimeout(500);
  ok('429 на печати: текст из error, окно печати не открыто, кабинет жив',
    dialogs.length === 2 && /Слишком много/.test(dialogs[1]) && popups.length === popBefore && (await page.locator('tr[data-bk="ZB-100002"]').count()) === 1, { dialogs, popups: popups.length });
  state.rate429 = false;

  // ── 5. purged в списке ──
  r3 = await rowInfo('ZB-100003');
  ok('purged в списке: текст «Данные удалены по сроку хранения»', r3.text.includes(PURGED), r3.text);
  ok('purged в списке: нет кнопок «Лист сведений» / «Данные гостя» / «Анкета МВД» / «Запросить»', !r3.btns.some(b => /Лист сведений|Данные гостя|Анкета МВД|Запросить|Ссылка вручную/.test(b)), r3.btns);
  ok('purged в списке: остальные строки с кнопками', (await rowInfo('ZB-100002')).btns.some(b => /Лист сведений/.test(b)), await rowInfo('ZB-100002'));

  // ── 6. purged в guest-data ──
  state.gdPurged = true; dialogs.length = 0;
  const popBefore2 = popups.length;
  await row('ZB-100002').locator('button', { hasText: 'Лист сведений' }).click();
  await page.waitForTimeout(500);
  ok('purged в guest-data: показан purged_text, печатная форма не открыта', dialogs.length === 1 && dialogs[0] === PURGED && popups.length === popBefore2, { dialogs, popups: popups.length });
  r2 = await rowInfo('ZB-100002');
  ok('purged в guest-data: в строке текст вместо кнопок', r2.text.includes(PURGED) && !r2.btns.some(b => /Лист сведений|Данные гостя|Анкета МВД/.test(b)), r2);
  state.gdPurged = false;

  // ── 7. Вёрстка и консоль (до выхода) ──
  let hs = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('«Мои брони»: нет горизонтальной прокрутки', hs.sw <= hs.cw + 1, hs);
  await page.evaluate(() => showPage('profile'));
  await page.waitForSelector('#lo-all-btn', { timeout: 5000 });
  hs = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok('профиль: нет горизонтальной прокрутки', hs.sw <= hs.cw + 1, hs);
  ok('профиль: кнопка «Выйти на всех устройствах» видна', await page.locator('#lo-all-btn').isVisible(), null);

  // ── 8. Выйти на всех устройствах ──
  dismissNext = true; dialogs.length = 0;
  await page.click('#lo-all-btn');
  await page.waitForTimeout(400);
  ok('выход со всех устройств: подтверждение, отмена — запрос не уходит, кабинет на месте',
    dialogs.length === 1 && log.logout.length === 0 && (await page.evaluate(() => document.getElementById('app').style.display)) === 'flex', { dialogs, n: log.logout.length });
  state.logoutFail = true;
  await page.click('#lo-all-btn');
  await page.waitForTimeout(500);
  ok('выход со всех устройств: ошибка сервера — сообщение, остаёмся в кабинете',
    log.logoutFail.length === 1 && /Ошибка сервера/.test(await page.locator('#lo-all-msg').innerText()) && (await page.evaluate(() => document.getElementById('app').style.display)) === 'flex', log.logoutFail);
  state.logoutFail = false;
  ok('нет ошибок в консоли', errors.length === 0, errors);
  await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 8000 }), page.click('#lo-all-btn')]);
  ok('выход со всех устройств: POST /api/users/logout-all ушёл один раз', log.logout.length === 1, log.logout);
  const out = await page.evaluate(() => ({ login: getComputedStyle(document.getElementById('loginWrap')).display, app: getComputedStyle(document.getElementById('app')).display,
    sess: sessionStorage.getItem('hotel_user'), keep: localStorage.getItem('hotel_user_keep') }));
  ok('после выхода — экран входа, вход стёрт', out.login !== 'none' && out.app === 'none' && !out.sess && !out.keep, out);
  ok('нет ошибок в консоли после выхода', errors.length === 0, errors);
  ok('в консоли только нарочные ответы заглушки: два 429 и один 500', netExpected.join() === '429,429,500', netExpected);
  await browser.close(); srv.close();
  return results;
}

(async () => {
  let all = [];
  for (const vp of [{ w: 390, h: 844 }, { w: 1366, h: 768 }]) for (const mask of [true, false]) all = all.concat(await run(vp, mask));
  const good = all.filter(Boolean).length;
  console.log('Итого: ' + good + ' из ' + all.length);
  process.exit(good === all.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
