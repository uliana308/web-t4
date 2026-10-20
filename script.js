'use strict';

const STORAGE_KEY = 'parkmesto.bookings.v1';
const MINE_COLOR = '#1d5fe0';

const TYPES = {
  standard: { name: 'Обычное', icon: 'i-car', desc: 'Стандартное место 2,5 × 5 м для легкового автомобиля.' },
  wide: { name: 'Широкое', icon: 'i-wide', desc: 'Место 3,5 × 5 м — для внедорожника или минивэна, удобно открывать двери.' },
  ev: { name: 'С зарядкой', icon: 'i-bolt', desc: 'Зарядная станция Type 2, 22 кВт. Электричество включено в цену.' },
  covered: { name: 'Крытое', icon: 'i-roof', desc: 'Под навесом: защита от солнца, дождя и снега.' },
};

const SPOTS = [
  { id: 'A1', row: 'a', type: 'wide',     hour: 110, day: 800,  feats: ['У въезда', '3,5 м'] },
  { id: 'A2', row: 'a', type: 'standard', hour: 70,  day: 500,  feats: ['Рядом с выходом'] },
  { id: 'A3', row: 'a', type: 'standard', hour: 70,  day: 500,  feats: ['Видеонаблюдение'], taken: true, car: '#2b2e35' },
  { id: 'A4', row: 'a', type: 'standard', hour: 80,  day: 550,  feats: ['Видеонаблюдение'] },
  { id: 'A5', row: 'a', type: 'covered',  hour: 120, day: 900,  feats: ['Навес', 'Освещение'] },
  { id: 'A6', row: 'a', type: 'covered',  hour: 120, day: 900,  feats: ['Навес', 'Освещение'], taken: true, car: '#c9ced6' },
  { id: 'A7', row: 'a', type: 'covered',  hour: 130, day: 950,  feats: ['Навес', 'Угловое'] },
  { id: 'B1', row: 'b', type: 'wide',     hour: 100, day: 750,  feats: ['У въезда', '3,5 м'] },
  { id: 'B2', row: 'b', type: 'standard', hour: 60,  day: 450,  feats: ['Эконом'], taken: true, car: '#f6f7f9' },
  { id: 'B3', row: 'b', type: 'standard', hour: 60,  day: 450,  feats: ['Эконом'] },
  { id: 'B4', row: 'b', type: 'wide',     hour: 110, day: 800,  feats: ['3,5 м', 'Для минивэна'] },
  { id: 'B5', row: 'b', type: 'ev',       hour: 150, day: 1100, feats: ['22 кВт', 'Type 2'] },
  { id: 'B6', row: 'b', type: 'ev',       hour: 150, day: 1100, feats: ['22 кВт', 'Type 2'], taken: true, car: '#5a616d' },
  { id: 'B7', row: 'b', type: 'ev',       hour: 160, day: 1200, feats: ['22 кВт', 'Type 2', 'Навес'] },
];

const UNITS = {
  hour: { min: 1, max: 24, forms: ['час', 'часа', 'часов'], label: 'Сколько часов', quick: [1, 2, 4, 8], ms: 3600e3 },
  day:  { min: 1, max: 30, forms: ['сутки', 'суток', 'суток'], label: 'Сколько суток', quick: [1, 3, 7, 14], ms: 86400e3 },
};

const VIEWS = ['park', 'checkout', 'done', 'bookings'];

const state = {
  selectedId: null,
  filters: { type: 'all', maxPrice: 0 },
  mode: 'map',
  bookings: [],
  lastBooking: null,
  busy: false,
  view: 'park',
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byId = (id) => SPOTS.find((s) => s.id === id);
const money = (n) => n.toLocaleString('ru-RU') + ' ₽';
const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}"/></svg>`;
const carSvg = (color) => `<svg viewBox="0 0 60 120" aria-hidden="true" style="color:${color}"><use href="#car"/></svg>`;
const fmtDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

