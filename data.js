/* =====================================================================
   data.js — داده‌های نمایشی (دمو) و پیکربندی صفحات
   تمام داده‌ها ساختگی هستند؛ هیچ اتصال بانکی واقعی برقرار نمی‌شود.
   ===================================================================== */
(function (global) {
  'use strict';

  var BANKS = [
    'بانک ملی ایران', 'بانک ملت', 'بانک صادرات ایران', 'بانک تجارت', 'بانک پاسارگاد',
    'بانک سپه', 'بانک رفاه کارگران', 'بانک شهر', 'بانک آینده', 'بانک اقتصاد نوین',
    'بانک پارسیان', 'پست بانک ایران', 'بانک کشاورزی', 'بانک مسکن', 'بانک سرمایه'
  ];

  var CARD_COLORS = {
    violet: 'linear-gradient(125deg, #2b2540, #4f3ff0)',
    teal: 'linear-gradient(125deg, #063c52, #0e97b8)',
    pink: 'linear-gradient(125deg, #7a2340, #df3670)',
    navy: 'linear-gradient(125deg, #1d2b57, #4067f9)',
    green: 'linear-gradient(125deg, #12603a, #34c471)',
    orange: 'linear-gradient(125deg, #8a4310, #ff942e)'
  };

  /* شماره کارت‌ها با الگوریتم Luhn و شباها با الگوریتم mod-97 معتبر هستند */
  var DEMO_CARDS = [
    { id: 'c1', bank: 'بانک ملی ایران', short: 'ملی', label: 'کارت حقوقی', number: '6037997123456783', holder: 'ALI MOHAMMADI', expiry: '08/09', cvv: '284', iban: 'IR615800000123456789012345', balance: 487500000, color: 'violet', status: 'active', isDefault: true, type: 'برداشت' },
    { id: 'c2', bank: 'بانک ملت', short: 'ملت', label: 'حساب پس\u200cانداز', number: '6219861012345673', holder: 'ALI MOHAMMADI', expiry: '11/08', cvv: '519', iban: 'IR711700000123456789012345', balance: 1284000000, color: 'teal', status: 'active', isDefault: false, type: 'برداشت' },
    { id: 'c3', bank: 'بانک صادرات ایران', short: 'صادرات', label: 'کارت خرید', number: '5022291012345672', holder: 'ALI MOHAMMADI', expiry: '03/07', cvv: '763', iban: 'IR321200000123456789012345', balance: 75200000, color: 'pink', status: 'frozen', isDefault: false, type: 'برداشت' },
    { id: 'c4', bank: 'بانک تجارت', short: 'تجارت', label: 'کارت اعتباری', number: '5892101012345670', holder: 'ALI MOHAMMADI', expiry: '12/06', cvv: '104', iban: 'IR925700000123456789012345', balance: 215000000, color: 'navy', status: 'active', isDefault: false, type: 'اعتباری' },
    { id: 'c5', bank: 'بانک پاسارگاد', short: 'پاسارگاد', label: 'حساب ارزی', number: '5041721012345675', holder: 'ALI MOHAMMADI', expiry: '06/10', cvv: '938', iban: 'IR225500000987654321012345', balance: 34200000, color: 'green', status: 'active', isDefault: false, type: 'برداشت' }
  ];

  var OPERATIONS = [
    { id: 'balance', title: 'دریافت موجودی', subtitle: 'استعلام لحظه\u200cای موجودی و مانده قابل برداشت', icon: 'wallet', tags: ['پرکاربرد', 'لحظه\u200cای'], tagIcon: 'bolt', bg: '#fee4cb', accent: '#ff942e', share: 82, view: 'balance', category: 'استعلام' },
    { id: 'transfer', title: 'انتقال وجه', subtitle: 'جابجایی پول کارت به کارت در کمترین زمان', icon: 'arrow-right-arrow-left', tags: ['پرکاربرد', 'سریع'], tagIcon: 'bolt', bg: '#e9e7fd', accent: '#4f3ff0', share: 74, view: 'transfer', category: 'انتقال' },
    { id: 'remittance', title: 'حواله بانکی', subtitle: 'ثبت حواله پایا، ساتنا و انتقال بین\u200cبانکی', icon: 'building-columns', tags: ['پایا / ساتنا'], tagIcon: 'globe', bg: '#dbf6fd', accent: '#096c86', share: 46, view: 'remittance', category: 'انتقال' },
    { id: 'bills', title: 'پرداخت قبض', subtitle: 'پرداخت قبوض آب، برق، گاز، تلفن و موبایل', icon: 'file-invoice', tags: ['بدون کارمزد'], tagIcon: 'circle-check', bg: '#ffd3e2', accent: '#df3670', share: 61, view: 'bills', category: 'پرداخت' },
    { id: 'topup', title: 'شارژ موبایل', subtitle: 'خرید شارژ مستقیم برای همهٔ اپراتورها', icon: 'mobile-screen-button', tags: ['سریع', 'محبوب'], tagIcon: 'star', bg: '#c8f7dc', accent: '#34c471', share: 68, view: 'topup', category: 'پرداخت' },
    { id: 'statement', title: 'صورتحساب و گردش حساب', subtitle: 'مشاهده، فیلتر و خروجی تراکنش\u200cها', icon: 'receipt', tags: ['گزارش', 'قابل چاپ'], tagIcon: 'chart-bar', bg: '#d5deff', accent: '#4067f9', share: 55, view: 'statement', category: 'استعلام' },
    { id: 'cards', title: 'مدیریت کارت\u200cها', subtitle: 'تعریف کارت، کارت پیشفرض و مسدودسازی', icon: 'credit-card', tags: ['امن', 'چندکارته'], tagIcon: 'shield-halved', bg: '#fee4cb', accent: '#ff942e', share: 72, view: 'cards', category: 'مدیریت' },
    { id: 'internet', title: 'بسته اینترنت', subtitle: 'خرید و فعال\u200cسازی بسته\u200cهای داده همراه', icon: 'wifi', tags: ['جدید'], tagIcon: 'sparkles', bg: '#e9e7fd', accent: '#4f3ff0', share: 34, view: 'service:internet', category: 'پرداخت' },
    { id: 'block-card', title: 'مسدودسازی کارت', subtitle: 'توقف فوری تراکنش\u200cهای کارت گم\u200cشده', icon: 'ban', tags: ['اضطراری', 'امنیتی'], tagIcon: 'triangle-exclamation', bg: '#ffd3e2', accent: '#df3670', share: 18, view: 'service:block-card', category: 'امنیت' },
    { id: 'sheba', title: 'استعلام شبا', subtitle: 'تبدیل شماره حساب به شناسه شبا و بالعکس', icon: 'hashtag', tags: ['رایگان'], tagIcon: 'circle-check', bg: '#c8f7dc', accent: '#34c471', share: 27, view: 'service:sheba', category: 'استعلام' },
    { id: 'change-pin', title: 'تغییر رمز کارت', subtitle: 'تعیین رمز دوم و رمز خرید اینترنتی', icon: 'key', tags: ['امنیتی'], tagIcon: 'lock', bg: '#dbf6fd', accent: '#096c86', share: 31, view: 'service:change-pin', category: 'امنیت' },
    { id: 'loan', title: 'پرداخت قسط', subtitle: 'پرداخت اقساط تسهیلات و بدهی\u200cها', icon: 'coins', tags: ['سررسید'], tagIcon: 'calendar-days', bg: '#d5deff', accent: '#4067f9', share: 22, view: 'service:loan', category: 'پرداخت' },
    { id: 'cheque', title: 'درخواست دسته\u200cچک', subtitle: 'ثبت درخواست صدور چک و پیگیری شعبه', icon: 'book', tags: ['غیرحضوری'], tagIcon: 'file-lines', bg: '#fee4cb', accent: '#ff942e', share: 12, view: 'service:cheque', category: 'مدیریت' }
  ];

  var CATEGORIES = ['همه', 'استعلام', 'انتقال', 'پرداخت', 'مدیریت', 'امنیت'];

  /* پیکربندی فرم عملیات‌های عمومی */
  var SERVICE_FORMS = {
    'block-card': {
      title: 'مسدودسازی کارت', icon: 'ban', tone: 'danger', subtitle: 'عملیات فوری · غیرقابل برگشت در محیط واقعی',
      desc: 'در صورت گم شدن یا سرقت کارت، آن را فوری مسدود کنید. وضعیت کارت بلافاصله در فهرست کارت\u200cها به\u200cروز می\u200cشود.',
      fields: [
        { name: 'cardId', label: 'کارت مورد نظر', type: 'cards', required: true },
        { name: 'reason', label: 'دلیل مسدودسازی', type: 'select', required: true, options: ['گم شدن کارت', 'سرقت کارت', 'مشکوک به سوءاستفاده', 'درخواست شخصی'] },
        { name: 'note', label: 'توضیحات (اختیاری)', type: 'textarea', placeholder: 'جزئیات بیشتر…' }
      ],
      submit: 'مسدود کردن کارت', otp: true,
      demoTitle: 'درخواست\u200cهای اخیر مسدودسازی',
      demo: [
        { icon: 'ban', title: 'کارت صادرات •• ۵۶۷۲', meta: 'گم شدن کارت · ۱۴۰۵/۰۷/۱۲', status: 'انجام شده' },
        { icon: 'rotate', title: 'کارت ملت •• ۵۶۷۳', meta: 'رفع مسدودی · ۱۴۰۵/۰۵/۲۸', status: 'انجام شده' }
      ]
    },
    'change-pin': {
      title: 'تغییر رمز کارت', icon: 'key', tone: 'info', subtitle: 'رمز دوم / رمز خرید اینترنتی',
      desc: 'رمز جدید باید ۴ تا ۶ رقم باشد و نباید با رمز فعلی یا تاریخ تولد یکسان باشد. در حالت کیوسک، صفحه\u200cکلید لمسی به صورت خودکار باز می\u200cشود.',
      fields: [
        { name: 'cardId', label: 'کارت مورد نظر', type: 'cards', required: true },
        { name: 'newPin', label: 'رمز جدید', type: 'pin', required: true, dir: 'ltr', keypad: 'pin', placeholder: '••••' },
        { name: 'confirmPin', label: 'تکرار رمز جدید', type: 'pin', required: true, dir: 'ltr', keypad: 'pin', placeholder: '••••' },
        { name: 'pinType', label: 'نوع رمز', type: 'select', required: true, options: ['رمز دوم (خرید اینترنتی)', 'رمز اصلی کارت', 'رمز ورود به همراه بانک'] }
      ],
      submit: 'ثبت رمز جدید', otp: true,
      demoTitle: 'تاریخچه تغییر رمز',
      demo: [
        { icon: 'key', title: 'رمز دوم کارت ملی', meta: '۱۴۰۵/۰۶/۱۹ · موفق', status: 'موفق' },
        { icon: 'key', title: 'رمز اصلی کارت تجارت', meta: '۱۴۰۵/۰۲/۰۴ · موفق', status: 'موفق' }
      ]
    },
    'sheba': {
      title: 'استعلام شناسه شبا', icon: 'hashtag', tone: 'info', subtitle: 'تبدیل شماره حساب به IBAN',
      desc: 'شماره شبای معتبر Iranian با IR آغاز می\u200cشود و ۲۴ رقم دارد. صحت شناسه با الگوریتم بین\u200cالمللی mod-97 بررسی می\u200cشود.',
      fields: [
        { name: 'iban', label: 'شناسه شبا (IBAN)', type: 'text', required: true, dir: 'ltr', placeholder: 'IR00 0000 0000 0000 0000 0000 00', help: 'مثال: IR615800000123456789012345' },
        { name: 'source', label: 'نوع استعلام', type: 'select', required: true, options: ['اعتبارسنجی شبا', 'دریافت مشخصات صاحب حساب', 'تبدیل شماره حساب به شبا'] }
      ],
      submit: 'استعلام شبا', otp: false,
      demoTitle: 'استعلام\u200cهای اخیر',
      demo: [
        { icon: 'hashtag', title: 'IR71 1700 0001 2345 6789 0123 45', meta: 'بانک ملت · معتبر', status: 'موفق' },
        { icon: 'hashtag', title: 'IR32 1200 0001 2345 6789 0123 45', meta: 'بانک صادرات · معتبر', status: 'موفق' }
      ]
    },
    'internet': {
      title: 'خرید بسته اینترنت', icon: 'wifi', tone: 'info', subtitle: 'شارژ بسته داده همراه',
      desc: 'بسته انتخابی بلافاصله روی شماره وارد شده فعال می\u200cشود. مبلغ از کارت پیشفرض کسر می\u200cگردد.',
      fields: [
        { name: 'phone', label: 'شماره موبایل', type: 'tel', required: true, dir: 'ltr', keypad: 'numeric', placeholder: '09123456789' },
        { name: 'operator', label: 'اپراتور', type: 'select', required: true, options: ['همراه اول', 'ایرانسل', 'رایتل', 'شاتل موبایل'] },
        { name: 'package', label: 'بسته', type: 'select', required: true, options: ['۱ گیگابایت / ۷ روزه', '۳ گیگابایت / ۳۰ روزه', '۱۰ گیگابایت / ۳۰ روزه', 'نامحدود / ۷ روزه'] },
        { name: 'amount', label: 'مبلغ بسته (ریال)', type: 'amount', required: true, dir: 'ltr', keypad: 'amount', value: '900000' },
        { name: 'cardId', label: 'کارت پرداخت', type: 'cards', required: true }
      ],
      submit: 'خرید بسته', otp: true,
      demoTitle: 'بسته\u200cهای خریداری شده',
      demo: [
        { icon: 'wifi', title: '۳ گیگابایت / ۳۰ روزه', meta: 'همراه اول · ۱۴۰۵/۰۸/۰۹', status: 'فعال' },
        { icon: 'wifi', title: '۱ گیگابایت / ۷ روزه', meta: 'ایرانسل · ۱۴۰۵/۰۷/۱۴', status: 'منقضی' }
      ]
    },
    'loan': {
      title: 'پرداخت قسط تسهیلات', icon: 'coins', tone: 'info', subtitle: 'اقساط و بدهی\u200cهای بانکی',
      desc: 'قسط انتخابی از کارت پرداخت کسر و شماره پیگیری صادر می\u200cشود. اطلاعات اقساط زیر نمایشی است.',
      fields: [
        { name: 'loan', label: 'تسهیلات', type: 'select', required: true, options: ['وام مسکن · قسط آبان', 'وام خودرو · قسط آبان', 'تسهیلات کسب\u200cوکار · قسط آبان'] },
        { name: 'amount', label: 'مبلغ قسط', type: 'amount', required: true, keypad: 'amount', value: '4800000' },
        { name: 'cardId', label: 'کارت پرداخت', type: 'cards', required: true }
      ],
      submit: 'پرداخت قسط', otp: true,
      demoTitle: 'اقساط پیش رو',
      demo: [
        { icon: 'coins', title: 'وام مسکن · قسط آذر', meta: 'سررسید ۱۴۰۵/۰۹/۳۰', status: '۴٬۸۰۰٬۰۰۰ ریال' },
        { icon: 'coins', title: 'وام خودرو · قسط آذر', meta: 'سررسید ۱۴۰۵/۰۹/۲۵', status: '۲٬۱۰۰٬۰۰۰ ریال' }
      ]
    },
    'cheque': {
      title: 'درخواست دسته\u200cچک', icon: 'book', tone: 'info', subtitle: 'خدمات غیرحضوری چک',
      desc: 'درخواست صدور دسته\u200cچک ثبت و پس از تأیید شعبه پیگیری می\u200cشود.',
      fields: [
        { name: 'cardId', label: 'حساب متصل', type: 'cards', required: true },
        { name: 'count', label: 'تعداد برگ', type: 'select', required: true, options: ['۱۰ برگ', '۲۵ برگ', '۵۰ برگ'] },
        { name: 'branch', label: 'شعبه تحویل', type: 'text', required: true, placeholder: 'مثال: شعبه مرکزی تهران' }
      ],
      submit: 'ثبت درخواست', otp: false,
      demoTitle: 'درخواست\u200cها',
      demo: [
        { icon: 'book', title: 'دسته\u200cچک ۲۵ برگ', meta: '۱۴۰۵/۰۴/۱۱ · شعبه مرکزی', status: 'تحویل شده' }
      ]
    }
  };

  var FAQ = [
    { q: 'چگونه یک کارت بانکی جدید تعریف کنم؟', a: 'از منوی «کارت\u200cهای من» یا دکمهٔ + در نوار بالا، گزینهٔ «افزودن کارت» را بزنید. شمارهٔ ۱۶ رقمی، تاریخ انقضا، بانک و نام مستعار را وارد کنید. اعتبار شماره با الگوریتم Luhn بررسی می\u200cشود.' },
    { q: 'چطور کارت پیشفرض را تغییر دهم؟', a: 'در صفحهٔ کارت\u200cها، روی دکمهٔ «تعیین به\u200cعنوان پیشفرض» کارت مورد نظر کلیک کنید. کارت پیشفرض در انتقال وجه، پرداخت قبض و استعلام موجودی به صورت خودکار انتخاب می\u200cشود.' },
    { q: 'آیا اطلاعات حساس کارت ذخیره می\u200cشود؟', a: 'بستگی به تنظیمات شما دارد. در «تنظیمات → ذخیرهٔ اطلاعات مهم» می\u200cتوانید مشخص کنید تاریخ انقضا، شمارهٔ کامل کارت، CVV2 و تاریخچهٔ تراکنش\u200cها در حافظهٔ محلی ذخیره شوند یا خیر. به صورت پیشفرض فقط ۴ رقم آخر کارت ذخیره می\u200cشود.' },
    { q: 'اتصال به API بانک چگونه پیکربندی می\u200cشود؟', a: 'در تنظیمات، نشانی پایهٔ API، کلید دسترسی، شناسهٔ مشتری و کد بانک را وارد و با «تست اتصال» بررسی کنید. تا وقتی حالت «آزمایشی» فعال باشد، تمام پاسخ\u200cها به صورت محلی شبیه\u200cسازی می\u200cشوند و هیچ درخواست شبکه\u200cای ارسال نمی\u200cگردد.' },
    { q: 'آیا برنامه روی کیوسک لمسی هم کار می\u200cکند؟', a: 'بله. با فعال کردن «حالت کیوسک» اندازهٔ دکمه\u200cها و فونت\u200cها افزایش می\u200cیابد، صفحه\u200cکلید عددی لمسی در دسترس قرار می\u200cگیرد، خروج خودکار پس از عدم فعالیت اعمال می\u200cشود و هیچ قابلیتی وابسته به نشانگر ماوس (hover) نیست.' }
  ];

  function daysAgo(n) {
    var d = new Date();
    d.setHours(11, 24, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }

  function seedTransactions() {
    var rows = [
      ['دریافت حقوق', 'واریز', 325000000, 'c1', 'hand-holding-dollar', 'موفق', 0],
      ['انتقال به کارت ملت', 'انتقال', -45000000, 'c1', 'arrow-right-arrow-left', 'موفق', 0],
      ['خرید از فروشگاه شهروند', 'خرید', -6840000, 'c3', 'cart-shopping', 'موفق', 1],
      ['پرداخت قبض برق', 'قبض', -2130000, 'c1', 'file-invoice', 'موفق', 1],
      ['شارژ همراه اول', 'شارژ', -500000, 'c2', 'mobile-screen-button', 'موفق', 2],
      ['حواله پایا به حساب شرکا', 'حواله', -120000000, 'c2', 'building-columns', 'موفق', 2],
      ['واریز از حساب پس\u200cانداز', 'واریز', 80000000, 'c1', 'wallet', 'موفق', 3],
      ['برداشت از خودپرداز', 'برداشت', -15000000, 'c1', 'money-bill', 'موفق', 3],
      ['پرداخت بسته اینترنت', 'خرید', -1900000, 'c4', 'wifi', 'موفق', 4],
      ['انتقال کارت به کارت', 'انتقال', -22500000, 'c4', 'arrow-right-arrow-left', 'در انتظار', 4],
      ['پرداخت قسط وام مسکن', 'قسط', -4800000, 'c2', 'coins', 'موفق', 5],
      ['خرید اینترنتی', 'خرید', -3450000, 'c5', 'cart-shopping', 'ناموفق', 6],
      ['عودت وجه', 'واریز', 12000000, 'c5', 'rotate', 'موفق', 7],
      ['پرداخت قبض گاز', 'قبض', -1780000, 'c1', 'file-invoice', 'موفق', 8]
    ];
    return rows.map(function (r, i) {
      return {
        id: 't' + (i + 1), title: r[0], type: r[1], amount: r[2], cardId: r[3],
        icon: r[4], status: r[5], date: daysAgo(r[6]), ref: 'BNK-' + (812400 + i * 37)
      };
    });
  }

  function seedNotifications() {
    return [
      { id: 'n1', icon: 'circle-check', color: '#148a54', title: 'انتقال وجه موفق', text: 'مبلغ ۴٬۵۰۰٬۰۰۰ تومان به کارت •• ۵۶۷۳ واریز شد.', time: '۵ دقیقه پیش', unread: true },
      { id: 'n2', icon: 'shield-halved', color: '#4f3ff0', title: 'ورود جدید به حساب', text: 'ورود از دستگاه کیوسک شعبه مرکزی ثبت شد.', time: '۲ ساعت پیش', unread: true },
      { id: 'n3', icon: 'calendar-days', color: '#ff942e', title: 'یادآوری سررسید', text: 'قسط وام مسکن در ۶ روز آینده سررسید می\u200cشود.', time: 'دیروز', unread: true },
      { id: 'n4', icon: 'receipt', color: '#096c86', title: 'صورتحساب آماده است', text: 'گردش حساب مهر ماه قابل دریافت و چاپ است.', time: '۲ روز پیش', unread: false },
      { id: 'n5', icon: 'key', color: '#df3670', title: 'تغییر رمز دوم', text: 'رمز دوم کارت ملی با موفقیت به\u200cروزرسانی شد.', time: '۳ روز پیش', unread: false }
    ];
  }

  function seedRemittances() {
    return [
      { id: 'r1', to: 'شرکت پرداخت\u200cیاران', iban: 'IR615800000123456789012345', amount: 120000000, type: 'پایا', date: daysAgo(2), status: 'انجام شده', ref: 'HV-982341' },
      { id: 'r2', to: 'مهندسین سازه نوین', iban: 'IR711700000123456789012345', amount: 450000000, type: 'ساتنا', date: daysAgo(6), status: 'انجام شده', ref: 'HV-982117' },
      { id: 'r3', to: 'حساب پس\u200cانداز شخصی', iban: 'IR321200000123456789012345', amount: 80000000, type: 'داخلی', date: daysAgo(9), status: 'در انتظار', ref: 'HV-981904' }
    ];
  }

  function seedBills() {
    return [
      { id: 'b1', title: 'قبض برق · شرکت توانیر', billId: '۱۲۳۴۵۶۷۸۹۰۱۲۳', payId: '۴۵۶۷۸۹۰۱', amount: 2130000, date: daysAgo(1) },
      { id: 'b2', title: 'قبض گاز · شرکت ملی گاز', billId: '۹۸۷۶۵۴۳۲۱۰۹۸۷', payId: '۱۲۳۴۵۶۷۸', amount: 1780000, date: daysAgo(8) },
      { id: 'b3', title: 'قبض تلفن ثابت · مخابرات', billId: '۱۲۲۳۳۴۴۵۵۶۶۷۷', payId: '۸۸۹۹۰۰۱۱', amount: 940000, date: daysAgo(14) }
    ];
  }

  function seedTopups() {
    return [
      { id: 'p1', phone: '09123456789', operator: 'همراه اول', amount: 500000, date: daysAgo(2) },
      { id: 'p2', phone: '09351234567', operator: 'ایرانسل', amount: 200000, date: daysAgo(11) }
    ];
  }

  global.BANK_DATA = {
    BANKS: BANKS,
    CARD_COLORS: CARD_COLORS,
    OPERATIONS: OPERATIONS,
    CATEGORIES: CATEGORIES,
    SERVICE_FORMS: SERVICE_FORMS,
    FAQ: FAQ,
    seedCards: function () { return JSON.parse(JSON.stringify(DEMO_CARDS)); },
    seedTransactions: seedTransactions,
    seedNotifications: seedNotifications,
    seedRemittances: seedRemittances,
    seedBills: seedBills,
    seedTopups: seedTopups
  };
})(typeof window !== 'undefined' ? window : globalThis);
