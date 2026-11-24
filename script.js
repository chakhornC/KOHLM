/* ==========================================================================
   Kohlm — script.js
   ไฟล์เดียวใช้ร่วมกันทุกหน้า (vanilla JS)
   ตรวจว่าอยู่หน้าไหนจาก element ที่มีอยู่ แล้วรันเฉพาะส่วนของหน้านั้น
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     0. ค่าคงที่ (แก้ตรงนี้ที่เดียว)
     ------------------------------------------------------------------------ */
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyDZvg8ZdbQmdWWKS2_9aBCP2ukphArG9emFOVBREE0XwGUXj5sDZLUrXXOKAcbohMP9Q/exec';
  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vREI4FFsiXqaQqcbH7dJSckVeivFaMG9VcnxOakKKZ0FN_eB8uatSVkEYSGTWHOdkclYvsa3H6BZLB9/pub?gid=0&single=true&output=csv';
  const PRODUCTS_URL = 'products.json';
  const LANG_KEY = 'kohlm-lang';
  const DEFAULT_LANG = 'th';

  // รายการ mood และ slug สำหรับ URL parameter
  const MOODS = [
    { slug: 'golden-hour',     name: 'Golden Hour' },
    { slug: 'carry-on',        name: 'Carry-On' },
    { slug: 'sea-reset',       name: 'Sea Reset' },
    { slug: 'slow-down',       name: 'Slow Down' },
    { slug: 'little-souvenir', name: 'Little Souvenir' },
    { slug: 'island-ritual',   name: 'Island Ritual' }
  ];

  // ข้อความคงที่ที่สร้างจาก JS (ข้อความใน html ใช้ data-th / data-en)
  const I18N = {
    th: {
      all: 'ทั้งหมด',
      order: 'สั่งซื้อ',
      currency: function (n) { return formatNumber(n) + ' บาท'; },
      loading: 'กำลังโหลด...',
      loadError: 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      noProducts: 'ไม่พบสินค้าในหมวดนี้',
      noOrders: 'ยังไม่มีออเดอร์',
      needFields: 'กรุณากรอกชื่อและช่องทางติดต่อ',
      submitError: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
    },
    en: {
      all: 'All',
      order: 'Order',
      currency: function (n) { return '฿' + formatNumber(n); },
      loading: 'Loading...',
      loadError: 'Could not load data. Please try again.',
      noProducts: 'No products in this mood yet.',
      noOrders: 'No orders yet',
      needFields: 'Please enter your name and contact.',
      submitError: 'Something went wrong. Please try again.'
    }
  };

  /* ------------------------------------------------------------------------
     1. ตัวช่วยทั่วไป
     ------------------------------------------------------------------------ */
  let currentLang = DEFAULT_LANG;
  const langListeners = []; // ฟังก์ชันที่ต้อง render ใหม่เมื่อสลับภาษา

  function t(key) {
    return I18N[currentLang][key];
  }

  function formatNumber(n) {
    const num = Number(n);
    return isFinite(num) ? num.toLocaleString('en-US') : String(n);
  }

  function slugify(text) {
    return String(text).trim().toLowerCase().replace(/\s+/g, '-');
  }

  function isPlaceholder(value) {
    return /^\[[A-Z_]+\]$/.test(value);
  }

  /* ------------------------------------------------------------------------
     2. ระบบภาษา TH / EN (ทุกหน้า)
     ------------------------------------------------------------------------ */
  function loadLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === 'th' || saved === 'en') return saved;
    } catch (e) { /* localStorage ใช้ไม่ได้ ก็ใช้ค่าเริ่มต้น */ }
    return DEFAULT_LANG;
  }

  function saveLang(lang) {
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* ข้ามได้ */ }
  }

  // แปลข้อความใน html ที่มี data-th / data-en
  function translateStatic() {
    document.querySelectorAll('[data-th][data-en]').forEach(function (el) {
      el.textContent = el.getAttribute('data-' + currentLang);
    });
    // placeholder: data-th-placeholder / data-en-placeholder
    document.querySelectorAll('[data-th-placeholder]').forEach(function (el) {
      const text = el.getAttribute('data-' + currentLang + '-placeholder');
      if (text !== null) el.setAttribute('placeholder', text);
    });
  }

  // วาดปุ่ม TH | EN โดยเน้นภาษาที่เลือกอยู่
  function renderLangToggle() {
    const btn = document.getElementById('lang-toggle');
    if (!btn) return;
    btn.textContent = '';
    ['th', 'en'].forEach(function (code, i) {
      if (i === 1) btn.appendChild(document.createTextNode(' | '));
      const span = document.createElement('span');
      span.textContent = code.toUpperCase();
      if (code === currentLang) span.className = 'active';
      btn.appendChild(span);
    });
    btn.setAttribute('aria-label', currentLang === 'th' ? 'Switch to English' : 'เปลี่ยนเป็นภาษาไทย');
  }

  function applyLang() {
    document.documentElement.lang = currentLang;
    document.documentElement.setAttribute('data-lang', currentLang);
    translateStatic();
    renderLangToggle();
    langListeners.forEach(function (fn) { fn(); });
  }

  function initLang() {
    currentLang = loadLang();
    const btn = document.getElementById('lang-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        currentLang = currentLang === 'th' ? 'en' : 'th';
        saveLang(currentLang);
        applyLang();
      });
    }
    applyLang();
  }

  /* ------------------------------------------------------------------------
     3. หน้า product.html  (มี #product-list)
     ------------------------------------------------------------------------ */
  function initProductPage() {
    const listEl = document.getElementById('product-list');
    if (!listEl) return;

    const filterEl = document.getElementById('filter-bar');
    let products = [];
    let loaded = false;
    let failed = false;
    let activeMood = 'all'; // 'all' หรือ slug

    // อ่าน ?mood=xxx ถ้าไม่ตรงกับ slug ใดเลย ให้แสดงทั้งหมด
    try {
      const param = new URLSearchParams(window.location.search).get('mood');
      if (param && MOODS.some(function (m) { return m.slug === param; })) {
        activeMood = param;
      }
    } catch (e) { /* ใช้ทั้งหมด */ }

    // สร้างปุ่มกรอง (สร้างครั้งเดียว แล้วอัปเดตข้อความตอนสลับภาษา)
    function buildFilterBar() {
      if (!filterEl) return;
      filterEl.textContent = '';
      const items = [{ slug: 'all', name: null }].concat(MOODS);
      items.forEach(function (m) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn filter-btn';
        b.setAttribute('data-mood', m.slug);
        b.addEventListener('click', function () {
          activeMood = m.slug;
          syncFilterBar();
          renderProducts();
          updateUrl();
        });
        filterEl.appendChild(b);
      });
      syncFilterBar();
    }

    // อัปเดตข้อความปุ่ม + คลาส active (ไม่สร้างใหม่ จึงไม่รีเซ็ตตัวกรอง)
    function syncFilterBar() {
      if (!filterEl) return;
      filterEl.querySelectorAll('.filter-btn').forEach(function (b) {
        const slug = b.getAttribute('data-mood');
        const mood = MOODS.filter(function (m) { return m.slug === slug; })[0];
        b.textContent = mood ? mood.name : t('all');
        const on = slug === activeMood;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    // ให้ URL ตรงกับตัวกรองปัจจุบัน (แชร์ลิงก์ได้)
    function updateUrl() {
      try {
        const url = new URL(window.location.href);
        if (activeMood === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', activeMood);
        window.history.replaceState(null, '', url.toString());
      } catch (e) { /* ข้ามได้ */ }
    }

    function buildOrderUrl(p) {
      // ชุด Set ใช้ชื่อตรงๆ ไม่ใส่ไซส์ในวงเล็บ
      const item = p.type === 'set' ? p.name : p.name + ' (' + p.size + ')';
      return 'order.html?item=' + encodeURIComponent(item) +
             '&price=' + encodeURIComponent(p.price);
    }

    function buildCard(p) {
      const moodSlug = slugify(p.mood);

      const card = document.createElement('article');
      card.className = 'product-card';

      const media = document.createElement('div');
      media.className = 'product-card__media';
      const img = document.createElement('img');
      img.className = 'product-card__img';
      img.src = p.image;
      img.alt = currentLang === 'th' ? p.alt_th : p.alt_en;
      img.loading = 'lazy';
      img.decoding = 'async';
      media.appendChild(img);

      const body = document.createElement('div');
      body.className = 'product-card__body';

      const mood = document.createElement('span');
      mood.className = 'mood mood--' + moodSlug;
      mood.textContent = p.mood;

      const name = document.createElement('h3');
      name.className = 'product-card__name';
      name.textContent = p.name;

      const short = document.createElement('p');
      short.className = 'product-card__short';
      short.textContent = currentLang === 'th' ? p.short_th : p.short_en;

      const meta = document.createElement('div');
      meta.className = 'product-card__meta';
      const size = document.createElement('span');
      size.className = 'product-card__size';
      size.textContent = p.size;
      const price = document.createElement('span');
      price.className = 'price';
      price.textContent = t('currency')(p.price);
      meta.appendChild(size);
      meta.appendChild(price);

      const order = document.createElement('a');
      order.className = 'btn';
      order.href = buildOrderUrl(p);
      order.textContent = t('order');

      body.appendChild(mood);
      body.appendChild(name);
      body.appendChild(short);
      body.appendChild(meta);
      body.appendChild(order);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function showMessage(text) {
      listEl.textContent = '';
      const p = document.createElement('p');
      p.className = 'text-center';
      p.textContent = text;
      listEl.appendChild(p);
    }

    function renderProducts() {
      if (failed) { showMessage(t('loadError')); return; }
      if (!loaded) { showMessage(t('loading')); return; }

      const shown = products.filter(function (p) {
        return activeMood === 'all' || slugify(p.mood) === activeMood;
      });
      if (!shown.length) { showMessage(t('noProducts')); return; }

      listEl.textContent = '';
      const frag = document.createDocumentFragment();
      shown.forEach(function (p) { frag.appendChild(buildCard(p)); });
      listEl.appendChild(frag);
    }

    // สลับภาษา: อัปเดตปุ่มและวาดการ์ดใหม่ โดยคงตัวกรองเดิม
    langListeners.push(function () {
      syncFilterBar();
      renderProducts();
    });

    buildFilterBar();
    renderProducts();

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = Array.isArray(data.products) ? data.products : [];
        loaded = true;
        renderProducts();
      })
      .catch(function (err) {
        console.error(err);
        failed = true;
        renderProducts();
      });
  }

  /* ------------------------------------------------------------------------
     4. หน้า order.html  (มี #orderForm)
     ------------------------------------------------------------------------ */
  function initOrderPage() {
    const form = document.getElementById('orderForm');
    if (!form) return;

    const field = function (id) { return document.getElementById(id); };

    // เติมค่าจาก URL parameter ลงช่อง items และ total
    // ถ้าไม่มี parameter ปล่อยว่างให้กรอกเอง
    try {
      const params = new URLSearchParams(window.location.search);
      const item = params.get('item');
      const price = params.get('price');
      if (item !== null && field('items')) field('items').value = item;
      if (price !== null && field('total')) field('total').value = price;
    } catch (e) { /* ไม่มี parameter ก็ไม่เป็นไร */ }

    if (isPlaceholder(APPS_SCRIPT_URL)) {
      console.warn('[Kohlm] APPS_SCRIPT_URL ยังเป็นค่า placeholder กรุณาแก้ที่ต้นไฟล์ script.js');
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      const val = function (id) { return field(id) ? field(id).value : ''; };

      const payload = {
        customerName: val('customerName').trim(),
        contact: val('contact').trim(),
        items: val('items'),
        total: val('total'),
        note: val('note')
      };

      // ตรวจว่าชื่อและช่องทางติดต่อไม่ว่าง
      if (!payload.customerName || !payload.contact) {
        alert(t('needFields'));
        const first = !payload.customerName ? field('customerName') : field('contact');
        if (first) first.focus();
        return;
      }

      // กันกรณีลืมใส่ URL จริง ไม่งั้นจะส่งไปผิดที่แล้วพาไปหน้า thankyou เฉยๆ
      if (isPlaceholder(APPS_SCRIPT_URL)) {
        console.warn('[Kohlm] ยังไม่ได้ตั้งค่า APPS_SCRIPT_URL จึงไม่ส่งออเดอร์');
        alert(t('submitError'));
        return;
      }

      // กดซ้ำไม่ได้ระหว่างส่ง
      if (submitBtn) submitBtn.disabled = true;

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        if (submitBtn) submitBtn.disabled = false;
        alert(t('submitError'));
      });
    });
  }

  /* ------------------------------------------------------------------------
     5. หน้า admin.html  (มี #ordersTable)
     ------------------------------------------------------------------------ */

  // parse CSV เอง: รองรับค่าในเครื่องหมายคำพูด, คอมมา/ขึ้นบรรทัดใหม่ในช่อง, "" = " หนึ่งตัว
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // ตัด BOM

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }  // "" แทน " หนึ่งตัว
          else inQuotes = false;                           // ปิดเครื่องหมายคำพูด
        } else {
          cell += ch;                                      // รวมคอมมา/ขึ้นบรรทัดใหม่ในช่อง
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;      // CRLF
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else {
        cell += ch;
      }
    }
    // แถวสุดท้ายที่ไม่มี newline ปิดท้าย
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

    return rows;
  }

  function initAdminPage() {
    const table = document.getElementById('ordersTable');
    const tbody = table ? table.querySelector('tbody') : null;
    if (!tbody) return;

    const COLS = 6; // วันเวลา, ชื่อ, เบอร์/Line, รายการ, ยอดรวม, หมายเหตุ
    let orders = null;    // null = ยังไม่โหลด
    let failed = false;

    function messageRow(text) {
      tbody.textContent = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = COLS;
      td.className = 'text-center';
      td.textContent = text;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    function render() {
      if (failed) { messageRow(t('loadError')); return; }
      if (orders === null) { messageRow(t('loading')); return; }
      if (!orders.length) { messageRow(t('noOrders')); return; }

      tbody.textContent = '';
      const frag = document.createDocumentFragment();
      orders.forEach(function (r) {
        const tr = document.createElement('tr');
        for (let c = 0; c < COLS; c++) {
          const td = document.createElement('td');
          let value = r[c] !== undefined ? r[c] : '';
          if (c === 4) { // จำนวนเงิน: ใส่คอมมาคั่นหลักพัน
            const num = Number(String(value).replace(/,/g, ''));
            if (String(value).trim() !== '' && isFinite(num)) value = formatNumber(num);
          }
          td.textContent = value; // textContent เท่านั้น กัน XSS
          tr.appendChild(td);
        }
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    langListeners.push(render);
    render();

    if (isPlaceholder(CSV_URL)) {
      console.warn('[Kohlm] CSV_URL ยังเป็นค่า placeholder กรุณาแก้ที่ต้นไฟล์ script.js');
      failed = true;
      render();
      return;
    }

    fetch(CSV_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        const rows = parseCSV(text).filter(function (r) {
          return r.some(function (c) { return c.trim() !== ''; }); // ข้ามบรรทัดว่าง
        });
        rows.shift();                 // ข้ามแถวหัวตาราง
        orders = rows.reverse();      // ล่าสุดขึ้นก่อน
        render();
      })
      .catch(function (err) {
        console.error(err);
        failed = true;
        render();
      });
  }

  /* ------------------------------------------------------------------------
     6. เริ่มทำงาน
     ------------------------------------------------------------------------ */
  function init() {
    initLang();
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