function fmtWhen(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400e3);
  const prefix = diff === 0 ? 'сегодня' : diff === 1 ? 'завтра' : fmtDay.format(d);
  return `${prefix}, ${fmtTime.format(d)}`;
}

function plural(n, [one, few, many]) {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
const qtyText = (n, unit) => `${n} ${plural(n, UNITS[unit].forms)}`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadBookings() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(data)) return [];
    const seen = new Set();
    return data.filter((b) => {
      const spot = b && byId(b.spotId);
      if (!spot || spot.taken || seen.has(b.spotId) || !UNITS[b.unit]) return false;
      seen.add(b.spotId);
      return true;
    });
  } catch (e) {
    return [];
  }
}

function saveBookings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookings));
    return true;
  } catch (e) {
    return false;
  }
}

const bookingFor = (spotId) => state.bookings.find((b) => b.spotId === spotId);

function statusOf(spot) {
  if (spot.taken) return 'taken';
  if (bookingFor(spot.id)) return 'mine';
  if (state.selectedId === spot.id) return 'selected';
  return 'free';
}

function matchesFilters(spot) {
  const f = state.filters;
  if (f.type !== 'all' && spot.type !== f.type) return false;
  if (f.maxPrice && spot.hour > f.maxPrice) return false;
  return true;
}

const el = {
  rowA: $('#row-a'),
  rowB: $('#row-b'),
  list: $('#spot-list'),
  mapWrap: $('#map-wrap'),
  filterEmpty: $('#filter-empty'),
  result: $('#result'),
  sideCard: $('#side-card'),
  ctaInfo: $('#cta-info'),
  heroCard: $('#hero-card'),
  form: $('#booking-form'),
  qty: $('#qty'),
  qtyLabel: $('#qty-label'),
  qtyHint: $('#qty-hint'),
  qtyError: $('#qty-error'),
  quick: $('#quick'),
  plate: $('#plate'),
  plateError: $('#plate-error'),
  formError: $('#form-error'),
  calc: $('#calc'),
  total: $('#total'),
  submit: $('#submit'),
  doneSub: $('#done-sub'),
  doneDetails: $('#done-details'),
  bookingList: $('#booking-list'),
  bookingsEmpty: $('#bookings-empty'),
  bookingsSub: $('#bookings-sub'),
  toasts: $('#toasts'),
};

const mapButtons = new Map();
const listButtons = new Map();
let selectError = '';

function buildSpots() {
  for (const spot of SPOTS) {
    const t = TYPES[spot.type];

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'spot' + (spot.type === 'wide' ? ' is-wide' : '');
    btn.dataset.id = spot.id;
    btn.innerHTML = `
      <span class="spot-tile">
        <span class="spot-id">${spot.id}</span>
        <span class="spot-price">${spot.hour} ₽/ч</span>
        ${spot.type === 'standard' ? '' : `<span class="spot-type">${icon(t.icon)}</span>`}
        <span class="spot-check" aria-hidden="true">${icon('i-check')}</span>
      </span>
      <span class="spot-car" aria-hidden="true">${carSvg(spot.car || MINE_COLOR)}</span>
      <span class="spot-tag" aria-hidden="true">Ваша</span>`;
    (spot.row === 'a' ? el.rowA : el.rowB).append(btn);
    mapButtons.set(spot.id, btn);

    const li = document.createElement('li');
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-item';
    item.dataset.id = spot.id;
    item.innerHTML = `
      <span class="li-thumb"></span>
      <span>
        <span class="li-title">Место ${spot.id} · ${t.name}</span>
        <span class="li-sub"><b>${spot.hour} ₽</b> / час · ${money(spot.day)} / сутки</span>
      </span>
      <span class="pill"></span>`;
    li.append(item);
    el.list.append(li);
    listButtons.set(spot.id, item);
  }
}

const PILL = {
  free: ['', 'Свободно'],
  selected: ['i-check', 'Выбрано'],
  taken: ['', 'Занято'],
  mine: ['i-ticket', 'Ваша бронь'],
};

