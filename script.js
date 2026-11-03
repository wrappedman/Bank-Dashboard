/* =====================================================================
   script.js — منطق برنامه (بدون هیچ کتابخانه / افزونه خارجی)
   - ناوبری تک\u200cصفحه\u200cای، مدیریت کارت، عملیات بانکی، تنظیمات API
   - ذخیره\u200cسازی محلی با رعایت تنظیمات «ذخیره اطلاعات مهم»
   - حالت کیوسک: صفحه\u200cکلید لمسی، اهداف لمسی بزرگ، خروج خودکار
   ===================================================================== */
(function () {
  'use strict';

  var D = window.BANK_DATA;
  var STORAGE_KEY = 'bank_dashboard_state_v1';
  var PIN_DEMO = '1234';
  var DAILY_LIMIT = 500000000; /* ریال */
  var operationWindowView = null;
  var operationWindowMaximized = false;
  var operationWindowRestoreStyle = null;
  var operationWindowDrag = null;

  /* ------------------------- ابزارها ------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ic(name, extra) { return '<i class="ic ic-' + name + (extra ? ' ' + extra : '') + '" aria-hidden="true"></i>'; }
  function toFa(str) { return String(str == null ? '' : str).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; }); }
  function normDigits(str) {
    return String(str == null ? '' : str)
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[^0-9]/g, '');
  }
  var nf = (function () { try { return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }); } catch (e) { return { format: function (n) { return String(n); } }; } })();
  function unit() { return state.settings.general.currency === 'toman' ? 'تومان' : 'ریال'; }
  function toDisplay(rials) { return state.settings.general.currency === 'toman' ? Math.round(Number(rials) / 10) : Math.round(Number(rials) || 0); }
  function formatMoney(rials) { return nf.format(toDisplay(rials)) + ' ' + unit(); }
  function formatMoneyShort(rials) {
    var v = toDisplay(rials);
    if (v >= 1e9) return nf.format(Math.round(v / 1e8) / 10) + ' میلیارد ' + unit();
    if (v >= 1e6) return nf.format(Math.round(v / 1e5) / 10) + ' میلیون ' + unit();
    if (v >= 1e3) return nf.format(Math.round(v / 1e3)) + ' هزار ' + unit();
    return nf.format(v) + ' ' + unit();
  }
  function formatCard(raw) {
    var digits = normDigits(raw);
    if (!digits) return '—';
    return toFa(digits.replace(/(\d{4})(?=\d)/g, '$1 '));
  }
  function last4(card) { return normDigits(card.number || '').slice(-4) || '••••'; }
  function displayCardNumber(card, forceFull) {
    var revealed = state.session.revealed[card.id] || forceFull;
    var digits = normDigits(card.number || '');
    if (!revealed && state.settings.privacy.maskCard) return '••••  ••••  ••••  ' + toFa(last4(card));
    if (digits.length < 16 || /\*/.test(card.number || '')) return '••••  ••••  ••••  ' + toFa(last4(card));
    return formatCard(digits);
  }
  function expiryDisplay(card) {
    return card.expiry ? toFa(card.expiry) : '•• / ••';
  }
  function persianDate(date, style) {
    try {
      var opts = style === 'short'
        ? { year: 'numeric', month: '2-digit', day: '2-digit' }
        : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', opts).format(date instanceof Date ? date : new Date(date));
    } catch (e) { return new Date(date).toLocaleDateString('fa-IR'); }
  }
  function clockTime(date) {
    try { return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(date)); }
    catch (e) { return ''; }
  }
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function refCode(prefix) { return (prefix || 'BNK') + '-' + Math.floor(100000 + Math.random() * 899999); }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function plainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function merge(target, src) {
    if (!plainObject(src)) return target;
    Object.keys(src).forEach(function (k) {
      if (plainObject(src[k]) && plainObject(target[k])) merge(target[k], src[k]);
      else target[k] = src[k];
    });
    return target;
  }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPath(obj, path, value) {
    var parts = path.split('.'), last = parts.pop();
    var o = parts.reduce(function (acc, k) { if (!acc[k]) acc[k] = {}; return acc[k]; }, obj);
    o[last] = value;
  }
  function matchSearch(text, q) {
    if (!q) return true;
    var norm = function (s) { return String(s || '').replace(/\u200c/g, ' ').replace(/[يك]/g, function (c) { return c === 'ي' ? 'ی' : 'ک'; }).toLowerCase(); };
    return norm(text).indexOf(norm(q)) !== -1;
  }
  function luhnValid(digits) {
    if (!/^\d{16}$/.test(digits)) return false;
    var sum = 0, alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var d = +digits[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function ibanValid(iban) {
    var s = String(iban || '').replace(/\s/g, '').toUpperCase();
    if (!/^IR\d{24}$/.test(s)) return false;
    var digits = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, function (c) { return String(c.charCodeAt(0) - 55); });
    var m = 0;
    for (var i = 0; i < digits.length; i++) m = (m * 10 + +digits[i]) % 97;
    return m === 1;
  }
  function cardById(id) { return state.cards.filter(function (c) { return c.id === id; })[0]; }
  function defaultCard() { return state.cards.filter(function (c) { return c.isDefault; })[0] || state.cards[0]; }
  function totalBalance() { return state.cards.filter(function (c) { return c.status === 'active'; }).reduce(function (s, c) { return s + (Number(c.balance) || 0); }, 0); }

  /* ------------------------- وضعیت برنامه ------------------------- */
  var state;
  function defaultState() {
    return {
      version: 1,
      settings: {
        api: {
          baseUrl: 'https://api.bank-demo.ir/v1', token: 'demo-token-1234', clientId: 'KIOSK-0001',
          bankCode: '017', version: 'v1', timeout: 15, mode: 'sandbox', ssl: true,
          saveToken: false, customHeader: ''
        },
        privacy: { saveExpiry: true, saveFullPan: false, saveCvv: false, maskCard: true, saveHistory: true },
        general: {
          theme: 'light', currency: 'toman', fontSize: 'normal', kiosk: false,
          touchKeypad: true, compact: false, autoLogout: 15, notifications: true, lastView: 'dashboard'
        }
      },
      profile: {
        fullName: 'علی محمدی', phone: '09123456789', email: 'ali.mohammadi@example.ir',
        nationalId: '۰۰۱۲۳۴۵۶۷۸', city: 'تهران', birthDate: '۱۳۷۰/۰۵/۱۲', avatar: '',
        level: 'طلایی', joined: '۱۴۰۱/۰۲/۱۸'
      },
      cards: D.seedCards(),
      transactions: D.seedTransactions(),
      notifications: D.seedNotifications(),
      remittances: D.seedRemittances(),
      bills: D.seedBills(),
      topups: D.seedTopups(),
      favorites: ['balance', 'transfer', 'cards']
    };
  }
  function newSession() {
    return {
      currentView: 'dashboard', serviceKey: 'internet', viewMode: 'grid', category: 'همه',
      search: '', filters: { type: 'همه', cardId: 'همه', status: 'همه', q: '' },
      revealed: {}, receipt: null, balanceResult: null, balanceCardId: null,
      modalConfirm: null, keypadTarget: null, apiStatus: null,
      unlocked: true, lockMode: '', editingCardId: null,
      idleWarned: false, lastActivity: Date.now(), draft: {}
    };
  }
  function loadState() {
    var fresh = defaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) fresh = merge(fresh, JSON.parse(raw));
    } catch (e) { /* حافظه محلی در دسترس نیست: از داده‌های دمو استفاده می‌شود */ }
    ['cards', 'transactions', 'notifications', 'remittances', 'bills', 'topups', 'favorites'].forEach(function (k) {
      if (!Array.isArray(fresh[k])) fresh[k] = defaultState()[k];
    });
    state = fresh;
    state.session = newSession();
    persist();
  }
  function persist() {
    try {
      var copy = clone(state);
      delete copy.session;
      var p = copy.settings.privacy, a = copy.settings.api;
      copy.cards.forEach(function (c) {
        if (!p.saveExpiry) c.expiry = '';
        if (!p.saveCvv) c.cvv = '';
        if (!p.saveFullPan && c.number) c.number = '****' + normDigits(c.number).slice(-4);
      });
      if (!a.saveToken) a.token = '';
      if (!p.saveHistory) {
        copy.transactions = []; copy.remittances = []; copy.bills = []; copy.topups = [];
        copy.notifications = [];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (e) { /* ذخیره ممکن است در مرورگر خصوصی مسدود باشد */ }
  }
  function applyRootClasses() {
    var root = document.documentElement, g = state.settings.general;
    var autoDark = false;
    try { autoDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { }
    var dark = g.theme === 'dark' || (g.theme === 'auto' && autoDark);
    root.classList.toggle('dark', !!dark);
    root.classList.toggle('kiosk', !!g.kiosk);
    root.classList.toggle('large-text', g.fontSize === 'large');
    root.classList.toggle('compact', !!g.compact);
    var btn = $('#themeToggle'); if (btn) btn.innerHTML = ic(dark ? 'sun' : 'moon');
  }
  function updateHeader() {
    var name = state.profile.fullName || 'کاربر';
    $('#headerName').textContent = name;
    $('#menuName').textContent = name;
    var src = state.profile.avatar || './assets/avatar.svg';
    $('#headerAvatar').src = src;
    var menuImg = $('#profileMenu .profile-menu-head img'); if (menuImg) menuImg.src = src;
    var unread = state.notifications.filter(function (n) { return n.unread; }).length;
    var badge = $('#notifyBadge');
    badge.textContent = toFa(unread);
    badge.dataset.zero = unread === 0 ? 'true' : 'false';
    var chip = $('#demoChip');
    var live = state.settings.api.mode === 'live';
    chip.classList.toggle('live', live);
    chip.innerHTML = ic(live ? 'plug-circle-check' : 'flask') + (live ? ' متصل به API' : ' نسخهٔ آزمایشی');
  }

  /* ------------------------- اعلان و پیام ------------------------- */
  function toast(title, text, tone) {
    var stack = $('#toastStack');
    var el = document.createElement('div');
    el.className = 'toast ' + (tone || 'info');
    var iconName = tone === 'success' ? 'circle-check' : tone === 'error' ? 'circle-xmark' : tone === 'warning' ? 'triangle-exclamation' : 'circle-info';
    el.innerHTML = ic(iconName) + '<div><strong>' + esc(title) + '</strong>' + (text ? '<small>' + esc(text) + '</small>' : '') + '</div>';
    stack.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4600);
  }
  function renderNotifications() {
    var list = $('#notificationsList');
    if (!list) return;
    if (!state.notifications.length) {
      list.innerHTML = '<div class="empty-state">' + ic('bell-slash') + '<p>اعلانی وجود ندارد</p></div>';
    } else {
      list.innerHTML = state.notifications.map(function (n) {
        return '<div class="message-box ' + (n.unread ? 'unread' : '') + '" data-action="mark-read-one" data-id="' + esc(n.id) + '" role="button" tabindex="0">' +
          '<div class="message-avatar" style="background:' + esc(n.color) + '">' + ic(n.icon) + '</div>' +
          '<div class="message-content"><div class="message-header"><p class="name">' + esc(n.title) + '</p>' + (n.unread ? '<span class="unread-dot"></span>' : '') + '</div>' +
          '<p class="message-line">' + esc(n.text) + '</p><p class="message-line time">' + esc(n.time) + '</p></div></div>';
      }).join('');
    }
    var unread = state.notifications.filter(function (n) { return n.unread; }).length;
    var badge = $('#notifyBadge');
    badge.textContent = toFa(unread);
    badge.dataset.zero = unread === 0 ? 'true' : 'false';
  }
  function renderSideSummary() {
    var el = $('#sideSummary'); if (!el) return;
    var d = defaultCard();
    var api = state.settings.api;
    el.innerHTML = '<h4>' + ic('circle-info') + ' خلاصهٔ نشست</h4>' +
      '<div class="side-summary-row"><span>وضعیت اتصال</span><strong>' + (api.mode === 'sandbox' ? 'شبیه\u200cساز محلی' : 'API زنده') + '</strong></div>' +
      '<div class="side-summary-row"><span>کارت پیشفرض</span><strong>' + (d ? esc(d.short) + ' •• ' + toFa(last4(d)) : '—') + '</strong></div>' +
      '<div class="side-summary-row"><span>خروج خودکار</span><strong>' + (Number(state.settings.general.autoLogout) ? toFa(state.settings.general.autoLogout) + ' دقیقه' : 'غیرفعال') + '</strong></div>' +
      '<div class="side-summary-row"><span>نسخهٔ رابط</span><strong class="ltr" dir="ltr">1.0.0</strong></div>';
  }
  function addNotification(iconName, color, title, text) {
    if (!state.settings.general.notifications) return;
    state.notifications.unshift({ id: uid(), icon: iconName, color: color, title: title, text: text, time: 'هم\u200cاکنون', unread: true });
    if (state.notifications.length > 20) state.notifications.length = 20;
  }

  /* ------------------------- مودال / تایید ------------------------- */
  function openModal(opts) {
    var root = $('#modalRoot');
    root.innerHTML = '<div class="modal ' + (opts.size === 'wide' ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
      '<div class="modal-head"><h3>' + ic(opts.icon || 'circle-info') + esc(opts.title) + '</h3>' +
      '<button class="modal-close" type="button" data-action="close-modal" aria-label="بستن">' + ic('xmark') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.foot === null ? '' : '<div class="modal-foot">' + (opts.foot || '') + '</div>') +
      '</div>';
    root.hidden = false;
    var first = $('[autofocus]', root) || $('input, select, textarea, button', root);
    if (first) { try { first.focus(); } catch (e) { } }
  }
  function closeModal() {
    var root = $('#modalRoot');
    root.hidden = true; root.innerHTML = '';
    if ($('#keypadRoot')) hideKeypad();
    state.session.modalConfirm = null;
  }
  function confirmDialog(opts) {
    var rows = (opts.rows || []).map(function (r) {
      return '<div class="receipt-row"><span>' + esc(r[0]) + '</span><strong>' + esc(r[1]) + '</strong></div>';
    }).join('');
    var body = '<div class="confirm-icon ' + (opts.tone || 'warning') + '">' + ic(opts.icon || 'triangle-exclamation') + '</div>' +
      '<p class="confirm-text">' + esc(opts.text || '') + '</p>' +
      (rows ? '<div class="summary-box">' + rows + '</div>' : '') +
      (opts.otp ? '<div class="form-field full" style="margin-top:14px"><label for="otpInput">کد تأیید (OTP)</label>' +
        '<input class="otp-input" id="otpInput" name="otp" inputmode="numeric" maxlength="4" data-keypad="otp" dir="ltr" autocomplete="one-time-code" placeholder="----" autofocus>' +
        '<span class="field-help">کد آزمایشی: <b class="ltr" dir="ltr">1234</b> · صفحه\u200cکلید لمسی در صورت نیاز باز می\u200cشود</span></div>' : '');
    openModal({
      title: opts.title || 'تأیید عملیات', icon: opts.icon || 'circle-question', size: opts.size,
      body: body,
      foot: '<button class="btn btn-outline" type="button" data-action="close-modal">انصراف</button>' +
        '<button class="btn ' + (opts.tone === 'danger' ? 'btn-danger' : 'btn-primary') + '" type="button" data-action="modal-confirm">' + ic('check') + esc(opts.confirmLabel || 'تأیید') + '</button>'
    });
    state.session.modalConfirm = async function () {
      if (opts.otp) {
        var input = $('#otpInput');
        if (!input || normDigits(input.value) !== PIN_DEMO) {
          toast('کد تأیید نادرست است', 'کد آزمایشی ۱۲۳۴ را وارد کنید.', 'error');
          if (input) input.classList.add('is-invalid');
          return;
        }
      }
      try { await opts.onConfirm(); }
      catch (e) { toast('خطا در انجام عملیات', e && e.message ? e.message : '', 'error'); }
    };
  }

  /* ------------------------- ارتباط با API (شبیه\u200cسازی / واقعی) ------------------------- */
  async function apiRequest(endpoint, payload) {
    var cfg = state.settings.api;
    if (cfg.mode === 'sandbox') {
      await delay(420);
      return { ok: true, status: 200, ref: refCode('API'), message: 'پاسخ شبیه\u200cسازی شده (بدون ارسال درخواست شبکه\u200cای)', data: payload || {} };
    }
    var timer = null;
    try {
      if (!cfg.baseUrl) throw new Error('نشانی پایهٔ API تنظیم نشده است.');
      if (typeof fetch !== 'function') throw new Error('امکان ارسال درخواست شبکه\u200cای در این محیط وجود ندارد.');
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timer = ctrl ? setTimeout(function () { ctrl.abort(); }, (Number(cfg.timeout) || 15) * 1000) : null;
      var headers = { 'Content-Type': 'application/json', 'X-Client-Id': cfg.clientId || '', 'X-Bank-Code': cfg.bankCode || '' };
      var token = state.session.apiToken || cfg.token;
      if (token) headers['Authorization'] = 'Bearer ' + token;
      if (cfg.customHeader) {
        var parts = String(cfg.customHeader).split(':');
        if (parts.length > 1) headers[parts[0].trim()] = parts.slice(1).join(':').trim();
      }
      var res = await fetch(String(cfg.baseUrl).replace(/\/+$/, '') + endpoint, {
        method: 'POST', headers: headers, body: JSON.stringify(payload || {}), signal: ctrl ? ctrl.signal : undefined
      });
      var data = {};
      try { data = await res.json(); } catch (e) { }
      if (!res.ok) throw new Error('پاسخ سرور: HTTP ' + res.status);
      return { ok: true, status: res.status, ref: refCode('API'), message: 'اتصال برقرار شد', data: data };
    } catch (e) {
      return { ok: false, status: 0, message: e && e.name === 'AbortError' ? 'زمان انتظار به پایان رسید' : (e && e.message ? e.message : 'خطای ناشناخته') };
    } finally { if (timer) clearTimeout(timer); }
  }
  async function testApi() {
    readSettingsForm();
    persist();
    var box = $('#apiStatus');
    if (box) box.outerHTML = '<div class="api-status pending" id="apiStatus">' + ic('circle-notch') + '<div><strong>در حال بررسی اتصال…</strong><small>لطفاً صبر کنید</small></div></div>';
    var res = await apiRequest('/health', { ping: true, client: state.settings.api.clientId });
    state.session.apiStatus = res;
    var el = $('#apiStatus');
    if (el) {
      el.className = 'api-status ' + (res.ok ? 'ok' : 'error');
      el.innerHTML = ic(res.ok ? 'circle-check' : 'circle-xmark') + '<div><strong>' +
        (res.ok ? 'اتصال برقرار است' : 'اتصال ناموفق') + '</strong><small>' + esc(res.message) + ' · ' +
        (res.ok ? 'کد ' + toFa(res.status) : 'کد ۰') + ' · ' + esc(clockTime(new Date())) + '</small></div>';
    }
    toast(res.ok ? 'تست اتصال موفق' : 'تست اتصال ناموفق', res.message, res.ok ? 'success' : 'error');
  }

  /* ------------------------- صفحه\u200cکلید لمسی ------------------------- */
  function keypadHtml() {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return '<div class="keypad" role="group" aria-label="صفحه کلید عددی">' +
      '<div class="keypad-head"><span>صفحه\u200cکلید لمسی · ورودی: ' + esc(state.session.keypadTarget && state.session.keypadTarget.placeholder ? state.session.keypadTarget.placeholder : 'عددی') + '</span>' +
      '<button type="button" data-action="keypad-close">بستن</button></div>' +
      '<div class="keypad-grid">' + keys.map(function (k) { return '<button type="button" class="key" data-key="' + k + '">' + toFa(k) + '</button>'; }).join('') +
      '<button type="button" class="key key-action" data-key="clear">' + ic('eraser') + ' پاک</button>' +
      '<button type="button" class="key" data-key="0">' + toFa('0') + '</button>' +
      '<button type="button" class="key key-action" data-key="back">' + ic('delete-left') + '</button>' +
      '<button type="button" class="key key-action key-wide" data-key="done">' + ic('check') + ' تأیید</button>' +
      '</div></div>';
  }
  function showKeypad(input) {
    if (!state.settings.general.touchKeypad && !state.settings.general.kiosk) return;
    state.session.keypadTarget = input;
    var root = $('#keypadRoot');
    root.innerHTML = keypadHtml();
    root.hidden = false;
  }
  function hideKeypad() { $('#keypadRoot').hidden = true; $('#keypadRoot').innerHTML = ''; state.session.keypadTarget = null; }
  function keypadPress(key) {
    var input = state.session.keypadTarget;
    if (!input || !input.parentNode) { hideKeypad(); return; }
    if (key === 'done') { hideKeypad(); return; }
    if (key === 'clear') input.value = '';
    else if (key === 'back') input.value = input.value.slice(0, -1);
    else input.value = String(input.value || '') + key;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) { } }
  }

  /* ------------------------- قفل صفحه / نشست ------------------------- */
  function showLock(mode) {
    state.session.unlocked = false;
    state.session.lockMode = mode || 'lock';
    var titles = {
      logout: 'خروج انجام شد', lock: 'صفحه قفل شد', idle: 'پایان جلسهٔ کاری'
    };
    var descs = {
      logout: 'شما با موفقیت خارج شدید. برای ادامه دوباره وارد شوید.',
      lock: 'برای ادامهٔ کار، رمز ورود خود را وارد کنید.',
      idle: 'به دلیل عدم فعالیت، نشست شما برای حفظ امنیت بسته شد.'
    };
    var root = $('#lockRoot');
    root.innerHTML = '<div class="lock-box"><div class="brand-mark">' + ic('building-columns') + '</div>' +
      '<h2>' + esc(titles[state.session.lockMode]) + '</h2><p>' + esc(descs[state.session.lockMode]) + '</p>' +
      '<form data-form="pin"><div class="form-field"><label for="pinInput">رمز ورود (۴ رقم)</label>' +
      '<input class="pin-input" id="pinInput" name="pin" type="password" inputmode="numeric" maxlength="4" dir="ltr" data-keypad="pin" placeholder="••••" autocomplete="off" autofocus></div>' +
      '<div class="lock-actions"><button class="btn btn-primary" type="submit">' + ic('lock-open') + ' ورود به پیشخوان</button>' +
      '<button class="btn btn-outline" type="button" data-action="demo-login">' + ic('wand-magic-sparkles') + ' ورود آزمایشی</button></div></form>' +
      '<p class="lock-hint">رمز نمایشی: <strong>1234</strong> · تمام داده\u200cها آزمایشی هستند</p></div>';
    root.hidden = false;
    hideKeypad();
    closeModal();
    try { $('#pinInput').focus(); } catch (e) { }
  }
  function unlock() {
    $('#lockRoot').hidden = true;
    $('#lockRoot').innerHTML = '';
    state.session.unlocked = true;
    resetIdle();
    render();
    toast('خوش آمدید', 'نشست کاری شما آغاز شد.', 'success');
  }
  function resetIdle() { state.session.lastActivity = Date.now(); state.session.idleWarned = false; }
  function checkIdle() {
    if (!state.session.unlocked) return;
    var mins = Number(state.settings.general.autoLogout) || 0;
    if (!mins) return;
    var elapsed = Date.now() - state.session.lastActivity;
    if (elapsed >= mins * 60000) { showLock('idle'); toast('نشست بسته شد', 'به دلیل عدم فعالیت از حساب خارج شدید.', 'warning'); return; }
    if (elapsed >= mins * 60000 - 30000 && !state.session.idleWarned) {
      state.session.idleWarned = true;
      confirmDialog({
        title: 'نزدیک به پایان نشست', icon: 'hourglass-half', tone: 'warning',
        text: 'مدت کوتاهی دیگر به دلیل عدم فعالیت، نشست شما بسته می\u200cشود. آیا می\u200cخواهید ادامه دهید؟',
        confirmLabel: 'ادامهٔ کار',
        onConfirm: function () { resetIdle(); closeModal(); }
      });
    }
  }

  /* ------------------------- کمک\u200cسازهای فرم ------------------------- */
  function readForm(form) {
    var out = {};
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name || el.disabled) return;
      out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }
  function setFieldError(form, name, msg) {
    var err = $('[data-error-for="' + name + '"]', form);
    if (err) err.textContent = msg || '';
    var el = $('[name="' + name + '"]', form);
    if (el) el.classList.toggle('is-invalid', !!msg);
  }
  function clearErrors(form) { $$('.field-error', form).forEach(function (e) { e.textContent = ''; }); $$('.is-invalid', form).forEach(function (e) { e.classList.remove('is-invalid'); }); }
  function cardOptions(selected, includeAll) {
    var html = includeAll ? '<option value="همه">همهٔ کارت\u200cها</option>' : '';
    return html + state.cards.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === selected ? ' selected' : '') + '>' +
        esc(c.label) + ' · ' + esc(c.short) + ' •• ' + toFa(last4(c)) + (c.isDefault ? ' (پیشفرض)' : '') + '</option>';
    }).join('');
  }
  function amountQuickChips() {
    return '<div class="quick-amounts">' +
      [[100000, '۱۰ هزار تومان'], [500000, '۵۰ هزار تومان'], [1000000, '۱۰۰ هزار تومان'], [5000000, '۵۰۰ هزار تومان']]
        .map(function (p) { return '<button type="button" data-action="amount-quick" data-amount="' + p[0] + '">' + esc(p[1]) + '</button>'; }).join('') +
      '</div>';
  }
  function fld(o) {
    var id = 'f_' + o.name;
    var req = o.required ? ' <span class="req">*</span>' : '';
    var label = '<label for="' + id + '">' + esc(o.label) + req + '</label>';
    var common = 'id="' + id + '" name="' + esc(o.name) + '"' + (o.required ? ' required' : '') +
      (o.dir ? ' dir="' + o.dir + '"' : '') + (o.keypad ? ' data-keypad="' + o.keypad + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      (o.maxlength ? ' maxlength="' + o.maxlength + '"' : '') +
      (o.autocomplete ? ' autocomplete="' + o.autocomplete + '"' : ' autocomplete="off"');
    var control;
    if (o.type === 'select' || o.type === 'cards') {
      var opts = o.type === 'cards' ? cardOptions(o.value) : (o.options || []).map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === o.value ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
      control = '<select ' + common + '>' + opts + '</select>';
    } else if (o.type === 'textarea') {
      control = '<textarea ' + common + ' rows="2">' + esc(o.value || '') + '</textarea>';
    } else if (o.type === 'amount') {
      control = '<div class="input-wrap amount-wrap" dir="ltr"><input ' + common + ' type="text" inputmode="numeric" data-format="amount" value="' + esc(o.value || '') + '"><span class="input-suffix" dir="rtl">ریال</span></div>' + amountQuickChips();
    } else {
      var t = o.type === 'pin' ? 'password' : (o.type === 'tel' ? 'tel' : 'text');
      var extra = o.format === 'card' ? ' data-format="card" inputmode="numeric"' : '';
      control = '<input ' + common + ' type="' + t + '"' + extra + ' value="' + esc(o.value == null ? '' : o.value) + '">';
    }
    return '<div class="form-field ' + (o.full ? 'full' : '') + '">' + label + control +
      (o.help ? '<span class="field-help">' + esc(o.help) + '</span>' : '') +
      '<span class="field-error" data-error-for="' + esc(o.name) + '"></span></div>';
  }
  function formGrid(fields) { return '<div class="form-grid">' + fields.map(fld).join('') + '</div>'; }
  function stepsHtml(active) {
    var names = ['اطلاعات عملیات', 'تأیید و کد امنیتی', 'رسید نهایی'];
    return '<div class="steps">' + names.map(function (n, i) {
      var step = i + 1;
      return '<div class="step ' + (step === active ? 'active' : step < active ? 'done' : '') + '"><span class="step-num">' + (step < active ? ic('check') : toFa(step)) + '</span>' + esc(n) + '</div>' +
        (step < 3 ? '<span class="step-line"></span>' : '');
    }).join('') + '</div>';
  }
  function panel(title, iconName, inner, tools) {
    return '<div class="panel"><div class="panel-head"><h3>' + ic(iconName) + esc(title) + '</h3>' +
      (tools ? '<div class="tools">' + tools + '</div>' : '') + '</div>' + inner + '</div>';
  }
  function miniList(rows) {
    if (!rows.length) return '<div class="empty-state">' + ic('inbox') + '<p>موردی ثبت نشده است</p></div>';
    return '<div class="mini-list">' + rows.map(function (r) {
      return '<div class="mini-row">' + ic(r.icon || 'circle-info') + '<div class="grow"><strong>' + esc(r.title) + '</strong><small>' + esc(r.meta || '') + '</small></div>' +
        (r.status ? '<span class="chip ' + (r.tone || 'chip-primary') + '">' + esc(r.status) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function txTable(rows, compact) {
    if (!rows.length) return '<div class="empty-state">' + ic('receipt') + '<p>تراکنشی یافت نشد</p></div>';
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>شرح تراکنش</th><th>تاریخ</th><th>کارت</th><th>مبلغ</th><th>وضعیت</th>' +
      (compact ? '' : '<th>شماره پیگیری</th>') + '</tr></thead><tbody>' + rows.map(function (t) {
        var c = cardById(t.cardId);
        var tone = t.status === 'موفق' ? 'ok' : t.status === 'در انتظار' ? 'warn' : 'bad';
        return '<tr data-search="' + esc(t.title + ' ' + t.type + ' ' + t.ref) + '">' +
          '<td><div class="cell-flex"><span class="table-icon">' + ic(t.icon || 'receipt') + '</span><div><strong>' + esc(t.title) + '</strong><br><small class="muted">' + esc(t.type) + '</small></div></div></td>' +
          '<td class="nowrap">' + esc(persianDate(t.date, 'short')) + '<br><small class="muted">' + esc(clockTime(t.date)) + '</small></td>' +
          '<td class="nowrap">' + esc(c ? c.short : '—') + ' •• ' + toFa(c ? last4(c) : '••••') + '</td>' +
          '<td><span class="' + (t.amount >= 0 ? 'amount-in' : 'amount-out') + '">' + (t.amount >= 0 ? '+' : '') + esc(formatMoney(Math.abs(t.amount))) + '</span></td>' +
          '<td><span class="status-pill ' + tone + '">' + esc(t.status) + '</span></td>' +
          (compact ? '' : '<td class="ltr" dir="ltr">' + esc(t.ref) + '</td>') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ------------------------- ناوبری ------------------------- */
  var NAV_GROUP = {
    dashboard: 'dashboard', cards: 'cards', operations: 'operations', balance: 'operations',
    transfer: 'operations', remittance: 'operations', bills: 'operations', topup: 'operations',
    statement: 'statement', receipt: 'operations', settings: 'settings', profile: 'settings', support: 'settings'
  };
  function closeMenus() {
    var menu = $('#profileMenu'); if (menu) menu.hidden = true;
    var pb = $('#profileBtn'); if (pb) pb.setAttribute('aria-expanded', 'false');
    $$('.more-menu').forEach(function (m) { m.hidden = true; });
    var sidebar = $('#sidebar'); if (sidebar) sidebar.classList.remove('open');
    var navToggle = $('#navToggle'); if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
  }
  function updateNav(view) {
    var group = view.indexOf('service:') === 0 ? 'operations' : (NAV_GROUP[view] || 'dashboard');
    $$('.app-sidebar-link[data-view], .bottom-nav button[data-view]').forEach(function (el) {
      el.classList.toggle('active', el.dataset.view === group);
    });
  }
  function operationViewOutput(view) {
    if (view && view.indexOf('service:') === 0) return viewService(view.slice(8));
    var renderer = VIEWS[view];
    return renderer ? renderer() : null;
  }
  function renderOperationWindow(view, updateOnly) {
    var root = $('#operationWindowRoot');
    var out = operationViewOutput(view);
    if (!root || !out) return;
    if (updateOnly && $('.operation-window', root)) {
      $('.window-title', root).textContent = out.title;
      $('.window-subtitle', root).textContent = out.subtitle || '';
      $('.window-tools', root).innerHTML = out.tools || '';
      $('.window-content', root).innerHTML = out.body || '';
      return;
    }
    root.className = 'window-root';
    root.innerHTML = '<section class="operation-window" role="dialog" aria-modal="false" aria-label="' + esc(out.title) + '">' +
      '<header class="window-titlebar" data-window-drag-handle>' +
      '<div class="window-heading"><span class="window-heading-icon">' + ic('layer-group') + '</span><div><strong class="window-title">' + esc(out.title) + '</strong><small class="window-subtitle">' + esc(out.subtitle || '') + '</small></div></div>' +
      '<div class="window-controls">' +
      '<button class="window-control" type="button" data-action="window-minimize" aria-label="کمینه کردن پنجره" title="کمینه کردن">' + ic('minus') + '</button>' +
      '<button class="window-control" type="button" data-action="window-maximize" aria-label="بیشینه کردن پنجره" aria-pressed="false" title="بیشینه کردن">' + ic('expand') + '</button>' +
      '<button class="window-control window-control-close" type="button" data-action="window-close" aria-label="بستن پنجره" title="بستن">' + ic('xmark') + '</button>' +
      '</div></header>' +
      '<div class="window-toolbar window-tools">' + (out.tools || '') + '</div>' +
      '<div class="window-content">' + (out.body || '') + '</div></section>';
    root.hidden = false;
  }
  function openOperationWindow(view) {
    if (!operationViewOutput(view)) { navigate(view); return; }
    operationWindowView = view;
    operationWindowMaximized = false;
    operationWindowRestoreStyle = null;
    var root = $('#operationWindowRoot');
    root.hidden = false;
    root.className = 'window-root';
    renderOperationWindow(view, false);
    resetIdle();
  }
  function closeOperationWindow() {
    var root = $('#operationWindowRoot');
    if (root) { root.hidden = true; root.innerHTML = ''; root.className = 'window-root'; }
    operationWindowView = null;
    operationWindowMaximized = false;
    operationWindowRestoreStyle = null;
    operationWindowDrag = null;
    if ($('#keypadRoot') && !$('#keypadRoot').hidden) hideKeypad();
  }
  function toggleOperationWindowMinimize() {
    var win = $('.operation-window', $('#operationWindowRoot'));
    if (!win) return;
    var minimized = win.classList.toggle('is-minimized');
    var button = $('[data-action="window-minimize"]', win);
    if (button) {
      button.setAttribute('aria-label', minimized ? 'بازگردانی پنجره' : 'کمینه کردن پنجره');
      button.title = minimized ? 'بازگردانی' : 'کمینه کردن';
      button.innerHTML = ic(minimized ? 'expand' : 'minus');
    }
  }
  function toggleOperationWindowMaximize() {
    var win = $('.operation-window', $('#operationWindowRoot'));
    if (!win) return;
    win.classList.remove('is-minimized');
    var minButton = $('[data-action="window-minimize"]', win);
    if (minButton) { minButton.setAttribute('aria-label', 'کمینه کردن پنجره'); minButton.title = 'کمینه کردن'; minButton.innerHTML = ic('minus'); }
    var button = $('[data-action="window-maximize"]', win);
    if (!operationWindowMaximized) {
      operationWindowRestoreStyle = { left: win.style.left, top: win.style.top, right: win.style.right, bottom: win.style.bottom, width: win.style.width, height: win.style.height, transform: win.style.transform };
      win.classList.add('is-maximized');
      win.classList.remove('is-minimized');
      win.style.left = win.style.top = win.style.right = win.style.bottom = win.style.width = win.style.height = win.style.transform = '';
      if (button) { button.setAttribute('aria-pressed', 'true'); button.setAttribute('aria-label', 'بازگردانی اندازهٔ پنجره'); button.title = 'بازگردانی'; button.innerHTML = ic('expand'); }
      operationWindowMaximized = true;
    } else {
      win.classList.remove('is-maximized');
      if (operationWindowRestoreStyle) Object.keys(operationWindowRestoreStyle).forEach(function (key) { win.style[key] = operationWindowRestoreStyle[key]; });
      if (button) { button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', 'بیشینه کردن پنجره'); button.title = 'بیشینه کردن'; button.innerHTML = ic('expand'); }
      operationWindowMaximized = false;
    }
  }
  function navigate(view) {
    if (!view) return;
    if (view.indexOf('service:') === 0) state.session.serviceKey = view.slice(8);
    state.session.currentView = view;
    closeMenus();
    render();
    var vr = $('#viewRoot'); if (vr) vr.scrollTop = 0;
    try { history.replaceState(null, '', '#' + view); } catch (e) { }
    resetIdle();
  }
  function render() {
    var view = state.session.currentView;
    var renderer = view.indexOf('service:') === 0 ? function () { return viewService(view.slice(8)); } : (VIEWS[view] || VIEWS.dashboard);
    var out = renderer();
    $('#pageTitle').textContent = out.title;
    $('#pageSubtitle').textContent = out.subtitle;
    $('#pageTools').innerHTML = out.tools || '';
    $('#viewRoot').innerHTML = out.body;
    $('#pageDate').textContent = persianDate(new Date());
    var boxes = $('#projectBoxes');
    if (boxes) boxes.className = 'project-boxes ' + (state.session.viewMode === 'list' ? 'jsListView' : 'jsGridView');
    applyRootClasses();
    updateHeader();
    updateNav(view);
    renderNotifications();
    renderSideSummary();
    if (operationWindowView && !$('#operationWindowRoot').hidden) renderOperationWindow(operationWindowView, true);
    if (state.session.apiStatus && $('#apiStatus')) {
      var r = state.session.apiStatus;
      $('#apiStatus').className = 'api-status ' + (r.ok ? 'ok' : 'error');
      $('#apiStatus').innerHTML = ic(r.ok ? 'circle-check' : 'circle-xmark') + '<div><strong>' + (r.ok ? 'اتصال برقرار است' : 'اتصال ناموفق') + '</strong><small>' + esc(r.message) + '</small></div>';
    }
  }

  /* ------------------------- داشبورد ------------------------- */
  function opCardHtml(op) {
    var fav = state.favorites.indexOf(op.id) !== -1;
    var tags = op.tags.map(function (t, i) {
      return '<span class="op-tag ' + (i === 0 ? 'solid' : '') + '">' + ic(op.tagIcon) + esc(t) + '</span>';
    }).join('');
    return '<div class="project-box-wrapper"><div class="project-box" style="--main-color-card:' + op.bg + ';--card-accent:' + op.accent + '" ' +
      'data-view="' + esc(op.view) + '" tabindex="0" role="button" aria-label="' + esc(op.title) + '">' +
      '<div class="project-box-header"><div class="op-tags">' + tags + '</div><div class="more-wrapper">' +
      '<button class="project-btn-more" type="button" data-action="op-menu" aria-label="گزینه\u200cهای بیشتر">' + ic('ellipsis-vertical') + '</button>' +
      '<div class="more-menu" hidden>' +
      '<button type="button" data-action="toggle-favorite" data-id="' + op.id + '">' + ic('star') + (fav ? 'حذف از منتخب\u200cها' : 'افزودن به منتخب\u200cها') + '</button>' +
      '<button type="button" data-action="op-info" data-id="' + op.id + '">' + ic('circle-info') + 'جزئیات عملیات</button>' +
      '<button type="button" data-view="' + esc(op.view) + '">' + ic('up-right-from-square') + 'باز کردن</button>' +
      '</div></div></div>' +
      '<div class="project-box-content-header"><div class="op-icon">' + ic(op.icon) + '</div>' +
      '<p class="box-content-header">' + esc(op.title) + (fav ? ' ' + ic('star') : '') + '</p>' +
      '<p class="box-content-subheader">' + esc(op.subtitle) + '</p></div>' +
      '<div class="box-progress-wrapper"><p class="box-progress-header">سهم از استفادهٔ امروز</p>' +
      '<div class="box-progress-bar"><span class="box-progress" style="width:' + op.share + '%"></span></div>' +
      '<p class="box-progress-percentage">٪' + toFa(op.share) + '</p></div>' +
      '<div class="project-box-footer"><div class="participants">' +
      '<span class="mini-card-chip">' + ic('credit-card') + '</span><span class="mini-card-chip">' + ic('credit-card') + '</span><span class="mini-card-chip">' + ic('credit-card') + '</span>' +
      '<span class="participants-label">' + toFa(state.cards.length) + ' کارت</span></div>' +
      '<button class="days-left" type="button" data-view="' + esc(op.view) + '">انجام عملیات ' + ic('angle-left') + '</button>' +
      '</div></div></div>';
  }
  function viewDashboard() {
    var q = state.session.search;
    var ops = D.OPERATIONS.filter(function (op) { return matchSearch(op.title + ' ' + op.subtitle + ' ' + op.tags.join(' '), q); });
    ops.sort(function (a, b) { return (state.favorites.indexOf(b.id) !== -1 ? 1 : 0) - (state.favorites.indexOf(a.id) !== -1 ? 1 : 0); });
    var active = state.cards.filter(function (c) { return c.status === 'active'; }).length;
    var today = new Date();
    var todayCount = state.transactions.filter(function (t) { return new Date(t.date).toDateString() === today.toDateString(); }).length;
    var d = defaultCard();
    var stats = '<div class="projects-section-line"><div class="projects-status">' +
      '<div class="item-status"><span class="status-number">' + esc(formatMoneyShort(totalBalance())) + '</span><span class="status-type">موجودی کل حساب\u200cها</span></div>' +
      '<div class="item-status"><span class="status-number">' + toFa(active) + '</span><span class="status-type">کارت\u200cهای فعال</span></div>' +
      '<div class="item-status"><span class="status-number">' + toFa(todayCount) + '</span><span class="status-type">تراکنش\u200cهای امروز</span></div>' +
      '</div><div class="view-actions">' +
      '<button class="view-btn ' + (state.session.viewMode === 'list' ? '' : 'active') + '" type="button" data-action="set-view-mode" data-mode="grid" title="نمایش شبکه\u200cای">' + ic('table-cells') + '</button>' +
      '<button class="view-btn ' + (state.session.viewMode === 'list' ? 'active' : '') + '" type="button" data-action="set-view-mode" data-mode="list" title="نمایش فهرستی">' + ic('list') + '</button>' +
      '</div></div>';
    var hero = '<div class="hero-strip"><div><div class="hero-label">کارت پیشفرض · ' + esc(d ? d.bank : '—') + '</div>' +
      '<div class="hero-value">' + esc(d ? d.label : 'کارت تعریف نشده') + '</div>' +
      '<div class="hero-card-num">' + esc(d ? displayCardNumber(d) : '—') + '</div></div>' +
      '<div class="row"><button class="btn btn-sm" type="button" data-view="balance">' + ic('wallet') + 'دریافت موجودی</button>' +
      '<button class="btn btn-sm" type="button" data-view="transfer">' + ic('arrow-right-arrow-left') + 'انتقال وجه</button></div></div>';
    var quick = '<div class="quick-stats">' +
      '<div class="qstat">' + ic('shield-halved') + '<div><small>وضعیت امنیتی</small><strong>بسیار خوب · ۹۲٪</strong></div></div>' +
      '<div class="qstat">' + ic('arrow-trend-up') + '<div><small>واریزهای ۳۰ روز</small><strong>' + esc(formatMoneyShort(405000000)) + '</strong></div></div>' +
      '<div class="qstat">' + ic('clock-rotate-left') + '<div><small>آخرین بروزرسانی</small><strong>' + esc(clockTime(new Date())) + '</strong></div></div>' +
      '</div>';
    var cards = ops.length ? ops.map(opCardHtml).join('') : '<div class="empty-state">' + ic('magnifying-glass') + '<p>عملیاتی با این جستجو یافت نشد</p></div>';
    var last = state.transactions.slice(0, 4);
    var lastPanel = '<div class="section-title">' + ic('clock-rotate-left') + 'آخرین تراکنش\u200cها</div>' +
      '<div class="panel">' + txTable(last, true) +
      '<div class="form-actions"><span class="spacer"></span><button class="btn btn-sm btn-outline" type="button" data-view="statement">' + ic('receipt') + 'مشاهدهٔ همهٔ تراکنش\u200cها ' + ic('angle-left') + '</button></div></div>';
    return {
      title: 'عملیات بانکی', subtitle: 'خدمات پرکاربرد خود را انتخاب کنید' + (q ? ' · نتایج جستجو: «' + q + '»' : ''),
      tools: '<button class="btn btn-sm btn-primary" type="button" data-action="card-add">' + ic('plus') + 'کارت جدید</button>',
      body: stats + hero + quick + '<div class="section-title">' + ic('table-cells') + 'همهٔ عملیات\u200cها <span class="chip chip-primary">' + toFa(ops.length) + ' خدمت</span></div>' +
        '<div class="project-boxes jsGridView" id="projectBoxes">' + cards + '</div>' + lastPanel
    };
  }

  /* ------------------------- مدیریت کارت\u200cها ------------------------- */
  function bankCardHtml(card) {
    var gradient = D.CARD_COLORS[card.color] || D.CARD_COLORS.violet;
    return '<div class="card-item ' + (card.isDefault ? 'default' : '') + '">' +
      '<div class="bank-card ' + (card.status === 'frozen' ? 'frozen' : '') + '" style="background:' + gradient + '">' +
      '<div class="bank-card-top"><div class="bank-card-logo">' + ic('building-columns') + '<span>' + esc(card.bank) + '</span></div>' +
      (card.isDefault ? '<span class="bank-card-default">' + ic('star') + ' پیشفرض</span>' : '') + '</div>' +
      '<div class="bank-card-chip"></div>' +
      '<div class="bank-card-number">' + esc(displayCardNumber(card)) + '</div>' +
      '<div class="bank-card-bottom"><div class="bank-card-holder"><small>دارندهٔ کارت</small><strong class="ltr" dir="ltr">' + esc(card.holder || '—') + '</strong></div>' +
      '<div class="bank-card-expiry"><small>انقضا</small><strong>' + esc(expiryDisplay(card)) + '</strong></div>' +
      '<div>' + ic('wifi', 'rtl-flip') + '</div></div></div>' +
      '<div class="bank-card-meta"><div class="between"><div><small class="muted">' + esc(card.label) + ' · ' + esc(card.type || 'برداشت') + '</small>' +
      '<div class="balance">' + esc(formatMoney(card.balance)) + '</div></div>' +
      '<span class="status-pill ' + (card.status === 'active' ? 'ok' : 'bad') + '">' + (card.status === 'active' ? 'فعال' : 'مسدود') + '</span></div>' +
      '<div class="between"><span class="chip">' + ic('hashtag') + '<span class="ltr" dir="ltr">' + esc(card.iban ? card.iban.slice(0, 10) + '…' : '—') + '</span></span>' +
      '<span class="chip ' + (card.expiry ? 'chip-success' : 'chip-warning') + '">' + ic('calendar-days') + (card.expiry ? 'تاریخ انقضا ذخیره شده' : 'انقضا ذخیره نشده') + '</span></div>' +
      '<div class="card-actions">' +
      (card.isDefault ? '<span class="chip chip-primary">' + ic('check') + 'کارت پیشفرض</span>' : '<button class="btn btn-sm btn-outline" type="button" data-action="card-default" data-id="' + esc(card.id) + '">' + ic('star') + 'پیشفرض</button>') +
      '<button class="btn btn-sm btn-outline" type="button" data-action="card-reveal" data-id="' + esc(card.id) + '">' + ic(state.session.revealed[card.id] ? 'eye-slash' : 'eye') + (state.session.revealed[card.id] ? 'پنهان' : 'نمایش') + '</button>' +
      '<button class="btn btn-sm btn-outline" type="button" data-action="card-copy" data-id="' + esc(card.id) + '">' + ic('copy') + 'کپی</button>' +
      '<button class="btn btn-sm btn-outline" type="button" data-action="card-freeze" data-id="' + esc(card.id) + '">' + ic(card.status === 'frozen' ? 'lock-open' : 'ban') + (card.status === 'frozen' ? 'رفع مسدودی' : 'مسدود') + '</button>' +
      '<button class="btn btn-sm btn-outline" type="button" data-action="card-edit" data-id="' + esc(card.id) + '">' + ic('pen-to-square') + 'ویرایش</button>' +
      '<button class="btn btn-sm btn-danger" type="button" data-action="card-delete" data-id="' + esc(card.id) + '">' + ic('trash-can') + 'حذف</button>' +
      '</div></div></div>';
  }
  function viewCards() {
    var saved = state.settings.privacy;
    var notice = '<div class="panel"><div class="between"><div><h3 style="margin:0;font-size:14px">' + ic('shield-halved') + ' ذخیرهٔ اطلاعات مهم کارت</h3>' +
      '<p class="hint">طبق تنظیمات شما: تاریخ انقضا «' + (saved.saveExpiry ? 'ذخیره می\u200cشود' : 'ذخیره نمی\u200cشود') + '» · شمارهٔ کامل «' + (saved.saveFullPan ? 'ذخیره می\u200cشود' : 'فقط ۴ رقم آخر') + '» · CVV2 «' + (saved.saveCvv ? 'ذخیره می\u200cشود' : 'ذخیره نمی\u200cشود') + '».</p></div>' +
      '<button class="btn btn-sm btn-outline" type="button" data-view="settings">' + ic('gear') + 'تغییر تنظیمات</button></div></div>';
    var q = state.session.search;
    var cards = state.cards.filter(function (c) { return matchSearch(c.bank + ' ' + c.label + ' ' + c.number, q); });
    var services = ['block-card', 'change-pin', 'sheba'].map(function (k) {
      var s = D.SERVICE_FORMS[k];
      return '<button class="btn btn-sm btn-outline" type="button" data-view="service:' + k + '">' + ic(s.icon) + esc(s.title) + '</button>';
    }).join('');
    return {
      title: 'کارت\u200cهای بانکی من', subtitle: 'تعریف، ویرایش و تعیین کارت پیشفرض',
      tools: '<button class="btn btn-sm btn-primary" type="button" data-action="card-add">' + ic('plus') + 'افزودن کارت</button>',
      body: notice + (cards.length ? '<div class="cards-grid">' + cards.map(bankCardHtml).join('') + '</div>' :
        '<div class="empty-state">' + ic('credit-card') + '<p>هیچ کارتی تعریف نشده یا با جستجو همخوانی ندارد</p></div>') +
        '<div class="section-title">' + ic('wand-magic-sparkles') + 'خدمات مرتبط با کارت</div><div class="panel"><div class="row">' + services + '</div></div>'
    };
  }
  function openCardModal(id) {
    var c = id ? cardById(id) : null;
    state.session.editingCardId = id || null;
    var banks = D.BANKS.map(function (b) { return '<option value="' + esc(b) + '"' + (c && c.bank === b ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('');
    var colors = Object.keys(D.CARD_COLORS).map(function (k) {
      return '<option value="' + k + '"' + (c && c.color === k ? ' selected' : (!c && k === 'violet' ? ' selected' : '')) + '>' +
        ({ violet: 'بنفش', teal: 'فیروزه\u200cای', pink: 'صورتی', navy: 'آبی', green: 'سبز', orange: 'نارنجی' }[k]) + '</option>';
    }).join('');
    var body = '<form data-form="card" id="cardForm"><div class="form-grid">' +
      fld({ name: 'label', label: 'نام مستعار کارت', required: true, value: c ? c.label : '', placeholder: 'مثال: کارت حقوقی' }) +
      '<div class="form-field"><label for="f_bank">بانک صادرکننده <span class="req">*</span></label><select id="f_bank" name="bank" required>' + banks + '</select><span class="field-error" data-error-for="bank"></span></div>' +
      fld({ name: 'number', label: 'شمارهٔ ۱۶ رقمی کارت', required: true, dir: 'ltr', keypad: 'numeric', format: 'card', value: c ? (c.number && c.number.length >= 16 ? formatCard(c.number) : '') : '', placeholder: '0000 0000 0000 0000', help: 'صحت شماره با الگوریتم Luhn بررسی می\u200cشود.' }) +
      fld({ name: 'holder', label: 'نام دارنده (لاتین)', dir: 'ltr', value: c ? c.holder : 'ALI MOHAMMADI' }) +
      fld({ name: 'expiry', label: 'تاریخ انقضا (ماه/سال)', dir: 'ltr', value: c ? c.expiry : '', placeholder: '08/09', help: 'در صورت غیرفعال بودن ذخیرهٔ اطلاعات مهم، این مقدار حفظ نخواهد شد.' }) +
      fld({ name: 'cvv', label: 'CVV2', dir: 'ltr', keypad: 'numeric', value: c ? c.cvv : '', placeholder: '۳ رقم' }) +
      fld({ name: 'iban', label: 'شناسه شبا (IBAN)', dir: 'ltr', value: c ? c.iban : '', placeholder: 'IR00...', help: 'شبا معتبر با IR و ۲۴ رقم؛ صحت با mod-97 بررسی می\u200cشود.' }) +
      fld({ name: 'balance', label: 'موجودی اولیه (ریال)', dir: 'ltr', keypad: 'amount', value: c ? c.balance : '0' }) +
      '<div class="form-field"><label for="f_color">رنگ کارت</label><select id="f_color" name="color">' + colors + '</select></div>' +
      '<div class="form-field"><label for="f_type">نوع کارت</label><select id="f_type" name="type">' +
      ['برداشت', 'اعتباری', 'هدیه', 'ارزی'].map(function (t) { return '<option' + (c && c.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-field full"><label class="toggle-item" for="f_isDefault"><span class="toggle-copy"><strong>کارت پیشفرض</strong><small>این کارت به\u200cصورت خودکار در عملیات\u200cها انتخاب شود</small></span>' +
      '<span class="switch"><input type="checkbox" id="f_isDefault" name="isDefault"' + (c && c.isDefault ? ' checked' : '') + '><span></span></span></label></div>' +
      '</div></form>';
    openModal({
      title: c ? 'ویرایش کارت بانکی' : 'تعریف کارت بانکی جدید', icon: 'credit-card', size: 'wide', body: body,
      foot: '<button class="btn btn-outline" type="button" data-action="close-modal">انصراف</button>' +
        '<button class="btn btn-primary" type="submit" form="cardForm">' + ic('floppy-disk') + 'ذخیرهٔ کارت</button>'
    });
  }
  function submitCard(form) {
    var v = readForm(form);
    clearErrors(form);
    var digits = normDigits(v.number);
    var errors = false;
    if (!String(v.label || '').trim()) { setFieldError(form, 'label', 'نام مستعار الزامی است.'); errors = true; }
    if (digits.length < 16) { setFieldError(form, 'number', 'شمارهٔ کارت باید ۱۶ رقم باشد.'); errors = true; }
    else if (!luhnValid(digits)) { setFieldError(form, 'number', 'شمارهٔ کارت معتبر نیست (خطای Luhn).'); errors = true; }
    if (v.iban && !ibanValid(v.iban)) { setFieldError(form, 'iban', 'شناسهٔ شبا معتبر نیست.'); errors = true; }
    var exp = normDigits(v.expiry);
    if (exp && !/^\d{3,4}$/.test(exp)) { setFieldError(form, 'expiry', 'فرمت صحیح: ماه/سال (مثلاً 08/09)'); errors = true; }
    if (errors) { toast('اطلاعات کارت ناقص است', 'موارد مشخص\u200cشده را اصلاح کنید.', 'error'); return; }
    var id = state.session.editingCardId;
    var existing = id ? cardById(id) : null;
    var card = existing || { id: uid(), status: 'active', isDefault: false };
    card.bank = v.bank; card.short = String(v.bank).replace('بانک ', '').replace(' ایران', '').trim();
    card.label = String(v.label).trim(); card.number = digits;
    card.holder = String(v.holder || '').toUpperCase() || 'CARD HOLDER';
    card.expiry = v.expiry ? String(v.expiry).trim() : '';
    card.cvv = String(v.cvv || '').trim();
    card.iban = String(v.iban || '').replace(/\s/g, '').toUpperCase();
    card.balance = Math.max(0, Number(normDigits(v.balance)) || 0);
    card.color = v.color; card.type = v.type;
    if (v.isDefault || (!existing && !state.cards.length)) {
      state.cards.forEach(function (c) { c.isDefault = false; });
      card.isDefault = true;
    }
    if (!existing) state.cards.push(card);
    persist(); closeModal(); render();
    toast(existing ? 'کارت به\u200cروزرسانی شد' : 'کارت جدید اضافه شد', card.label, 'success');
    if (!state.settings.privacy.saveFullPan || !state.settings.privacy.saveExpiry) {
      toast('تنظیمات حریم خصوصی اعمال شد', 'بخشی از اطلاعات حساس در حافظهٔ دائم ذخیره نخواهد شد.', 'warning');
    }
    addNotification('credit-card', '#4f3ff0', existing ? 'ویرایش کارت' : 'کارت جدید', 'کارت «' + card.label + '» ثبت شد.');
    persist();
  }

  /* ------------------------- فهرست عملیات ------------------------- */
  function viewOperations() {
    var q = state.session.search;
    var ops = D.OPERATIONS.filter(function (op) {
      return (state.session.category === 'همه' || op.category === state.session.category) &&
        matchSearch(op.title + ' ' + op.subtitle + ' ' + op.tags.join(' '), q);
    });
    var chips = D.CATEGORIES.map(function (c) {
      return '<button class="btn btn-sm ' + (state.session.category === c ? 'btn-primary' : 'btn-outline') + '" type="button" data-action="set-category" data-value="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    var rows = ops.map(function (op) {
      return { icon: op.icon, title: op.title, meta: op.subtitle + ' · ' + op.tags.join(' / '), status: op.category, tone: 'chip-primary' };
    });
    return {
      title: 'همهٔ عملیات\u200cهای بانکی', subtitle: 'دسته\u200cبندی خدمات و دسترسی سریع',
      tools: '<span class="chip chip-teal">' + ic('table-cells') + toFa(ops.length) + ' خدمت</span>',
      body: '<div class="filter-bar">' + chips + '</div>' +
        panel('فهرست خدمات', 'list', miniList(rows)) +
        '<div class="section-title">' + ic('table-cells') + 'کارت\u200cهای میانبر</div>' +
        (ops.length ? '<div class="project-boxes jsGridView" id="projectBoxes">' + ops.map(opCardHtml).join('') + '</div>' :
          '<div class="empty-state">' + ic('magnifying-glass') + '<p>خدمتی یافت نشد</p></div>')
    };
  }

  /* ------------------------- گردش حساب ------------------------- */
  function filteredTransactions() {
    var f = state.session.filters;
    return state.transactions.filter(function (t) {
      return (f.type === 'همه' || t.type === f.type) &&
        (f.cardId === 'همه' || t.cardId === f.cardId) &&
        (f.status === 'همه' || t.status === f.status);
    });
  }
  function viewStatement() {
    var f = state.session.filters;
    var rows = filteredTransactions();
    var income = rows.filter(function (t) { return t.amount > 0; }).reduce(function (s, t) { return s + t.amount; }, 0);
    var expense = rows.filter(function (t) { return t.amount < 0; }).reduce(function (s, t) { return s - t.amount; }, 0);
    var types = ['همه'].concat(Array.from(new Set(state.transactions.map(function (t) { return t.type; }))));
    var bars = [
      { label: 'شنبه', v: 24 }, { label: 'یکشنبه', v: 46 }, { label: 'دوشنبه', v: 32 },
      { label: 'سه\u200cشنبه', v: 68 }, { label: 'چهارشنبه', v: 41 }, { label: 'پنجشنبه', v: 84 }, { label: 'جمعه', v: 28 }
    ];
    return {
      title: 'صورتحساب و گردش حساب', subtitle: 'جستجو، فیلتر و دریافت خروجی تراکنش\u200cها',
      tools: '<button class="btn btn-sm btn-outline" type="button" data-action="export-csv">' + ic('file-csv') + 'خروجی CSV</button>' +
        '<button class="btn btn-sm btn-outline" type="button" data-action="print-statement">' + ic('print') + 'چاپ</button>',
      body: '<div class="quick-stats">' +
        '<div class="qstat">' + ic('arrow-trend-up') + '<div><small>مجموع واریزها</small><strong>' + esc(formatMoneyShort(income)) + '</strong></div></div>' +
        '<div class="qstat">' + ic('arrow-trend-down') + '<div><small>مجموع برداشت\u200cها</small><strong>' + esc(formatMoneyShort(expense)) + '</strong></div></div>' +
        '<div class="qstat">' + ic('receipt') + '<div><small>تعداد تراکنش\u200cها</small><strong>' + toFa(rows.length) + ' مورد</strong></div></div></div>' +
        '<div class="filter-bar"><input class="input-control" id="txSearch" type="search" placeholder="جستجو در شرح یا شماره پیگیری…" value="' + esc(f.q) + '" data-filter="q" aria-label="جستجوی تراکنش">' +
        '<select class="input-control" data-filter="type" aria-label="فیلتر نوع">' + types.map(function (t) { return '<option' + (f.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<select class="input-control" data-filter="cardId" aria-label="فیلتر کارت">' + cardOptions(f.cardId, true) + '</select>' +
        '<select class="input-control" data-filter="status" aria-label="فیلتر وضعیت">' + ['همه', 'موفق', 'در انتظار', 'ناموفق'].map(function (s) { return '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
        '<button class="btn btn-sm btn-outline" type="button" data-action="filter-reset">' + ic('arrows-rotate') + 'بازنشانی</button></div>' +
        txTable(rows, false) +
        '<div class="section-title">' + ic('chart-bar') + 'نمای کلی هفت روز اخیر</div>' +
        '<div class="panel"><div class="chart-bars">' + bars.map(function (b) {
          return '<div class="chart-bar-wrap"><div class="chart-bar" style="height:' + b.v + '%"></div><span>' + esc(b.label) + '</span></div>';
        }).join('') + '</div><p class="hint">نمودار نمایشی بر اساس داده\u200cهای دمو ترسیم شده است.</p></div>'
    };
  }

  /* ------------------------- دریافت موجودی ------------------------- */
  function viewBalance() {
    var selected = state.session.balanceCardId || (defaultCard() ? defaultCard().id : '');
    var card = cardById(selected) || defaultCard();
    var result = state.session.balanceResult;
    var form = '<form data-form="balance" id="balanceForm"><div class="form-grid">' +
      '<div class="form-field"><label for="f_balanceCard">انتخاب کارت</label><select id="f_balanceCard" name="cardId">' + cardOptions(selected) + '</select></div>' +
      '<div class="form-field"><label>نوع استعلام</label><select name="kind"><option>ماندهٔ قابل برداشت</option><option>ماندهٔ دفتری</option><option>صورتحساب لحظه\u200cای</option></select></div>' +
      '</div><div class="form-actions"><button class="btn btn-primary" type="submit" id="balanceSubmit">' + ic('magnifying-glass-dollar') + 'دریافت موجودی</button>' +
      '<span class="hint">پاسخ از ' + (state.settings.api.mode === 'sandbox' ? 'شبیه\u200cساز محلی' : 'API بانک') + ' دریافت می\u200cشود.</span></div></form>';
    var resultHtml = result ? '<div class="receipt"><div class="receipt-head"><div class="success-mark">' + ic('circle-check') + '</div>' +
      '<h3>موجودی دریافت شد</h3><p>' + esc(persianDate(result.at)) + ' · ' + esc(clockTime(result.at)) + '</p></div>' +
      '<div class="receipt-row"><span>کارت</span><strong>' + esc(cardById(result.cardId) ? cardById(result.cardId).label : '—') + '</strong></div>' +
      '<div class="receipt-row"><span>ماندهٔ کل</span><strong>' + esc(formatMoney(result.balance)) + '</strong></div>' +
      '<div class="receipt-row"><span>ماندهٔ قابل برداشت</span><strong>' + esc(formatMoney(result.available)) + '</strong></div>' +
      '<div class="receipt-row"><span>مبلغ مسدود</span><strong>' + esc(formatMoney(result.blocked)) + '</strong></div>' +
      '<div class="receipt-row"><span>شماره پیگیری</span><strong class="ltr" dir="ltr">' + esc(result.ref) + '</strong></div>' +
      '<div class="receipt-row"><span>منبع پاسخ</span><strong>' + esc(result.source) + '</strong></div></div>' :
      '<div class="empty-state">' + ic('wallet') + '<p>برای مشاهدهٔ نتیجه، استعلام موجودی را انجام دهید</p></div>';
    var perCard = state.cards.map(function (c) {
      return '<div class="mini-row">' + ic('credit-card') + '<div class="grow"><strong>' + esc(c.label) + ' · ' + esc(c.short) + ' •• ' + toFa(last4(c)) + '</strong><small>' + (c.isDefault ? 'کارت پیشفرض' : 'کارت فرعی') + '</small></div><strong>' + esc(formatMoney(c.balance)) + '</strong></div>';
    }).join('');
    return {
      title: 'دریافت موجودی', subtitle: 'استعلام لحظه\u200cای مانده و موجودی قابل برداشت',
      tools: '<span class="chip chip-teal">' + ic('plug') + (state.settings.api.mode === 'sandbox' ? 'حالت آزمایشی' : 'API زنده') + '</span>',
      body: stepsHtml(1) + '<div class="grid-2">' + panel('فرم استعلام', 'wallet', form) +
        panel('نتیجهٔ استعلام', 'circle-check', resultHtml) + '</div>' +
        '<div class="section-title">' + ic('credit-card') + 'موجودی کارت\u200cها</div><div class="panel"><div class="mini-list">' + perCard + '</div></div>'
    };
  }
  async function submitBalance(form) {
    var v = readForm(form);
    var card = cardById(v.cardId) || defaultCard();
    if (!card) { toast('کارت یافت نشد', 'ابتدا یک کارت تعریف کنید.', 'error'); return; }
    var btn = $('#balanceSubmit', form);
    if (btn) { btn.disabled = true; btn.innerHTML = ic('circle-notch') + 'در حال استعلام…'; }
    var res = await apiRequest('/balance', { cardId: card.id, kind: v.kind });
    if (!res.ok) { toast('استعلام ناموفق', res.message, 'error'); render(); return; }
    state.session.balanceCardId = card.id;
    state.session.balanceResult = {
      cardId: card.id, balance: card.balance, available: Math.max(0, card.balance - 15000000),
      blocked: 15000000, ref: res.ref, at: new Date().toISOString(),
      source: state.settings.api.mode === 'sandbox' ? 'شبیه\u200cساز محلی' : 'API بانک'
    };
    render();
    toast('موجودی دریافت شد', formatMoney(card.balance), 'success');
  }

  /* ------------------------- عملیات مالی مشترک ------------------------- */
  function deduct(cardId, rials, title, iconName, type) {
    var card = cardById(cardId);
    if (!card) throw new Error('کارت مبدأ یافت نشد.');
    if (card.status === 'frozen') throw new Error('کارت انتخاب\u200cشده مسدود است.');
    if (Number(card.balance) < rials) throw new Error('موجودی کارت کافی نیست.');
    card.balance -= rials;
    var ref = refCode('BNK');
    state.transactions.unshift({
      id: uid(), title: title, type: type || 'انتقال', amount: -Math.abs(rials), cardId: cardId,
      icon: iconName || 'arrow-right-arrow-left', status: 'موفق', date: new Date().toISOString(), ref: ref
    });
    addNotification(iconName || 'circle-check', '#148a54', title, 'مبلغ ' + formatMoney(rials) + ' با موفقیت پرداخت شد.');
    persist();
    return ref;
  }
  function finishReceipt(data) {
    state.session.receipt = data;
    closeModal();
    if (operationWindowView) {
      operationWindowView = 'receipt';
      renderOperationWindow('receipt', true);
    } else navigate('receipt');
    toast('عملیات با موفقیت انجام شد', 'شماره پیگیری: ' + data.ref, 'success');
  }
  function validateAmount(form, name) {
    var el = $('[name="' + name + '"]', form);
    var rials = Number(normDigits(el ? el.value : '')) || 0;
    if (rials < 10000) { setFieldError(form, name, 'حداقل مبلغ ۱۰٬۰۰۰ ریال است.'); return 0; }
    if (rials > DAILY_LIMIT) { setFieldError(form, name, 'مبلغ بیش از سقف مجاز روزانه است.'); return 0; }
    return rials;
  }

  /* ------------------------- انتقال وجه (کارت به کارت) ------------------------- */
  function viewTransfer() {
    var d = defaultCard();
    var form = '<form data-form="transfer" id="transferForm"><div class="form-grid">' +
      '<div class="form-field"><label for="f_src">کارت مبدأ <span class="req">*</span></label><select id="f_src" name="src" required>' + cardOptions(d ? d.id : '') + '</select><span class="field-error" data-error-for="src"></span></div>' +
      fld({ name: 'dest', label: 'شمارهٔ کارت مقصد', required: true, dir: 'ltr', keypad: 'numeric', format: 'card', placeholder: '0000 0000 0000 0000', help: '۱۶ رقم کارت مقصد · الگوریتم Luhn بررسی می\u200cشود' }) +
      fld({ name: 'destName', label: 'نام صاحب کارت مقصد (اختیاری)', placeholder: 'برای اطمینان بیشتر' }) +
      fld({ name: 'amount', label: 'مبلغ انتقال (ریال)', required: true, dir: 'ltr', keypad: 'amount', type: 'amount' }) +
      fld({ name: 'desc', label: 'توضیحات', full: true, placeholder: 'مثال: بازپرداخت قرض', help: 'حداکثر ۶۰ نویسه' }) +
      '<div class="form-field full"><label class="toggle-item" for="f_saveDest"><span class="toggle-copy"><strong>ذخیرهٔ کارت مقصد</strong><small>برای انتقال\u200cهای بعدی در فهرست مقصدهای پرکاربرد قرار گیرد</small></span>' +
      '<span class="switch"><input type="checkbox" id="f_saveDest" name="saveDest"><span></span></span></label></div>' +
      '</div><div class="form-actions"><button class="btn btn-primary" type="submit">' + ic('arrow-right-arrow-left') + 'ادامه و تأیید</button>' +
      '<span class="hint">سقف انتقال روزانه: ' + esc(formatMoneyShort(DAILY_LIMIT)) + ' · کارمزد در حالت آزمایشی صفر است.</span></div></form>';
    var recent = state.transactions.filter(function (t) { return t.type === 'انتقال'; }).slice(0, 4).map(function (t) {
      var c = cardById(t.cardId);
      return { icon: 'arrow-right-arrow-left', title: t.title, meta: persianDate(t.date, 'short') + ' · ' + (c ? c.short : '—'), status: formatMoney(Math.abs(t.amount)) };
    });
    var saved = [
      { icon: 'star', title: 'کارت ملت •• ' + toFa('5673'), meta: 'مقصد ذخیره\u200cشده · بانک ملت', status: 'منتخب' },
      { icon: 'star', title: 'کارت تجارت •• ' + toFa('5670'), meta: 'مقصد ذخیره\u200cشده · بانک تجارت', status: 'منتخب' }
    ];
    return {
      title: 'انتقال وجه · کارت به کارت', subtitle: 'جابجایی پول بین کارت\u200cهای بانکی',
      tools: '<button class="btn btn-sm btn-outline" type="button" data-view="statement">' + ic('receipt') + 'تراکنش\u200cها</button>',
      body: stepsHtml(1) + '<div class="grid-2">' + panel('اطلاعات انتقال', 'arrow-right-arrow-left', form) +
        panel('مقصدهای پرکاربرد', 'star', miniList(saved) + '<div class="divider"></div><h4 style="font-size:12px;margin:0 0 10px">انتقال\u200cهای اخیر</h4>' + miniList(recent)) + '</div>'
    };
  }
  async function submitTransfer(form) {
    clearErrors(form);
    var v = readForm(form);
    var src = cardById(v.src);
    var dest = normDigits(v.dest);
    var amount = validateAmount(form, 'amount');
    var ok = true;
    if (!src) { setFieldError(form, 'src', 'کارت مبدأ معتبر نیست.'); ok = false; }
    if (!luhnValid(dest)) { setFieldError(form, 'dest', 'شمارهٔ کارت مقصد معتبر نیست (۱۶ رقم / Luhn).'); ok = false; }
    else if (src && dest === normDigits(src.number)) { setFieldError(form, 'dest', 'کارت مبدأ و مقصد یکسان است.'); ok = false; }
    if (!amount) ok = false;
    if (src && src.status === 'frozen') { setFieldError(form, 'src', 'کارت مبدأ مسدود است.'); ok = false; }
    if (src && amount > Number(src.balance)) { setFieldError(form, 'amount', 'موجودی کارت مبدأ کافی نیست.'); ok = false; }
    if (!ok) { toast('اطلاعات انتقال ناقص است', 'موارد مشخص\u200cشده را اصلاح کنید.', 'error'); return; }
    confirmDialog({
      title: 'تأیید انتقال وجه', icon: 'arrow-right-arrow-left', tone: 'warning', otp: true, confirmLabel: 'تأیید و انتقال',
      text: 'لطفاً پیش از تأیید نهایی، اطلاعات زیر را بررسی کنید. این عملیات در محیط واقعی غیرقابل برگشت است.',
      rows: [
        ['کارت مبدأ', src.label + ' · ' + src.short + ' •• ' + toFa(last4(src))],
        ['کارت مقصد', formatCard(dest)],
        ['نام گیرنده', v.destName || '—'],
        ['مبلغ', formatMoney(amount) + ' (معادل ' + nf.format(amount) + ' ریال)'],
        ['توضیحات', v.desc || '—'], ['کارمزد', 'رایگان (نسخهٔ آزمایشی)']
      ],
      onConfirm: async function () {
        await apiRequest('/transfers/card-to-card', { src: src.id, dest: dest, amount: amount });
        var ref = deduct(src.id, amount, 'انتقال به کارت •• ' + toFa(dest.slice(-4)), 'arrow-right-arrow-left', 'انتقال');
        finishReceipt({
          title: 'رسید انتقال وجه', subtitle: 'کارت به کارت · انجام شده',
          rows: [
            ['کارت مبدأ', src.label + ' •• ' + toFa(last4(src))], ['کارت مقصد', formatCard(dest)],
            ['نام گیرنده', v.destName || '—'], ['توضیحات', v.desc || '—'],
            ['تاریخ و ساعت', persianDate(new Date()) + ' · ' + clockTime(new Date())],
            ['وضعیت', 'موفق'], ['شماره پیگیری', ref]
          ],
          amount: amount, ref: ref, date: new Date().toISOString()
        });
      }
    });
  }

  /* ------------------------- حواله بانکی ------------------------- */
  function viewRemittance() {
    var d = defaultCard();
    var form = '<form data-form="remittance" id="remittanceForm"><div class="form-grid">' +
      '<div class="form-field"><label for="f_rsrc">حساب / کارت مبدأ <span class="req">*</span></label><select id="f_rsrc" name="src" required>' + cardOptions(d ? d.id : '') + '</select><span class="field-error" data-error-for="src"></span></div>' +
      fld({ name: 'type', label: 'نوع حواله', type: 'select', options: ['پایا', 'ساتنا', 'حوالهٔ داخلی', 'بین\u200cبانکی (ریمیتانس)'], value: 'پایا' }) +
      fld({ name: 'iban', label: 'شناسهٔ شبای مقصد', required: true, dir: 'ltr', placeholder: 'IR00 0000 0000 0000 0000 0000 00', help: 'صحت شبا با الگوریتم mod-97 بررسی می\u200cشود' }) +
      fld({ name: 'receiver', label: 'نام گیرنده', required: true, placeholder: 'نام کامل صاحب حساب' }) +
      fld({ name: 'amount', label: 'مبلغ حواله (ریال)', required: true, dir: 'ltr', keypad: 'amount', type: 'amount' }) +
      fld({ name: 'bank', label: 'بانک مقصد', type: 'select', options: D.BANKS }) +
      fld({ name: 'purpose', label: 'بابت / شرح حواله', full: true, placeholder: 'مثال: تسویهٔ فاکتور شماره ۱۲۳' }) +
      '</div><div class="form-actions"><button class="btn btn-primary" type="submit">' + ic('building-columns') + 'ثبت و تأیید حواله</button>' +
      '<span class="hint">حواله\u200cهای پایا در صف پردازش قرار می\u200cگیرند؛ ساتنا آنی است.</span></div></form>';
    var rows = state.remittances.map(function (r) {
      return { icon: 'building-columns', title: r.to, meta: r.type + ' · ' + persianDate(r.date, 'short') + ' · ' + r.ref, status: formatMoney(r.amount) };
    });
    return {
      title: 'حوالهٔ بانکی', subtitle: 'ثبت حوالهٔ پایا، ساتنا و انتقال بین\u200cبانکی',
      tools: '<span class="chip chip-teal">' + ic('globe') + 'شبا معتبر</span>',
      body: stepsHtml(1) + '<div class="grid-2">' + panel('مشخصات حواله', 'building-columns', form) +
        panel('حواله\u200cهای اخیر', 'clock-rotate-left', miniList(rows)) + '</div>'
    };
  }
  async function submitRemittance(form) {
    clearErrors(form);
    var v = readForm(form);
    var src = cardById(v.src);
    var amount = validateAmount(form, 'amount');
    var ok = true;
    if (!ibanValid(v.iban)) { setFieldError(form, 'iban', 'شبای مقصد معتبر نیست (IR + ۲۴ رقم).'); ok = false; }
    if (!String(v.receiver || '').trim()) { setFieldError(form, 'receiver', 'نام گیرنده الزامی است.'); ok = false; }
    if (!src) { setFieldError(form, 'src', 'حساب مبدأ معتبر نیست.'); ok = false; }
    if (!amount) ok = false;
    if (src && amount > Number(src.balance)) { setFieldError(form, 'amount', 'موجودی حساب مبدأ کافی نیست.'); ok = false; }
    if (!ok) { toast('اطلاعات حواله ناقص است', 'موارد مشخص\u200cشده را اصلاح کنید.', 'error'); return; }
    var iban = String(v.iban).replace(/\s/g, '').toUpperCase();
    confirmDialog({
      title: 'تأیید حوالهٔ بانکی', icon: 'building-columns', otp: true, confirmLabel: 'تأیید و ثبت حواله',
      text: 'حواله پس از تأیید ثبت و شمارهٔ پیگیری صادر می\u200cشود.',
      rows: [
        ['نوع حواله', v.type], ['حساب مبدأ', src.label + ' •• ' + toFa(last4(src))],
        ['شبای مقصد', iban], ['گیرنده', v.receiver], ['بانک مقصد', v.bank],
        ['مبلغ', formatMoney(amount)], ['بابت', v.purpose || '—']
      ],
      onConfirm: async function () {
        await apiRequest('/remittances', { iban: iban, amount: amount, type: v.type });
        var ref = deduct(src.id, amount, 'حوالهٔ ' + v.type + ' به ' + v.receiver, 'building-columns', 'حواله');
        state.remittances.unshift({ id: uid(), to: v.receiver, iban: iban, amount: amount, type: v.type, date: new Date().toISOString(), status: 'انجام شده', ref: ref });
        persist();
        finishReceipt({
          title: 'رسید حوالهٔ بانکی', subtitle: v.type + ' · ثبت شده',
          rows: [['نوع حواله', v.type], ['گیرنده', v.receiver], ['شبای مقصد', iban], ['بانک مقصد', v.bank],
            ['مبلغ', formatMoney(amount)], ['بابت', v.purpose || '—'], ['تاریخ', persianDate(new Date())], ['شماره پیگیری', ref]],
          amount: amount, ref: ref, date: new Date().toISOString()
        });
      }
    });
  }

  /* ------------------------- پرداخت قبض ------------------------- */
  function viewBills() {
    var d = defaultCard();
    var form = '<form data-form="bill" id="billForm"><div class="form-grid">' +
      fld({ name: 'provider', label: 'نوع قبض', type: 'select', options: ['برق', 'آب', 'گاز', 'تلفن ثابت', 'موبایل دائمی', 'عوارض شهرداری'], value: 'برق' }) +
      '<div class="form-field"><label for="f_bcard">کارت پرداخت</label><select id="f_bcard" name="src">' + cardOptions(d ? d.id : '') + '</select></div>' +
      fld({ name: 'billId', label: 'شناسهٔ قبض', required: true, dir: 'ltr', keypad: 'numeric', placeholder: '۱۳ رقم' }) +
      fld({ name: 'payId', label: 'شناسهٔ پرداخت', required: true, dir: 'ltr', keypad: 'numeric', placeholder: '۸ تا ۱۰ رقم' }) +
      fld({ name: 'amount', label: 'مبلغ قبض (ریال)', required: true, dir: 'ltr', keypad: 'amount', type: 'amount' }) +
      fld({ name: 'desc', label: 'یادداشت', placeholder: 'اختیاری' }) +
      '</div><div class="form-actions"><button class="btn btn-primary" type="submit">' + ic('file-invoice') + 'پرداخت قبض</button>' +
      '<span class="hint">پرداخت قبض در این نسخه بدون کارمزد است.</span></div></form>';
    var rows = state.bills.map(function (b) {
      return { icon: 'file-invoice', title: b.title, meta: persianDate(b.date, 'short') + ' · شناسه پرداخت ' + b.payId, status: formatMoney(b.amount) };
    });
    return {
      title: 'پرداخت قبض', subtitle: 'پرداخت قبوض خدماتی با استفاده از شناسهٔ قبض و پرداخت',
      tools: '<button class="btn btn-sm btn-outline" type="button" data-action="fill-demo-bill">' + ic('wand-magic-sparkles') + 'درج اطلاعات نمونه</button>',
      body: stepsHtml(1) + '<div class="grid-2">' + panel('اطلاعات قبض', 'file-invoice', form) +
        panel('قبض\u200cهای پرداخت\u200cشده', 'clock-rotate-left', miniList(rows)) + '</div>'
    };
  }
  async function submitBill(form) {
    clearErrors(form);
    var v = readForm(form);
    var amount = validateAmount(form, 'amount');
    var ok = true;
    if (normDigits(v.billId).length < 8) { setFieldError(form, 'billId', 'شناسهٔ قبض معتبر نیست.'); ok = false; }
    if (normDigits(v.payId).length < 6) { setFieldError(form, 'payId', 'شناسهٔ پرداخت معتبر نیست.'); ok = false; }
    if (!amount) ok = false;
    var src = cardById(v.src);
    if (!src || amount > Number(src.balance)) { setFieldError(form, 'amount', 'موجودی کارت کافی نیست.'); ok = false; }
    if (!ok) { toast('اطلاعات قبض ناقص است', 'موارد مشخص\u200cشده را اصلاح کنید.', 'error'); return; }
    confirmDialog({
      title: 'تأیید پرداخت قبض', icon: 'file-invoice', otp: true, confirmLabel: 'پرداخت',
      text: 'پس از تأیید، مبلغ از کارت انتخابی کسر و رسید صادر می\u200cشود.',
      rows: [['نوع قبض', v.provider], ['شناسهٔ قبض', normDigits(v.billId)], ['شناسهٔ پرداخت', normDigits(v.payId)], ['مبلغ', formatMoney(amount)], ['کارت', src.label + ' •• ' + toFa(last4(src))]],
      onConfirm: async function () {
        await apiRequest('/bills/pay', { billId: normDigits(v.billId), amount: amount });
        var ref = deduct(src.id, amount, 'پرداخت قبض ' + v.provider, 'file-invoice', 'قبض');
        state.bills.unshift({ id: uid(), title: 'قبض ' + v.provider, billId: normDigits(v.billId), payId: normDigits(v.payId), amount: amount, date: new Date().toISOString() });
        persist();
        finishReceipt({
          title: 'رسید پرداخت قبض', subtitle: v.provider + ' · پرداخت شده',
          rows: [['نوع قبض', v.provider], ['شناسهٔ قبض', normDigits(v.billId)], ['شناسهٔ پرداخت', normDigits(v.payId)],
            ['مبلغ', formatMoney(amount)], ['تاریخ', persianDate(new Date())], ['شماره پیگیری', ref]],
          amount: amount, ref: ref, date: new Date().toISOString()
        });
      }
    });
  }

  /* ------------------------- شارژ موبایل ------------------------- */
  function viewTopup() {
    var d = defaultCard();
    var form = '<form data-form="topup" id="topupForm"><div class="form-grid">' +
      fld({ name: 'phone', label: 'شمارهٔ موبایل', required: true, type: 'tel', dir: 'ltr', keypad: 'numeric', placeholder: '09123456789' }) +
      fld({ name: 'operator', label: 'اپراتور', type: 'select', options: ['همراه اول', 'ایرانسل', 'رایتل', 'شاتل موبایل'], value: 'همراه اول' }) +
      fld({ name: 'amount', label: 'مبلغ شارژ (ریال)', required: true, dir: 'ltr', keypad: 'amount', type: 'amount', value: '200000' }) +
      '<div class="form-field"><label for="f_tcard">کارت پرداخت</label><select id="f_tcard" name="src">' + cardOptions(d ? d.id : '') + '</select></div>' +
      fld({ name: 'type', label: 'نوع شارژ', type: 'select', options: ['شارژ مستقیم', 'کارت شارژ', 'بستهٔ ترکیبی'], value: 'شارژ مستقیم' }) +
      '<div class="form-field"><label class="toggle-item" for="f_invoice"><span class="toggle-copy"><strong>ارسال رسید پیامکی</strong><small>رسید به شمارهٔ واردشده ارسال گردد</small></span>' +
      '<span class="switch"><input type="checkbox" id="f_invoice" name="sms" checked><span></span></span></label></div>' +
      '</div><div class="form-actions"><button class="btn btn-primary" type="submit">' + ic('mobile-screen-button') + 'خرید شارژ</button></div></form>';
    var rows = state.topups.map(function (p) {
      return { icon: 'mobile-screen-button', title: p.operator + ' · ' + p.phone, meta: persianDate(p.date, 'short'), status: formatMoney(p.amount) };
    });
    return {
      title: 'شارژ موبایل', subtitle: 'خرید شارژ مستقیم برای همهٔ اپراتورها',
      tools: '<span class="chip chip-success">' + ic('bolt') + 'فعال\u200cسازی آنی</span>',
      body: stepsHtml(1) + '<div class="grid-2">' + panel('اطلاعات شارژ', 'mobile-screen-button', form) +
        panel('شارژهای اخیر', 'clock-rotate-left', miniList(rows)) + '</div>'
    };
  }
  async function submitTopup(form) {
    clearErrors(form);
    var v = readForm(form);
    var amount = validateAmount(form, 'amount');
    var phone = normDigits(v.phone);
    var ok = true;
    if (!/^09\d{9}$/.test(phone)) { setFieldError(form, 'phone', 'شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ آغاز شود.'); ok = false; }
    if (!amount) ok = false;
    var src = cardById(v.src);
    if (!src || amount > Number(src.balance)) { setFieldError(form, 'amount', 'موجودی کارت کافی نیست.'); ok = false; }
    if (!ok) { toast('اطلاعات شارژ ناقص است', 'موارد مشخص\u200cشده را اصلاح کنید.', 'error'); return; }
    confirmDialog({
      title: 'تأیید خرید شارژ', icon: 'mobile-screen-button', otp: true, confirmLabel: 'خرید شارژ',
      text: 'شارژ بلافاصله پس از تأیید روی شمارهٔ موردنظر اعمال می\u200cشود.',
      rows: [['شماره', toFa(phone)], ['اپراتور', v.operator], ['نوع', v.type], ['مبلغ', formatMoney(amount)], ['کارت', src.label + ' •• ' + toFa(last4(src))]],
      onConfirm: async function () {
        await apiRequest('/topup', { phone: phone, amount: amount });
        var ref = deduct(src.id, amount, 'شارژ ' + v.operator + ' · ' + toFa(phone), 'mobile-screen-button', 'شارژ');
        state.topups.unshift({ id: uid(), phone: phone, operator: v.operator, amount: amount, date: new Date().toISOString() });
        persist();
        finishReceipt({
          title: 'رسید خرید شارژ', subtitle: v.operator + ' · شارژ انجام شد',
          rows: [['شمارهٔ موبایل', toFa(phone)], ['اپراتور', v.operator], ['نوع شارژ', v.type],
            ['مبلغ', formatMoney(amount)], ['تاریخ', persianDate(new Date())], ['شماره پیگیری', ref]],
          amount: amount, ref: ref, date: new Date().toISOString()
        });
      }
    });
  }

  /* ------------------------- عملیات\u200cهای عمومی (سرویس\u200cها) ------------------------- */
  function serviceFields(cfg) {
    return cfg.fields.map(function (f) {
      var o = Object.assign({}, f);
      if (f.type === 'cards') o.value = defaultCard() ? defaultCard().id : '';
      return o;
    });
  }
  function viewService(key) {
    var cfg = D.SERVICE_FORMS[key];
    if (!cfg) return { title: 'عملیات یافت نشد', subtitle: '', body: '<div class="empty-state">' + ic('circle-question') + '<p>این عملیات تعریف نشده است</p></div>' };
    state.session.serviceKey = key;
    var form = '<form data-form="service" id="serviceForm" data-key="' + esc(key) + '">' + formGrid(serviceFields(cfg)) +
      '<div class="form-actions"><button class="btn ' + (cfg.tone === 'danger' ? 'btn-danger' : 'btn-primary') + '" type="submit">' + ic(cfg.icon) + esc(cfg.submit) + '</button>' +
      '<span class="hint">' + esc(cfg.tone === 'danger' ? 'این عملیات حساس است و نیاز به کد تأیید دارد.' : 'نتیجه به\u200cصورت رسید قابل چاپ نمایش داده می\u200cشود.') + '</span></div></form>';
    return {
      title: cfg.title, subtitle: cfg.subtitle,
      tools: '<button class="btn btn-sm btn-outline" type="button" data-view="operations">' + ic('table-cells') + 'همهٔ عملیات\u200cها</button>',
      body: '<div class="panel"><p class="hint" style="font-size:12.5px;margin:0">' + esc(cfg.desc) + '</p></div>' +
        '<div class="grid-2">' + panel('اطلاعات درخواست', cfg.icon, form) +
        panel(cfg.demoTitle, 'clock-rotate-left', miniList(cfg.demo.map(function (r) { return Object.assign({ tone: 'chip-primary' }, r); }))) + '</div>'
    };
  }
  async function submitService(form) {
    var key = form.dataset.key;
    var cfg = D.SERVICE_FORMS[key];
    clearErrors(form);
    var v = readForm(form);
    var ok = true;
    cfg.fields.forEach(function (f) {
      if (f.required && !String(v[f.name] || '').trim()) { setFieldError(form, f.name, 'این فیلد الزامی است.'); ok = false; }
    });
    if (key === 'sheba' && v.iban && !ibanValid(v.iban)) { setFieldError(form, 'iban', 'شناسهٔ شبا معتبر نیست (mod-97).'); ok = false; }
    if (key === 'internet' && v.phone && !/^09\d{9}$/.test(normDigits(v.phone))) { setFieldError(form, 'phone', 'شمارهٔ موبایل معتبر نیست.'); ok = false; }
    if (key === 'change-pin') {
      var pin = normDigits(v.newPin);
      if (pin.length < 4 || pin.length > 6) { setFieldError(form, 'newPin', 'رمز باید ۴ تا ۶ رقم باشد.'); ok = false; }
      if (pin !== normDigits(v.confirmPin)) { setFieldError(form, 'confirmPin', 'تکرار رمز یکسان نیست.'); ok = false; }
    }
    if (key === 'loan' || key === 'internet') {
      var amount = Number(normDigits(v.amount)) || (key === 'internet' ? 900000 : 0);
      if (amount < 10000) { setFieldError(form, 'amount', 'مبلغ معتبر نیست.'); ok = false; }
      var src = cardById(v.cardId) || defaultCard();
      if (!src || amount > Number(src.balance)) { setFieldError(form, 'amount', 'موجودی کارت کافی نیست.'); ok = false; }
    }
    if (!ok) { toast('اطلاعات درخواست ناقص است', 'موارد مشخص\u200cشده را اصلاح کنید.', 'error'); return; }
    var rows = cfg.fields.map(function (f) {
      var val = v[f.name];
      if (f.type === 'cards') { var c = cardById(val); val = c ? c.label + ' •• ' + toFa(last4(c)) : '—'; }
      if (f.name === 'newPin' || f.name === 'confirmPin') val = '••••';
      if (f.type === 'amount') val = formatMoney(Number(normDigits(val)) || 0);
      return [f.label.replace(/ \*$/, ''), val || '—'];
    });
    confirmDialog({
      title: 'تأیید ' + cfg.title, icon: cfg.icon, tone: cfg.tone, otp: !!cfg.otp,
      confirmLabel: cfg.submit, text: 'جزئیات درخواست را بررسی و سپس تأیید کنید.', rows: rows,
      onConfirm: async function () {
        await apiRequest('/services/' + key, v);
        applyService(key, v, rows);
      }
    });
  }
  function applyService(key, v, rows) {
    var ref = refCode('SRV');
    if (key === 'block-card') {
      var c = cardById(v.cardId);
      if (c) { c.status = 'frozen'; addNotification('ban', '#df3670', 'کارت مسدود شد', 'کارت «' + c.label + '» به دلیل «' + v.reason + '» مسدود شد.'); }
    } else if (key === 'internet' || key === 'loan') {
      var amount = Number(normDigits(v.amount)) || (key === 'internet' ? 900000 : 0);
      var src = cardById(v.cardId) || defaultCard();
      ref = deduct(src.id, amount, key === 'internet' ? 'خرید بستهٔ اینترنت ' + v.package : 'پرداخت ' + v.loan, key === 'internet' ? 'wifi' : 'coins', key === 'internet' ? 'خرید' : 'قسط');
    } else {
      addNotification('circle-check', '#148a54', D.SERVICE_FORMS[key].title + ' انجام شد', 'درخواست با شمارهٔ پیگیری ' + ref + ' ثبت گردید.');
    }
    if (key === 'sheba') {
      var s = String(v.iban).replace(/\s/g, '').toUpperCase();
      rows = rows.concat([['اعتبار شبا', 'معتبر (mod-97)'], ['کد بانک', s.slice(4, 7)], ['صاحب حساب (نمونه)', 'علی محمدی']]);
    }
    persist();
    finishReceipt({
      title: 'رسید ' + D.SERVICE_FORMS[key].title, subtitle: 'درخواست ثبت و پردازش شد',
      rows: rows.concat([['تاریخ', persianDate(new Date())], ['وضعیت', 'انجام شده'], ['شماره پیگیری', ref]]),
      ref: ref, date: new Date().toISOString(), amount: null
    });
  }

  /* ------------------------- رسید ------------------------- */
  function viewReceipt() {
    var r = state.session.receipt;
    if (!r) return {
      title: 'رسید عملیات', subtitle: '', tools: '',
      body: '<div class="empty-state">' + ic('receipt') + '<p>رسیدی برای نمایش وجود ندارد</p><div class="form-actions" style="justify-content:center"><button class="btn btn-primary" type="button" data-view="dashboard">بازگشت به داشبورد</button></div></div>'
    };
    var rows = r.rows.map(function (x) { return '<div class="receipt-row"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join('');
    return {
      title: r.title, subtitle: r.subtitle,
      tools: '<button class="btn btn-sm btn-outline" type="button" data-action="print-receipt">' + ic('print') + 'چاپ رسید</button>',
      body: stepsHtml(3) + '<div class="receipt"><div class="receipt-head"><div class="success-mark">' + ic('circle-check') + '</div>' +
        '<h3>عملیات با موفقیت انجام شد</h3><p>' + esc(r.subtitle) + ' · ' + esc(persianDate(r.date)) + '</p></div>' +
        rows + (r.amount ? '<div class="receipt-total"><span>مبلغ کل</span><strong>' + esc(formatMoney(r.amount)) + '</strong></div>' : '') +
        '<div class="receipt-actions"><button class="btn btn-outline" type="button" data-action="copy-ref" data-ref="' + esc(r.ref) + '">' + ic('copy') + 'کپی شماره پیگیری</button>' +
        '<button class="btn btn-outline" type="button" data-action="print-receipt">' + ic('print') + 'چاپ</button>' +
        '<button class="btn btn-primary" type="button" data-view="dashboard">' + ic('house') + 'بازگشت به داشبورد</button></div></div>'
    };
  }
  function printReceipt() {
    var r = state.session.receipt;
    if (!r) { toast('رسیدی وجود ندارد', '', 'warning'); return; }
    var rows = r.rows.map(function (x) { return '<div class="row-line"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join('');
    var area = $('#printArea');
    area.innerHTML = '<div class="receipt-print"><h2>' + esc(r.title) + '</h2><p style="text-align:center">' + esc(r.subtitle) + ' · ' + esc(persianDate(r.date)) + '</p>' + rows +
      (r.amount ? '<div class="row-line"><span>مبلغ کل</span><strong>' + esc(formatMoney(r.amount)) + '</strong></div>' : '') +
      '<div class="foot">این رسید مربوط به نسخهٔ آزمایشی پیشخوان بانکی است و فاقد اعتبار بانکی می\u200cباشد.</div></div>';
    area.setAttribute('aria-hidden', 'false');
    try { window.print(); } catch (e) { toast('چاپ در این محیط پشتیبانی نمی\u200cشود', '', 'warning'); }
    setTimeout(function () { area.setAttribute('aria-hidden', 'true'); }, 500);
  }

  /* ------------------------- تنظیمات ------------------------- */
  function toggleItem(title, desc, path, checked) {
    return '<label class="toggle-item"><span class="toggle-copy"><strong>' + esc(title) + '</strong><small>' + esc(desc) + '</small></span>' +
      '<span class="switch"><input type="checkbox" data-toggle="' + esc(path) + '"' + (checked ? ' checked' : '') + '><span></span></span></label>';
  }
  function segmented(title, desc, path, options) {
    var current = getPath(state, path);
    return '<div class="form-field"><label>' + esc(title) + '</label><div class="segmented">' +
      options.map(function (o) {
        return '<button type="button" data-action="set-choice" data-path="' + esc(path) + '" data-value="' + esc(o[0]) + '" class="' + (String(current) === String(o[0]) ? 'active' : '') + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div><span class="field-help">' + esc(desc) + '</span></div>';
  }
  function apiField(label, path, opts) {
    opts = opts || {};
    return '<div class="form-field"><label for="s_' + esc(path.replace(/\./g, '_')) + '">' + esc(label) + '</label>' +
      (opts.type === 'select'
        ? '<select id="s_' + esc(path.replace(/\./g, '_')) + '" data-setting="' + esc(path) + '">' +
        opts.options.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(getPath(state, path)) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'
        : '<div class="input-wrap"><input id="s_' + esc(path.replace(/\./g, '_')) + '" type="' + (opts.type || 'text') + '"' +
        (opts.dir ? ' dir="' + opts.dir + '"' : '') + ' data-setting="' + esc(path) + '" value="' + esc(getPath(state, path)) + '" placeholder="' + esc(opts.placeholder || '') + '">' +
        (opts.type === 'password' ? '<button type="button" data-action="toggle-password" aria-label="نمایش / پنهان کردن">' + ic('eye') + '</button>' : '') + '</div>') +
      (opts.help ? '<span class="field-help">' + esc(opts.help) + '</span>' : '') + '</div>';
  }
  function viewSettings() {
    var a = state.settings.api, p = state.settings.privacy, g = state.settings.general;
    var status = state.session.apiStatus;
    var statusHtml = '<div class="api-status ' + (status ? (status.ok ? 'ok' : 'error') : '') + '" id="apiStatus">' +
      ic(status ? (status.ok ? 'circle-check' : 'circle-xmark') : 'circle-info') +
      '<div><strong>' + (status ? (status.ok ? 'اتصال برقرار است' : 'اتصال ناموفق') : 'وضعیت اتصال بررسی نشده') + '</strong>' +
      '<small>' + esc(status ? status.message : 'برای بررسی پیکربندی، دکمهٔ «تست اتصال» را بزنید.') + '</small></div></div>';
    var apiCard = '<div class="settings-card wide"><h3>' + ic('plug') + 'اتصال به API بانک</h3>' +
      '<p class="hint">نشانی سرویس، کلید دسترسی و شناسهٔ مشتری را وارد کنید. تا زمانی که حالت «آزمایشی» فعال است، هیچ درخواست شبکه\u200cای ارسال نمی\u200cشود.</p>' +
      statusHtml + '<div class="form-grid">' +
      apiField('نشانی پایهٔ API', 'settings.api.baseUrl', { dir: 'ltr', placeholder: 'https://api.bank.ir/v1' }) +
      apiField('نسخهٔ API', 'settings.api.version', { type: 'select', options: [['v1', 'نسخه ۱'], ['v2', 'نسخه ۲'], ['v3', 'نسخه ۳']] }) +
      apiField('شناسهٔ مشتری (Client ID)', 'settings.api.clientId', { dir: 'ltr' }) +
      apiField('کد بانک / شعبه', 'settings.api.bankCode', { dir: 'ltr' }) +
      apiField('کلید دسترسی / توکن', 'settings.api.token', { type: 'password', dir: 'ltr', help: 'در صورت غیرفعال بودن «ذخیرهٔ توکن»، فقط تا پایان نشست در حافظه می\u200cماند.' }) +
      apiField('زمان انتظار (ثانیه)', 'settings.api.timeout', { type: 'number', dir: 'ltr' }) +
      apiField('حالت اتصال', 'settings.api.mode', { type: 'select', options: [['sandbox', 'آزمایشی (شبیه\u200cساز محلی)'], ['live', 'زنده (ارسال درخواست واقعی)']] }) +
      apiField('هدر سفارشی', 'settings.api.customHeader', { dir: 'ltr', placeholder: 'X-Tenant: kiosk-01' }) +
      '</div><div class="toggle-list" style="margin-top:14px">' +
      toggleItem('ذخیرهٔ توکن دسترسی', 'کلید API در حافظهٔ محلی بماند (برای کیوسک\u200cهای اختصاصی توصیه می\u200cشود).', 'settings.api.saveToken', a.saveToken) +
      toggleItem('بررسی گواهی SSL', 'فقط اتصالات HTTPS معتبر پذیرفته شوند.', 'settings.api.ssl', a.ssl) +
      '</div><div class="form-actions"><button class="btn btn-outline" type="button" data-action="test-api">' + ic('plug-circle-check') + 'تست اتصال</button>' +
      '<button class="btn btn-primary" type="submit">' + ic('floppy-disk') + 'ذخیرهٔ تنظیمات</button>' +
      '<span class="hint">تغییرات به\u200cصورت خودکار نیز ذخیره می\u200cشوند.</span></div></div>';

    var privacyCard = '<div class="settings-card"><h3>' + ic('shield-halved') + 'ذخیرهٔ اطلاعات مهم</h3>' +
      '<p class="hint">تعیین کنید کدام داده\u200cهای حساس کارت\u200cها و تراکنش\u200cها در حافظهٔ محلی دستگاه باقی بمانند. با خاموش کردن هر گزینه، هنگام ذخیره\u200cسازی آن داده حذف می\u200cشود.</p>' +
      '<div class="toggle-list">' +
      toggleItem('ذخیرهٔ تاریخ انقضای کارت', 'ماه / سال انقضا همراه کارت حفظ شود.', 'settings.privacy.saveExpiry', p.saveExpiry) +
      toggleItem('ذخیرهٔ شمارهٔ کامل کارت', 'در حالت خاموش فقط ۴ رقم آخر ذخیره خواهد شد.', 'settings.privacy.saveFullPan', p.saveFullPan) +
      toggleItem('ذخیرهٔ CVV2', 'به دلایل امنیتی به\u200cصورت پیشفرض غیرفعال است.', 'settings.privacy.saveCvv', p.saveCvv) +
      toggleItem('پوشاندن اطلاعات حساس', 'نمایش شمارهٔ کارت به\u200cصورت ماسک\u200cشده تا زمان کلیک «نمایش».', 'settings.privacy.maskCard', p.maskCard) +
      toggleItem('ذخیرهٔ تاریخچهٔ تراکنش\u200cها', 'گردش حساب و رسیدها بین نشست\u200cها حفظ شوند.', 'settings.privacy.saveHistory', p.saveHistory) +
      '</div><div class="divider"></div>' + segmented('واحد نمایش مبالغ', 'مبالغ پایه به ریال ذخیره می\u200cشوند.', 'settings.general.currency', [['toman', 'تومان'], ['rial', 'ریال']]) + '</div>';

    var displayCard = '<div class="settings-card"><h3>' + ic('display') + 'نمایش و کیوسک لمسی</h3>' +
      '<p class="hint">تنظیمات مناسب نمایشگرهای لمسی، کیوسک\u200cهای شعب و تبلت\u200cها.</p>' +
      '<div class="form-grid">' +
      segmented('تم رابط', 'روشن، تاریک یا تابع سیستم\u200cعامل', 'settings.general.theme', [['light', 'روشن'], ['dark', 'تاریک'], ['auto', 'خودکار']]) +
      segmented('اندازهٔ قلم', 'خوانایی بیشتر روی نمایشگرهای بزرگ', 'settings.general.fontSize', [['small', 'کوچک'], ['normal', 'متوسط'], ['large', 'بزرگ']]) +
      segmented('خروج خودکار', 'بستن نشست پس از عدم فعالیت', 'settings.general.autoLogout', [['0', 'غیرفعال'], ['5', '۵ دقیقه'], ['10', '۱۰ دقیقه'], ['15', '۱۵ دقیقه'], ['30', '۳۰ دقیقه']]) +
      '</div><div class="toggle-list" style="margin-top:14px">' +
      toggleItem('حالت کیوسک', 'دکمه\u200cها، فونت\u200cها و فاصله\u200cها برای لمس بزرگ می\u200cشوند.', 'settings.general.kiosk', g.kiosk) +
      toggleItem('صفحه\u200cکلید لمسی عددی', 'هنگام focus فیلدهای عددی، صفحه\u200cکلید روی صفحه ظاهر شود.', 'settings.general.touchKeypad', g.touchKeypad) +
      toggleItem('نمایش اعلان\u200cها', 'رویدادهای بانکی در پنل کناری نمایش داده شوند.', 'settings.general.notifications', g.notifications) +
      toggleItem('چیدمان فشرده', 'کاهش فاصله\u200cها برای نمایشگرهای کوچک.', 'settings.general.compact', g.compact) +
      '</div><div class="form-actions"><button class="btn btn-outline" type="button" data-action="fullscreen">' + ic('expand') + 'تمام\u200cصفحه</button>' +
      '<button class="btn btn-outline" type="button" data-action="lock">' + ic('lock') + 'قفل فوری صفحه</button></div></div>';

    var dataCard = '<div class="settings-card wide"><h3>' + ic('database') + 'داده\u200cها و پشتیبان\u200cگیری</h3>' +
      '<p class="hint">تمام اطلاعات به\u200cصورت محلی (localStorage) و بدون ارسال به سرور ذخیره می\u200cشوند. فایل پشتیبان شامل تنظیمات، کارت\u200cها و تراکنش\u200cهای نمایشی است.</p>' +
      '<div class="data-actions"><button class="btn btn-outline" type="button" data-action="export-json">' + ic('download') + 'دانلود پشتیبان JSON</button>' +
      '<button class="btn btn-outline" type="button" data-action="export-csv">' + ic('file-csv') + 'خروجی تراکنش\u200cها CSV</button>' +
      '<label class="btn btn-outline" style="cursor:pointer">' + ic('file-import') + 'بازیابی پشتیبان<input type="file" id="importFile" accept="application/json,.json" hidden></label>' +
      '<button class="btn btn-outline" type="button" data-action="print-statement">' + ic('print') + 'چاپ گردش حساب</button></div>' +
      '<div class="divider"></div><div class="between"><div><strong style="font-size:13px">بازگردانی داده\u200cهای نمایشی</strong><p class="hint" style="margin:2px 0 0">همهٔ تغییرات و کارت\u200cهای تعریف\u200cشده حذف و تنظیمات به حالت اولیه بازمی\u200cگردند.</p></div>' +
      '<button class="btn btn-danger" type="button" data-action="reset-data">' + ic('trash-can') + 'بازنشانی کامل</button></div></div>';

    var aboutCard = '<div class="settings-card wide"><h3>' + ic('circle-info') + 'دربارهٔ این پیشخوان</h3>' +
      '<div class="info-grid"><div class="info-tile"><small>نسخهٔ رابط</small><strong class="ltr" dir="ltr">1.0.0</strong></div>' +
      '<div class="info-tile"><small>فونت</small><strong>وزیرمتن (Variable)</strong></div>' +
      '<div class="info-tile"><small>آیکون\u200cها</small><strong>فونت آیکون داخلی</strong></div>' +
      '<div class="info-tile"><small>وابستگی خارجی</small><strong>هیچ (HTML/CSS/JS خالص)</strong></div></div>' +
      '<p class="hint">این پروژه یک قالب نمایشی (Template) است؛ تمام تراکنش\u200cها، کارت\u200cها و پاسخ\u200cهای API ساختگی می\u200cباشند و هیچ ارتباطی با سامانهٔ واقعی بانک ندارند.</p></div>';

    return {
      title: 'تنظیمات', subtitle: 'اتصال به API، حریم خصوصی، کیوسک و داده\u200cها',
      tools: '<span class="chip chip-primary">' + ic('shield-halved') + 'ذخیرهٔ محلی</span>',
      body: '<form data-form="settings" id="settingsForm" class="settings-grid">' + apiCard + privacyCard + displayCard + dataCard + aboutCard + '</form>'
    };
  }
  function readSettingsForm() {
    $$('[data-setting]').forEach(function (el) {
      var v = el.type === 'number' ? Number(el.value) : el.value;
      setPath(state, el.dataset.setting, v);
      if (el.dataset.setting === 'settings.api.token') state.session.apiToken = el.value;
    });
    $$('[data-toggle]').forEach(function (el) { setPath(state, el.dataset.toggle, el.checked); });
    applyRootClasses();
  }
  function submitSettings(form) {
    readSettingsForm();
    persist();
    toast('تنظیمات ذخیره شد', 'پیکربندی جدید اعمال گردید.', 'success');
    addNotification('gear', '#4f3ff0', 'تنظیمات به\u200cروزرسانی شد', 'پیکربندی API و حریم خصوصی ذخیره گردید.');
    persist();
  }

  /* ------------------------- پروفایل ------------------------- */
  function viewProfile() {
    var p = state.profile;
    var avatar = p.avatar || './assets/avatar.svg';
    var hero = '<div class="profile-hero"><img class="avatar-xl" src="' + esc(avatar) + '" alt="تصویر نمایه">' +
      '<div><h3>' + esc(p.fullName) + '</h3><p>عضو از ' + esc(p.joined) + ' · سطح ' + esc(p.level) + ' · احراز هویت تأیید شده</p>' +
      '<span class="chip chip-success">' + ic('circle-check') + 'حساب فعال</span> <span class="chip chip-primary">' + ic('star') + 'مشتری ویژه</span></div>' +
      '<div style="margin-inline-start:auto"><button class="btn btn-sm btn-outline" type="button" data-action="avatar-reset">' + ic('arrows-rotate') + 'تصویر پیشفرض</button></div></div>';
    var form = '<form data-form="profile" id="profileForm"><div class="form-grid">' +
      fld({ name: 'fullName', label: 'نام و نام خانوادگی', required: true, value: p.fullName }) +
      fld({ name: 'phone', label: 'شمارهٔ موبایل', required: true, dir: 'ltr', keypad: 'numeric', value: p.phone }) +
      fld({ name: 'email', label: 'رایانامه', dir: 'ltr', value: p.email }) +
      fld({ name: 'nationalId', label: 'کد ملی', dir: 'ltr', keypad: 'numeric', value: p.nationalId }) +
      fld({ name: 'city', label: 'شهر', value: p.city }) +
      fld({ name: 'birthDate', label: 'تاریخ تولد', dir: 'ltr', value: p.birthDate }) +
      '<div class="form-field full"><label for="f_avatar">تصویر نمایه</label><input id="f_avatar" type="file" accept="image/*"><span class="field-help">تصویر به\u200cصورت محلی و فقط روی همین دستگاه ذخیره می\u200cشود.</span></div>' +
      '</div><div class="form-actions"><button class="btn btn-primary" type="submit">' + ic('floppy-disk') + 'ذخیرهٔ پروفایل</button></div></form>';
    var timeline = [
      { icon: 'circle-check', text: 'ورود موفق از کیوسک شعبهٔ مرکزی', time: 'امروز' },
      { icon: 'key', text: 'تغییر رمز دوم کارت ملی', time: '۳ روز پیش' },
      { icon: 'credit-card', text: 'افزودن کارت پاسارگاد', time: '۱ هفته پیش' },
      { icon: 'shield-halved', text: 'تأیید مدارک احراز هویت', time: '۱۴۰۱/۰۲/۱۸' }
    ];
    return {
      title: 'صفحهٔ پروفایل', subtitle: 'اطلاعات کاربری، امنیت و فعالیت\u200cهای اخیر',
      tools: '<button class="btn btn-sm btn-outline" type="button" data-view="settings">' + ic('gear') + 'تنظیمات حساب</button>',
      body: hero + '<div class="grid-2">' + panel('ویرایش اطلاعات', 'user-pen', form) +
        panel('امنیت حساب', 'shield-halved', '<div class="between"><strong style="font-size:13px">سطح امنیتی: خیلی خوب</strong><span class="chip chip-success">۹۲٪</span></div>' +
          '<div class="security-meter"><span style="width:92%"></span></div>' +
          '<p class="hint">رمز دوم، احراز هویت دو مرحله\u200cای و اعلان\u200cهای ورود فعال هستند.</p><div class="divider"></div>' +
          '<div class="timeline">' + timeline.map(function (t) { return '<div class="timeline-row">' + ic(t.icon) + '<span>' + esc(t.text) + '</span><small>' + esc(t.time) + '</small></div>'; }).join('') + '</div>') + '</div>' +
        '<div class="section-title">' + ic('wand-magic-sparkles') + 'دسترسی\u200cهای سریع</div><div class="panel"><div class="row">' +
        '<button class="btn btn-sm btn-outline" type="button" data-action="lock">' + ic('lock') + 'قفل صفحه</button>' +
        '<button class="btn btn-sm btn-outline" type="button" data-view="cards">' + ic('credit-card') + 'کارت\u200cهای من</button>' +
        '<button class="btn btn-sm btn-outline" type="button" data-view="settings">' + ic('plug') + 'اتصال API</button>' +
        '<button class="btn btn-sm btn-danger" type="button" data-action="logout">' + ic('arrow-right-from-bracket') + 'خروج</button></div></div>'
    };
  }
  function submitProfile(form) {
    var v = readForm(form);
    clearErrors(form);
    if (!String(v.fullName || '').trim()) { setFieldError(form, 'fullName', 'نام الزامی است.'); return; }
    if (!/^09\d{9}$/.test(normDigits(v.phone))) { setFieldError(form, 'phone', 'شمارهٔ موبایل معتبر نیست.'); return; }
    state.profile = Object.assign(state.profile, {
      fullName: String(v.fullName).trim(), phone: normDigits(v.phone), email: String(v.email || '').trim(),
      nationalId: String(v.nationalId || '').trim(), city: String(v.city || '').trim(), birthDate: String(v.birthDate || '').trim()
    });
    var file = $('#f_avatar', form);
    if (file && file.files && file.files[0]) {
      try {
        var reader = new FileReader();
        reader.onload = function (e) { state.profile.avatar = e.target.result; persist(); render(); };
        reader.readAsDataURL(file.files[0]);
      } catch (e) { /* FileReader در برخی محیط\u200cها موجود نیست */ }
    }
    persist(); render();
    toast('پروفایل به\u200cروزرسانی شد', state.profile.fullName, 'success');
  }

  /* ------------------------- پشتیبانی ------------------------- */
  function viewSupport() {
    var faq = D.FAQ.map(function (f) { return '<details class="faq-item"><summary>' + ic('circle-question') + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>'; }).join('');
    var contacts = [
      { icon: 'phone', title: 'مرکز تماس', meta: '۱۹۹۵ · پاسخگویی ۲۴ ساعته' },
      { icon: 'envelope', title: 'رایانامه پشتیبانی', meta: 'support@bank-demo.ir' },
      { icon: 'location-dot', title: 'نزدیک\u200cترین شعبه', meta: 'تهران، خیابان ولی\u200cعصر، شعبهٔ مرکزی' },
      { icon: 'headset', title: 'پشتیبانی کیوسک', meta: 'کد دستگاه: KIOSK-0001' }
    ];
    var report = '<form data-form="support" id="supportForm">' + formGrid([
      { name: 'subject', label: 'موضوع', type: 'select', options: ['خطا در عملیات', 'پیشنهاد بهبود', 'مشکل نمایش / لمس', 'سایر موارد'] },
      { name: 'priority', label: 'اولویت', type: 'select', options: ['عادی', 'مهم', 'فوری'] },
      { name: 'text', label: 'شرح مشکل', type: 'textarea', required: true, full: true, placeholder: 'توضیحات خود را بنویسید…' }
    ]) + '<div class="form-actions"><button class="btn btn-primary" type="submit">' + ic('paper-plane') + 'ارسال گزارش</button></div></form>';
    return {
      title: 'پشتیبانی و راهنما', subtitle: 'پرسش\u200cهای متداول، ارتباط با پشتیبانی و گزارش مشکل',
      tools: '<span class="chip chip-success">' + ic('headset') + 'آنلاین</span>',
      body: '<div class="grid-2">' + panel('پرسش\u200cهای متداول', 'circle-question', faq) +
        '<div class="stack">' + panel('راه\u200cهای ارتباطی', 'headset', miniList(contacts)) + panel('گزارش مشکل', 'paper-plane', report) + '</div></div>'
    };
  }
  function submitSupport(form) {
    var v = readForm(form);
    clearErrors(form);
    if (!String(v.text || '').trim()) { setFieldError(form, 'text', 'شرح مشکل الزامی است.'); return; }
    addNotification('headset', '#096c86', 'گزارش پشتیبانی ثبت شد', v.subject + ' · ' + v.priority);
    persist(); renderNotifications(); form.reset();
    toast('گزارش ارسال شد', 'شماره پیگیری: ' + refCode('TKT'), 'success');
  }

  /* ------------------------- خروجی / ورودی داده ------------------------- */
  function download(name, content, mime) {
    try {
      var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) { } }, 1000);
      toast('فایل آماده شد', name, 'success');
    } catch (e) { toast('امکان دانلود فراهم نیست', String(e && e.message || e), 'error'); }
  }
  function exportJson() {
    var copy = clone(state); delete copy.session;
    download('bank-dashboard-backup.json', JSON.stringify(copy, null, 2), 'application/json;charset=utf-8');
  }
  function exportCsv() {
    var rows = [['شرح', 'نوع', 'تاریخ', 'کارت', 'مبلغ (ریال)', 'وضعیت', 'شماره پیگیری']].concat(
      state.transactions.map(function (t) {
        var c = cardById(t.cardId);
        return [t.title, t.type, persianDate(t.date, 'short'), c ? c.short + ' ' + last4(c) : '', t.amount, t.status, t.ref];
      })
    );
    var csv = '\uFEFF' + rows.map(function (r) { return r.map(function (x) { return '"' + String(x).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    download('transactions.csv', csv, 'text/csv;charset=utf-8');
  }
  function importJson(file) {
    if (!file) return;
    try {
      var reader = new FileReader();
      reader.onload = function (e) {
        var obj = JSON.parse(e.target.result);
        if (!obj || !Array.isArray(obj.cards)) throw new Error('ساختار فایل معتبر نیست.');
        state = merge(defaultState(), obj);
        state.session = newSession();
        persist(); applyRootClasses(); render();
        toast('پشتیبان بازیابی شد', 'کارت\u200cها و تنظیمات بازگردانی شدند.', 'success');
      };
      reader.readAsText(file);
    } catch (e) { toast('خطا در بازیابی', String(e && e.message || e), 'error'); }
  }
  function printStatement() {
    var rows = filteredTransactions().slice(0, 40).map(function (t) {
      return '<div class="row-line"><span>' + esc(persianDate(t.date, 'short')) + ' · ' + esc(t.title) + '</span><strong>' + esc(formatMoney(t.amount)) + '</strong></div>';
    }).join('');
    var area = $('#printArea');
    area.innerHTML = '<div class="receipt-print"><h2>صورتحساب گردش حساب</h2><p style="text-align:center">' + esc(state.profile.fullName) + ' · ' + esc(persianDate(new Date())) + '</p>' + rows +
      '<div class="foot">گزارش نمایشی · پیشخوان بانکی</div></div>';
    area.setAttribute('aria-hidden', 'false');
    try { window.print(); } catch (e) { toast('چاپ در این محیط پشتیبانی نمی\u200cشود', '', 'warning'); }
    setTimeout(function () { area.setAttribute('aria-hidden', 'true'); }, 500);
  }
  function fullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      else toast('تمام\u200cصفحه پشتیبانی نمی\u200cشود', 'از دکمهٔ تمام\u200cصفحهٔ مرورگر استفاده کنید.', 'warning');
    } catch (e) { toast('تمام\u200cصفحه پشتیبانی نمی\u200cشود', '', 'warning'); }
  }
  function copyText(text, label) {
    var done = function () { toast('کپی شد', label || '', 'success'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallback(); });
      } else fallback();
    } catch (e) { fallback(); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done();
      } catch (e2) { toast('کپی انجام نشد', String(text), 'warning'); }
    }
  }

  /* ------------------------- مدیریت رویدادها ------------------------- */
  function handleAction(action, el, e) {
    var id = el.dataset.id;
    switch (action) {
      case 'toggle-theme':
        state.settings.general.theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        persist(); applyRootClasses(); render(); break;
      case 'card-add': openCardModal(); break;
      case 'toggle-panel':
        togglePanel(); break;
      case 'close-panel':
        $('#sidePanel').classList.remove('show');
        ['#sidePanelBtn', '#notifyToggle'].forEach(function (s) { $(s).setAttribute('aria-expanded', 'false'); });
        break;
      case 'mark-read':
        state.notifications.forEach(function (n) { n.unread = false; }); persist(); renderNotifications(); toast('اعلان\u200cها خوانده شدند', '', 'success'); break;
      case 'mark-read-one':
        var n = state.notifications.filter(function (x) { return x.id === id; })[0];
        if (n) { n.unread = false; persist(); renderNotifications(); }
        break;
      case 'lock': showLock('lock'); break;
      case 'logout':
        confirmDialog({
          title: 'خروج از حساب', icon: 'arrow-right-from-bracket', tone: 'danger', confirmLabel: 'خروج',
          text: 'آیا می\u200cخواهید از پیشخوان خارج شوید؟ برای استفادهٔ مجدد باید دوباره وارد شوید.',
          onConfirm: function () { showLock('logout'); toast('خروج انجام شد', 'نشست کاری بسته شد.', 'success'); }
        });
        break;
      case 'demo-login': unlock(); break;
      case 'set-view-mode':
        state.session.viewMode = el.dataset.mode;
        var boxes = $('#projectBoxes');
        if (boxes) boxes.className = 'project-boxes ' + (state.session.viewMode === 'list' ? 'jsListView' : 'jsGridView');
        $$('.view-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === state.session.viewMode); });
        break;
      case 'set-category':
        state.session.category = el.dataset.value; render(); break;
      case 'set-choice':
        var val = el.dataset.value;
        if (/^(0|5|10|15|30)$/.test(val) && el.dataset.path === 'settings.general.autoLogout') val = Number(val);
        setPath(state, el.dataset.path, val);
        persist(); applyRootClasses(); render();
        toast('تنظیم اعمال شد', '', 'success');
        break;
      case 'toggle-favorite':
        var idx = state.favorites.indexOf(id);
        if (idx === -1) state.favorites.push(id); else state.favorites.splice(idx, 1);
        persist(); render(); toast(idx === -1 ? 'به منتخب\u200cها اضافه شد' : 'از منتخب\u200cها حذف شد', '', 'success');
        break;
      case 'op-menu':
        e.stopPropagation();
        var menu = $('.more-menu', el.parentNode);
        var willShow = menu.hidden;
        $$('.more-menu').forEach(function (m) { m.hidden = true; });
        menu.hidden = !willShow;
        break;
      case 'op-info':
        var op = D.OPERATIONS.filter(function (o) { return o.id === id; })[0];
        if (op) openModal({
          title: op.title, icon: op.icon,
          body: '<p class="confirm-text">' + esc(op.subtitle) + '</p><div class="summary-box">' +
            '<div class="receipt-row"><span>دسته\u200cبندی</span><strong>' + esc(op.category) + '</strong></div>' +
            '<div class="receipt-row"><span>برچسب\u200cها</span><strong>' + esc(op.tags.join(' · ')) + '</strong></div>' +
            '<div class="receipt-row"><span>سهم استفاده</span><strong>٪' + toFa(op.share) + '</strong></div>' +
            '<div class="receipt-row"><span>وضعیت</span><strong>فعال (نسخهٔ آزمایشی)</strong></div></div>',
          foot: '<button class="btn btn-outline" type="button" data-action="close-modal">بستن</button>' +
            '<button class="btn btn-primary" type="button" data-action="op-open" data-id="' + esc(op.id) + '">انجام عملیات</button>'
        });
        break;
      case 'op-open':
        var targetOp = D.OPERATIONS.filter(function (o) { return o.id === id; })[0];
        if (targetOp) { closeModal(); openOperationWindow(targetOp.view); }
        break;
      case 'card-default':
        state.cards.forEach(function (c) { c.isDefault = c.id === id; });
        persist(); render(); toast('کارت پیشفرض تغییر کرد', '', 'success'); break;
      case 'card-reveal':
        state.session.revealed[id] = !state.session.revealed[id]; render(); break;
      case 'card-copy':
        var cc = cardById(id);
        if (cc) copyText(normDigits(cc.number).length === 16 ? normDigits(cc.number) : '••••' + last4(cc), 'شمارهٔ کارت');
        break;
      case 'card-freeze':
        var fc = cardById(id);
        if (fc) {
          fc.status = fc.status === 'frozen' ? 'active' : 'frozen';
          addNotification('ban', fc.status === 'frozen' ? '#df3670' : '#148a54', fc.status === 'frozen' ? 'کارت مسدود شد' : 'مسدودی کارت رفع شد', 'کارت «' + fc.label + '»');
          persist(); render(); toast(fc.status === 'frozen' ? 'کارت مسدود شد' : 'کارت فعال شد', fc.label, 'success');
        }
        break;
      case 'card-edit': openCardModal(id); break;
      case 'card-delete':
        var dc = cardById(id);
        if (!dc) break;
        confirmDialog({
          title: 'حذف کارت', icon: 'trash-can', tone: 'danger', confirmLabel: 'حذف کارت',
          text: 'کارت «' + dc.label + '» به\u200cطور کامل حذف می\u200cشود. آیا مطمئن هستید؟',
          onConfirm: function () {
            state.cards = state.cards.filter(function (c) { return c.id !== id; });
            if (dc.isDefault && state.cards.length) state.cards[0].isDefault = true;
            persist(); closeModal(); render(); toast('کارت حذف شد', dc.label, 'success');
          }
        });
        break;
      case 'amount-quick':
        var scope = el.closest('form') || document;
        var amountInput = $('[data-format="amount"]', scope);
        if (amountInput) { amountInput.value = el.dataset.amount; amountInput.dispatchEvent(new Event('input', { bubbles: true })); }
        break;
      case 'toggle-password':
        var input = $('input', el.parentNode);
        if (input) { input.type = input.type === 'password' ? 'text' : 'password'; el.innerHTML = ic(input.type === 'password' ? 'eye' : 'eye-slash'); }
        break;
      case 'fill-demo-bill':
        var f = $('#billForm');
        if (f) {
          [['billId', '1234567890123'], ['payId', '45678901'], ['amount', '2130000'], ['provider', 'برق']]
            .forEach(function (p) { var el = $('[name="' + p[0] + '"]', f); if (el) el.value = p[1]; });
          toast('اطلاعات نمونه درج شد', 'قبض برق · ۲٬۱۳۰٬۰۰۰ ریال', 'success');
        }
        break;
      case 'filter-reset':
        state.session.filters = { type: 'همه', cardId: 'همه', status: 'همه', q: '' }; render(); break;
      case 'export-json': exportJson(); break;
      case 'export-csv': exportCsv(); break;
      case 'print-statement': printStatement(); break;
      case 'print-receipt': printReceipt(); break;
      case 'copy-ref': copyText(el.dataset.ref || '', 'شمارهٔ پیگیری'); break;
      case 'reset-data':
        confirmDialog({
          title: 'بازنشانی کامل', icon: 'trash-can', tone: 'danger', confirmLabel: 'بازنشانی',
          text: 'همهٔ کارت\u200cها، تنظیمات و تراکنش\u200cها حذف و داده\u200cهای نمایشی بازگردانده می\u200cشوند.',
          onConfirm: function () {
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
            state = defaultState(); state.session = newSession();
            persist(); closeModal(); applyRootClasses(); render(); toast('داده\u200cها بازنشانی شدند', 'نسخهٔ نمایشی اولیه بازگشت.', 'success');
          }
        });
        break;
      case 'avatar-reset':
        state.profile.avatar = ''; persist(); render(); toast('تصویر پیشفرض بازگشت', '', 'success'); break;
      case 'test-api': testApi(); break;
      case 'fullscreen': fullscreen(); break;
      case 'keypad-close': hideKeypad(); break;
      case 'close-modal': closeModal(); break;
      case 'window-close': closeOperationWindow(); break;
      case 'window-minimize': toggleOperationWindowMinimize(); break;
      case 'window-maximize': toggleOperationWindowMaximize(); break;
      case 'modal-confirm':
        if (typeof state.session.modalConfirm === 'function') state.session.modalConfirm();
        break;
      default: break;
    }
  }
  function togglePanel() {
    var panelEl = $('#sidePanel');
    var show = !panelEl.classList.contains('show');
    panelEl.classList.toggle('show', show);
    ['#sidePanelBtn', '#notifyToggle'].forEach(function (s) { $(s).setAttribute('aria-expanded', show ? 'true' : 'false'); });
  }
  function bindEvents() {
    document.addEventListener('pointerdown', function (e) {
      var handle = e.target.closest && e.target.closest('[data-window-drag-handle]');
      var win = $('.operation-window', $('#operationWindowRoot'));
      if (!handle || e.target.closest('button') || !win || operationWindowMaximized || win.classList.contains('is-minimized')) return;
      var rect = win.getBoundingClientRect();
      operationWindowDrag = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
      win.style.left = rect.left + 'px'; win.style.top = rect.top + 'px';
      win.style.right = 'auto'; win.style.bottom = 'auto'; win.style.transform = 'none';
      document.body.classList.add('window-dragging');
      e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
      if (!operationWindowDrag || e.pointerId !== operationWindowDrag.pointerId) return;
      var win = $('.operation-window', $('#operationWindowRoot'));
      if (!win) return;
      var rect = win.getBoundingClientRect();
      var left = Math.max(0, Math.min(window.innerWidth - rect.width, e.clientX - operationWindowDrag.offsetX));
      var top = Math.max(0, Math.min(window.innerHeight - Math.min(rect.height, 72), e.clientY - operationWindowDrag.offsetY));
      win.style.left = left + 'px'; win.style.top = top + 'px';
    });
    function stopWindowDrag(e) {
      if (operationWindowDrag && (!e || e.pointerId === operationWindowDrag.pointerId)) {
        operationWindowDrag = null;
        document.body.classList.remove('window-dragging');
      }
    }
    document.addEventListener('pointerup', stopWindowDrag);
    document.addEventListener('pointercancel', stopWindowDrag);
    document.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) { handleAction(actionEl.dataset.action, actionEl, e); return; }
      var key = e.target.closest('[data-key]');
      if (key) { keypadPress(key.dataset.key); return; }
      var nav = e.target.closest('[data-view]');
      if (nav) {
        e.preventDefault();
        if (nav.closest('#operationWindowRoot') || nav.closest('.project-box')) openOperationWindow(nav.dataset.view);
        else navigate(nav.dataset.view);
        return;
      }
      if (!e.target.closest('.profile-wrap')) {
        $('#profileMenu').hidden = true; $('#profileBtn').setAttribute('aria-expanded', 'false');
      }
      if (!e.target.closest('.more-wrapper')) $$('.more-menu').forEach(function (m) { m.hidden = true; });
      if (!e.target.closest('#sidebar') && !e.target.closest('#navToggle') && !e.target.closest('#bottomMore')) {
        $('#sidebar').classList.remove('open'); $('#navToggle').setAttribute('aria-expanded', 'false');
      }
    });

    $('#profileBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      var menu = $('#profileMenu');
      menu.hidden = !menu.hidden;
      this.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    $('#themeToggle').addEventListener('click', function (e) { handleAction('toggle-theme', this, e); });
    $('#quickAdd').addEventListener('click', function () { openCardModal(); });
    $('#notifyToggle').addEventListener('click', togglePanel);
    $('#sidePanelBtn').addEventListener('click', togglePanel);
    $('#sidePanelClose').addEventListener('click', function () { handleAction('close-panel', this, null); });
    $('#markAllRead').addEventListener('click', function () { handleAction('mark-read', this, null); });
    $('#lockBtn').addEventListener('click', function () { $('#profileMenu').hidden = true; showLock('lock'); });
    $('#logoutBtn').addEventListener('click', function () { $('#profileMenu').hidden = true; handleAction('logout', this, null); });
    $('#sidebarLogout').addEventListener('click', function () { handleAction('logout', this, null); });
    $('#navToggle').addEventListener('click', function (e) {
      e.stopPropagation();
      var open = $('#sidebar').classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('#bottomMore').addEventListener('click', function (e) {
      e.stopPropagation();
      var open = $('#sidebar').classList.toggle('open');
      $('#navToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('#globalSearch').addEventListener('input', function () {
      state.session.search = this.value.trim();
      render();
    });

    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.matches('[data-setting]')) {
        var val = t.type === 'number' ? Number(t.value) : t.value;
        setPath(state, t.dataset.setting, val);
        if (t.dataset.setting === 'settings.api.token') state.session.apiToken = t.value;
        return;
      }
      if (t.matches('[data-filter="q"]')) {
        state.session.filters.q = t.value;
        $$('#viewRoot .data-table tbody tr').forEach(function (tr) {
          var hay = (tr.dataset.search || '').toLowerCase();
          tr.hidden = t.value ? hay.indexOf(t.value.toLowerCase()) === -1 : false;
        });
        return;
      }
      if (t.dataset.format === 'card') {
        var digits = normDigits(t.value).slice(0, 16);
        t.value = toFa(digits.replace(/(\d{4})(?=\d)/g, '$1 '));
        return;
      }
      if (t.dataset.format === 'amount') {
        var d = normDigits(t.value);
        if (t.value !== d) t.value = d;
        return;
      }
      var err = t.name && t.form ? $('[data-error-for="' + t.name + '"]', t.form) : null;
      if (err) { err.textContent = ''; t.classList.remove('is-invalid'); }
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-setting]')) { readSettingsForm(); persist(); updateHeader(); return; }
      if (t.matches('[data-toggle]')) {
        setPath(state, t.dataset.toggle, t.checked);
        persist(); applyRootClasses(); updateHeader();
        if (state.session.currentView === 'settings') render();
        toast('تنظیم ذخیره شد', '', 'success');
        return;
      }
      if (t.matches('[data-filter]')) {
        if (t.dataset.filter === 'q') return; /* فیلتر متنی در رویداد input و بدون رندر مجدد انجام شد */
        state.session.filters[t.dataset.filter] = t.value;
        render();
        return;
      }
      if (t.id === 'importFile') { importJson(t.files && t.files[0]); return; }
      if (t.id === 'f_avatar') {
        try {
          var reader = new FileReader();
          reader.onload = function (ev) {
            state.profile.avatar = ev.target.result; persist(); updateHeader();
            var img = $('.avatar-xl'); if (img) img.src = ev.target.result;
            toast('تصویر نمایه به\u200cروزرسانی شد', '', 'success');
          };
          if (t.files && t.files[0]) reader.readAsDataURL(t.files[0]);
        } catch (err) { }
      }
    });

    document.addEventListener('submit', async function (e) {
      var form = e.target;
      if (!form.dataset || !form.dataset.form) return;
      e.preventDefault();
      switch (form.dataset.form) {
        case 'card': submitCard(form); break;
        case 'balance': await submitBalance(form); break;
        case 'transfer': await submitTransfer(form); break;
        case 'remittance': await submitRemittance(form); break;
        case 'bill': await submitBill(form); break;
        case 'topup': await submitTopup(form); break;
        case 'service': await submitService(form); break;
        case 'settings': submitSettings(form); break;
        case 'profile': submitProfile(form); break;
        case 'support': submitSupport(form); break;
        case 'pin':
          var pin = normDigits($('#pinInput', form).value);
          if (pin === PIN_DEMO) unlock();
          else toast('رمز نادرست است', 'رمز نمایشی ۱۲۳۴ را وارد کنید.', 'error');
          break;
        default: break;
      }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault(); $('#globalSearch').focus(); return;
      }
      if (e.key === 'Escape') {
        if (!$('#modalRoot').hidden) { closeModal(); return; }
        if (!$('#keypadRoot').hidden) { hideKeypad(); return; }
        if (!$('#operationWindowRoot').hidden) { closeOperationWindow(); return; }
        closeMenus(); $('#sidePanel').classList.remove('show');
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.project-box[data-view]')) {
        e.preventDefault(); openOperationWindow(e.target.dataset.view);
      }
    });

    document.addEventListener('focusin', function (e) {
      if (e.target.matches && e.target.matches('[data-keypad]')) showKeypad(e.target);
    });
    $('#keypadRoot').addEventListener('mousedown', function (e) { e.preventDefault(); });
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function () { if (state.session.unlocked) resetIdle(); }, { passive: true });
    });
  }

  var VIEWS = {
    dashboard: viewDashboard, cards: viewCards, operations: viewOperations, statement: viewStatement,
    balance: viewBalance, transfer: viewTransfer, remittance: viewRemittance, bills: viewBills,
    topup: viewTopup, settings: viewSettings, profile: viewProfile, support: viewSupport,
    receipt: viewReceipt
  };

  /* ------------------------- آغاز ------------------------- */
  function init() {
    loadState();
    applyRootClasses();
    bindEvents();
    var hash = '';
    try { hash = decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { }
    if (hash && (VIEWS[hash] || hash.indexOf('service:') === 0)) state.session.currentView = hash;
    if (state.session.currentView.indexOf('service:') === 0) state.session.serviceKey = state.session.currentView.slice(8);
    render();
    setInterval(checkIdle, 15000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