function renderSpots() {
  let shown = 0, freeShown = 0;

  for (const spot of SPOTS) {
    const status = statusOf(spot);
    const visible = matchesFilters(spot);
    const t = TYPES[spot.type];
    if (visible) { shown++; if (status === 'free' || status === 'selected') freeShown++; }
    const label = `Место ${spot.id}, ${t.name.toLowerCase()}, ${spot.hour} ₽ в час — ` +
      (visible ? { free: 'свободно', selected: 'выбрано', taken: 'занято', mine: 'ваша бронь' }[status] : 'не подходит под фильтр');

    const btn = mapButtons.get(spot.id);
    btn.className = `spot is-${status}` + (spot.type === 'wide' ? ' is-wide' : '') + (visible ? '' : ' is-off');
    btn.disabled = !visible;
    btn.setAttribute('aria-pressed', String(status === 'selected'));
    btn.setAttribute('aria-label', label);

    const item = listButtons.get(spot.id);
    item.parentElement.hidden = !visible;
    item.className = `list-item is-${status}`;
    item.setAttribute('aria-pressed', String(status === 'selected'));
    item.setAttribute('aria-label', label);
    const thumb = item.querySelector('.li-thumb');
    thumb.innerHTML = status === 'taken' ? carSvg(spot.car) : status === 'mine' ? carSvg(MINE_COLOR) : spot.id;
    const pill = item.querySelector('.pill');
    pill.className = 'pill' + (status === 'free' ? '' : ` pill--${status}`);
    pill.innerHTML = (PILL[status][0] ? icon(PILL[status][0]) : '') + PILL[status][1];
  }

  el.filterEmpty.hidden = shown > 0;
  el.mapWrap.hidden = state.mode !== 'map' || shown === 0;
  el.list.hidden = state.mode !== 'list' || shown === 0;
  el.result.textContent = shown
    ? `${shown} ${plural(shown, ['место', 'места', 'мест'])}, свободно ${freeShown}`
    : 'Ничего не найдено';
}

function spotCardHtml(spot, big = false) {
  const t = TYPES[spot.type];
  return `
    <p class="eyebrow">${t.name}</p>
    ${big ? `<h2>Место ${spot.id}</h2>` : `<p class="spot-card-title">Место ${spot.id}</p>`}
    <p class="spot-card-desc">${t.desc}</p>
    <ul class="feats">${spot.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
    ${big ? `<div class="hero-car" aria-hidden="true">${carSvg('#f3f4f6')}</div>` : ''}
    <div class="spot-card-prices">
      <div><b>${money(spot.hour)}</b><span>за час</span></div>
      <div><b>${money(spot.day)}</b><span>за сутки</span></div>
    </div>`;
}

function renderSelection() {
  const spot = state.selectedId && byId(state.selectedId);
  const err = selectError ? `<p class="side-error" role="alert">${icon('i-alert')}${selectError}</p>` : '';

  el.sideCard.innerHTML = spot
    ? `<div class="spot-card">${spotCardHtml(spot)}</div>
       ${err}
       <button class="btn btn-primary btn-block" type="button" data-continue>Продолжить${icon('i-next')}</button>
       <button class="link-btn" type="button" data-clear>Снять выбор</button>`
    : `<div class="side-empty">
         <div class="empty-icon" aria-hidden="true">${icon('i-pin')}</div>
         <p class="side-title">Место не выбрано</p>
         <p>Нажмите на свободное место на схеме или в списке.</p>
       </div>
       ${err}
       <button class="btn btn-primary btn-block" type="button" data-continue>Продолжить${icon('i-next')}</button>`;

  el.ctaInfo.innerHTML = spot
    ? `<p class="cta-title">Место ${spot.id}</p><p class="cta-sub">${TYPES[spot.type].name} · ${spot.hour} ₽/ч</p>`
    : selectError
      ? `<p class="cta-error" role="alert">${icon('i-alert')}${selectError}</p>`
      : `<p class="cta-title">Место не выбрано</p><p class="cta-sub">Нажмите на свободное место</p>`;
}

const currentUnit = () => el.form.elements.unit.value;

function readQty() {
  const unit = UNITS[currentUnit()];
  const raw = el.qty.value.trim();
  if (raw === '') return { error: 'Укажите количество.' };
  if (!/^\d+$/.test(raw)) return { error: 'Введите целое число, без букв и знаков.' };
  const n = Number(raw);
  if (n < unit.min || n > unit.max) return { error: `Можно от ${unit.min} до ${unit.max} ${unit.forms[2]}.` };
  return { value: n };
}

function renderCheckout() {
  const spot = byId(state.selectedId);
  if (!spot) return;
  el.heroCard.innerHTML = spotCardHtml(spot, true);
  renderUnit();
}

function renderUnit() {
  const unit = UNITS[currentUnit()];
  el.qtyLabel.textContent = unit.label;
  el.qtyHint.textContent = `От ${unit.min} до ${unit.max} ${unit.forms[2]}`;
  el.quick.innerHTML = unit.quick.map((n) =>
    `<button type="button" class="chip" data-quick="${n}" aria-pressed="false">${qtyText(n, currentUnit())}</button>`).join('');
  updateTotal();
}

function updateTotal() {
  const spot = byId(state.selectedId);
  const q = readQty();
  $$('[data-quick]', el.quick).forEach((b) => b.setAttribute('aria-pressed', String(!q.error && Number(b.dataset.quick) === q.value)));
  updatePeriod();
  if (!spot || q.error) {
    el.calc.textContent = 'Проверьте количество';
    el.total.textContent = '—';
    el.submit.textContent = 'Забронировать';
    return;
  }
  const price = spot[currentUnit()];
  const sum = price * q.value;
  el.calc.textContent = `${money(price)} × ${qtyText(q.value, currentUnit())}`;
  el.total.textContent = money(sum);
  el.submit.textContent = `Забронировать за ${money(sum)}`;
}

function updatePeriod() {
  const q = readQty();
  const now = new Date();
  $('#period-start').textContent = `Сейчас, ${fmtTime.format(now)}`;
  $('#period-end').textContent = q.error ? '—' : fmtWhen(new Date(now.getTime() + UNITS[currentUnit()].ms * q.value));
}

function setFieldError(input, errEl, msg) {
  errEl.textContent = msg || '';
  if (msg) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function clearFormErrors() {
  setFieldError(el.qty, el.qtyError, '');
  setFieldError(el.plate, el.plateError, '');
  el.formError.textContent = '';
}

function validatePlate() {
  const p = el.plate.value.toUpperCase().replace(/[\s-]/g, '');
  if (!p) return { error: 'Укажите госномер автомобиля.' };
  if (!/^[A-ZА-ЯЁ0-9]{5,9}$/.test(p) || !/\d/.test(p) || !/[A-ZА-ЯЁ]/.test(p)) {
    return { error: 'Нужны буквы и цифры, 5–9 символов. Например: А123ВС77.' };
  }
  return { value: p };
}

function detailsHtml(rows) {
  return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

function bookingRows(b) {
  const end = new Date(b.start + UNITS[b.unit].ms * b.qty);
  return [
    ['Срок', qtyText(b.qty, b.unit)],
    ['Начало', fmtWhen(new Date(b.start))],
    ['Окончание', fmtWhen(end)],
    ['Госномер', escapeHtml(b.plate)],
    ['Сумма', money(b.total)],
  ];
}

function renderBookings() {
  const list = state.bookings;
  $$('[data-count]').forEach((c) => { c.hidden = !list.length; c.textContent = list.length; });
  el.bookingsEmpty.hidden = list.length > 0;
  el.bookingsSub.textContent = list.length
    ? `${list.length} ${plural(list.length, ['бронь', 'брони', 'броней'])} на ${money(list.reduce((a, b) => a + b.total, 0))}`
    : '';

  el.bookingList.innerHTML = list.map((b) => `
    <li class="booking">
      <div class="booking-top">
        <span class="booking-id">${b.spotId}</span>
        <div>
          <p class="booking-title">Место ${b.spotId} · ${TYPES[byId(b.spotId).type].name}</p>
          <p class="booking-meta">Бронь № ${b.id} · ${fmtDate.format(new Date(b.createdAt))}</p>
        </div>
      </div>
      <dl class="details">${detailsHtml(bookingRows(b))}</dl>
      <div class="booking-actions">
        <button type="button" class="btn btn-ghost-danger" data-action="ask" data-id="${b.id}">Отменить бронь</button>
      </div>
    </li>`).join('');
}

function renderDone() {
  const b = state.lastBooking;
  if (!b) return;
  $('#park-scene').innerHTML = `
    <span class="ps-bay"><span class="ps-id">${b.spotId}</span></span>
    <span class="ps-car">${carSvg(MINE_COLOR)}</span>
    <span class="ps-check">${icon('i-check')}</span>`;
  $('#done-title').textContent = `Место ${b.spotId} забронировано`;
  el.doneSub.textContent = `Бронь № ${b.id}. Покажите госномер на въезде.`;
  el.doneDetails.innerHTML = detailsHtml(bookingRows(b));
}

function renderAll() {
  renderSpots();
  renderSelection();
  renderBookings();
}

function toast(message, ico = 'i-check') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = icon(ico) + '<span></span>';
  t.querySelector('span').textContent = message;
  el.toasts.append(t);
  setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 300); }, 3000);
}

function shake(node) {
  if (!node) return;
  node.classList.remove('shake');
  void node.offsetWidth;
  node.classList.add('shake');
}

function go(view) {
  location.hash = '#/' + view;
}

function route() {
  let view = location.hash.replace(/^#\/?/, '') || 'park';
  if (!VIEWS.includes(view)) view = 'park';
  if (view === 'checkout' && !state.selectedId) view = 'park';
  if (view === 'done' && !state.lastBooking) view = 'park';
  if (location.hash !== '#/' + view) history.replaceState(null, '', '#/' + view);

  const changed = state.view !== view;
  state.view = view;
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  const tab = view === 'bookings' ? 'bookings' : 'park';
  $$('[data-tab]').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (view === 'checkout') renderCheckout();
  if (view === 'done') renderDone();

  if (changed) {
    window.scrollTo(0, 0);
    const h = $(`#view-${view} h1`);
    if (h) h.focus({ preventScroll: true });
  }
}

function selectSpot(id) {
  const spot = byId(id);
  const status = statusOf(spot);
  if (status === 'taken') {
    toast(`Место ${id} занято. Выберите свободное`, 'i-alert');
    shake(mapButtons.get(id)); shake(listButtons.get(id));
    return;
  }
  if (status === 'mine') {
    toast(`Место ${id} уже ваше. Отменить можно в «Мои брони»`, 'i-ticket');
    return;
  }
  state.selectedId = status === 'selected' ? null : id;
  selectError = '';
  renderSpots();
  renderSelection();
}

function continueToCheckout() {
  if (!state.selectedId) {
    selectError = 'Сначала выберите свободное место';
    renderSelection();
    shake(el.ctaInfo);
    return;
  }
  clearFormErrors();
  go('checkout');
}

function handleSubmit(e) {
  e.preventDefault();
  if (state.busy) return;
  clearFormErrors();

  const spot = byId(state.selectedId);
  if (!spot) {
    el.formError.textContent = 'Место не выбрано. Вернитесь к схеме.';
    return;
  }
  if (statusOf(spot) !== 'selected') {
    el.formError.textContent = `Место ${spot.id} уже занято. Выберите другое.`;
    return;
  }

  const q = readQty();
  const p = validatePlate();
  if (q.error) setFieldError(el.qty, el.qtyError, q.error);
  if (p.error) setFieldError(el.plate, el.plateError, p.error);
  if (q.error || p.error) {
    el.formError.textContent = 'Исправьте ошибки в форме.';
    (q.error ? el.qty : el.plate).focus();
    return;
  }

  state.busy = true;
  el.submit.disabled = true;
  el.submit.innerHTML = '<span class="spinner" aria-hidden="true"></span>Бронируем…';

  setTimeout(() => finishBooking(spot, q.value, p.value), 700);
}

function finishBooking(spot, qty, plate) {
  const unlock = () => { state.busy = false; el.submit.disabled = false; updateTotal(); };
  if (statusOf(spot) !== 'selected') {
    el.formError.textContent = `Место ${spot.id} уже занято. Выберите другое.`;
    unlock();
    return;
  }

  const unit = currentUnit();
  const now = Date.now();
  const booking = {
    id: 'PM-' + now.toString(36).slice(-5).toUpperCase(),
    spotId: spot.id,
    unit,
    qty,
    price: spot[unit],
    total: spot[unit] * qty,
    plate,
    start: now,
    createdAt: now,
  };

  state.bookings.unshift(booking);
  if (!saveBookings()) {
    state.bookings.shift();
    el.formError.textContent = 'Не удалось сохранить: хранилище браузера недоступно.';
    unlock();
    return;
  }

  state.lastBooking = booking;
  state.selectedId = null;
  el.qty.value = '2';
  el.plate.value = '';
  renderAll();
  go('done');
  if (navigator.vibrate) navigator.vibrate(40);
  unlock();
}

function stepQty(delta) {
  const unit = UNITS[currentUnit()];
  const q = readQty();
  const base = q.error ? unit.min - delta : q.value;
  el.qty.value = String(Math.min(unit.max, Math.max(unit.min, base + delta)));
  setFieldError(el.qty, el.qtyError, '');
  updateTotal();
}

function handleBookingAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const actions = btn.closest('.booking-actions');

  if (btn.dataset.action === 'ask') {
    actions.innerHTML = `
      <p class="confirm-text">Отменить бронь? Место снова станет свободным.</p>
      <button type="button" class="btn btn-danger" data-action="cancel" data-id="${id}">Да, отменить</button>
      <button type="button" class="btn btn-secondary" data-action="keep" data-id="${id}">Оставить</button>`;
    actions.querySelector('[data-action="keep"]').focus();
  } else if (btn.dataset.action === 'keep') {
    renderBookings();
    const again = $(`[data-action="ask"][data-id="${id}"]`, el.bookingList);
    if (again) again.focus();
  } else if (btn.dataset.action === 'cancel') {
    const idx = state.bookings.findIndex((b) => b.id === id);
    if (idx === -1) { renderBookings(); return; }
    const [removed] = state.bookings.splice(idx, 1);
    if (!saveBookings()) {
      state.bookings.splice(idx, 0, removed);
      toast('Не удалось сохранить изменения', 'i-alert');
      return;
    }
    if (state.lastBooking && state.lastBooking.id === removed.id) state.lastBooking = null;
    renderAll();
    toast(`Бронь отменена. Место ${removed.spotId} снова свободно`);
    $('#bookings-title').focus({ preventScroll: true });
  }
}

function applyFilters() {
  if (state.selectedId && !matchesFilters(byId(state.selectedId))) {
    toast(`Место ${state.selectedId} не подходит под фильтр — выбор снят`, 'i-info');
    state.selectedId = null;
    renderSelection();
  }
  const f = state.filters;
  $$('#type-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === f.type)));

  $$('#price-menu .dd-opt').forEach((o) => {
    const max = Number(o.dataset.price);
    const n = SPOTS.filter((s) => (f.type === 'all' || s.type === f.type) && (!max || s.hour <= max)).length;
    o.setAttribute('aria-pressed', String(max === f.maxPrice));
    o.querySelector('small').textContent = `${n} ${plural(n, ['место', 'места', 'мест'])}`;
  });
  $('#price-btn-text').textContent = f.maxPrice ? `До ${f.maxPrice} ₽` : 'Цена';
  $('#price-btn').classList.toggle('is-active', !!f.maxPrice);
  $('#active-reset').hidden = f.type === 'all' && !f.maxPrice;
  renderSpots();
}

function resetFilters() {
  state.filters = { type: 'all', maxPrice: 0 };
  applyFilters();
}

function togglePriceMenu(open) {
  const btn = $('#price-btn');
  const menu = $('#price-menu');
  const isOpen = open ?? menu.hidden;
  menu.hidden = !isOpen;
  btn.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) $('.dd-opt[aria-pressed="true"]', menu).focus();
}

function hideSplash() {
  const splash = $('#splash');
  if (!splash) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => splash.remove(), reduce ? 0 : 2300);
}

function bindEvents() {
  const onSpot = (e) => {
    const b = e.target.closest('[data-id]');
    if (b && !b.disabled) selectSpot(b.dataset.id);
  };
  el.rowA.addEventListener('click', onSpot);
  el.rowB.addEventListener('click', onSpot);
  el.list.addEventListener('click', onSpot);

  $$('#type-chips .chip').forEach((c) => c.addEventListener('click', () => {
    state.filters.type = state.filters.type === c.dataset.type ? 'all' : c.dataset.type;
    applyFilters();
  }));
  $('#price-btn').addEventListener('click', () => togglePriceMenu());
  $$('#price-menu .dd-opt').forEach((o) => o.addEventListener('click', () => {
    state.filters.maxPrice = Number(o.dataset.price);
    togglePriceMenu(false);
    applyFilters();
    $('#price-btn').focus();
  }));
  document.addEventListener('click', (e) => {
    if (!$('#price-menu').hidden && !e.target.closest('#price-dd')) togglePriceMenu(false);
  });
  $('#filters-reset').addEventListener('click', resetFilters);
  $('#active-reset').addEventListener('click', resetFilters);

  $$('.switch-btn').forEach((b) => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    $$('.switch-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderSpots();
  }));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-continue]')) continueToCheckout();
    if (e.target.closest('[data-clear]')) { state.selectedId = null; renderSpots(); renderSelection(); }
  });

  el.form.addEventListener('submit', handleSubmit);
  el.form.addEventListener('change', (e) => {
    if (e.target.name !== 'unit') return;
    const unit = UNITS[currentUnit()];
    const q = readQty();
    if (!q.error && q.value > unit.max) el.qty.value = String(unit.max);
    setFieldError(el.qty, el.qtyError, '');
    renderUnit();
  });
  el.qty.addEventListener('input', () => {
    setFieldError(el.qty, el.qtyError, readQty().error || '');
    updateTotal();
  });
  el.qty.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); stepQty(1); }
    if (e.key === 'ArrowDown') { e.preventDefault(); stepQty(-1); }
  });
  $$('.step').forEach((b) => b.addEventListener('click', () => stepQty(Number(b.dataset.step))));
  el.quick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    el.qty.value = b.dataset.quick;
    setFieldError(el.qty, el.qtyError, '');
    updateTotal();
  });
  el.plate.addEventListener('input', () => {
    if (el.plate.hasAttribute('aria-invalid')) setFieldError(el.plate, el.plateError, validatePlate().error);
  });

  el.bookingList.addEventListener('click', handleBookingAction);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#price-menu').hidden) { togglePriceMenu(false); $('#price-btn').focus(); return; }
    if (state.view === 'checkout') go('park');
    else if (state.view === 'park' && state.selectedId) { state.selectedId = null; renderSpots(); renderSelection(); }
  });

  window.addEventListener('hashchange', route);

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    state.bookings = loadBookings();
    if (state.selectedId && bookingFor(state.selectedId)) state.selectedId = null;
    renderAll();
    route();
  });
}

state.bookings = loadBookings();
buildSpots();
bindEvents();
renderAll();
applyFilters();
route();
hideSplash();
setInterval(() => { if (state.view === 'checkout') updatePeriod(); }, 15000);
