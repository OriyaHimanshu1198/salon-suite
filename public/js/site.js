import { api, html, raw, moneyShort, money, $, $$, on, toast, escapeHtml, longDate, todayStr } from './api.js';

const STEPS = ['Services', 'Stylist', 'Date & time', 'Details', 'Confirmed'];

const state = {
  site: null,
  step: 0,
  serviceIds: [],
  staffId: 'any',
  date: null,
  slot: null,
  month: null,
  dayCounts: {},
  slots: [],
  loading: false,
  customer: { firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', notes: '', marketingOptIn: true },
  confirmation: null,
  category: 'All',
};

const servicesById = (id) => state.site?.services.find((s) => s.id === id);
const selectedServices = () => state.serviceIds.map(servicesById).filter(Boolean);
const totalPrice = () => selectedServices().reduce((n, s) => n + s.price_pence, 0);
const totalDuration = () => selectedServices().reduce((n, s) => n + s.duration_min, 0);

/* ── boot ───────────────────────────────────────────────────────────────── */

init();

async function init() {
  try {
    state.site = await api('/api/public/site');
  } catch (err) {
    document.getElementById('wizardBody').innerHTML = `<p>Could not load the salon. Is the server running?</p>`;
    return;
  }
  renderSite();
  renderOffers();
  renderNotice();
  renderBirthday();
  renderReviews();
  renderSocial();
  renderServiceTabs();
  renderServices();
  renderTeam();
  renderHours();
  renderSteps();
  renderStep();
  updateFloatSlot();
  bindChrome();
}

function renderSite() {
  const { content, salon, services, staff } = state.site;
  document.title = `${salon.name} — Salon in Greenwich`;
  $('#brandName').textContent = salon.name.split(' ')[0];
  $('#footerBrand').textContent = salon.name.split(' ')[0];
  $('#heroKicker').textContent = content.hero_kicker || '';
  $('#heroTitle').innerHTML = escapeHtml(content.hero_title || '')
    .replace(/&lt;em&gt;/g, '<em>').replace(/&lt;\/em&gt;/g, '</em>');
  $('#heroSub').textContent = content.hero_sub || '';
  $('#aboutTitle').textContent = content.about_title || '';
  $('#aboutBody').textContent = content.about_body || '';
  $('#footerNote').textContent = content.footer_note || '';
  $('#footerAbout').textContent = (content.about_body || '').slice(0, 140) + '…';
  $('#footerAddress').textContent = content.address || '';
  $('#footerPhone').textContent = content.phone || '';
  $('#footerPhone').href = `tel:${String(content.phone || '').replace(/\s/g, '')}`;
  $('#footerEmail').textContent = content.email || '';
  $('#footerEmail').href = `mailto:${content.email || ''}`;
  $('#footerCopy').textContent = `© ${new Date().getFullYear()} ${salon.name}`;
  $('#statStaff').textContent = staff.length;
  $('#statServices').textContent = services.length;
  const rating = state.site.reviews?.average;
  if (rating) $('#statRating').textContent = `${rating.toFixed(1)}★`;
  $('#metaDescription').setAttribute('content', content.hero_sub || '');
}

function renderOffers() {
  const offers = state.site.offers || [];
  if (!offers.length) return;
  $('#offersSection').hidden = false;
  $('#offers').innerHTML = offers.map((o) => html`
    <article class="offer">
      <div class="offer-emoji">${o.emoji}</div>
      <div>
        <h4>${o.title}</h4>
        <p>${o.description}</p>
        ${o.code ? html`<span class="offer-code">${o.code}</span>` : raw('')}
      </div>
    </article>`).join('');
}

function renderNotice() {
  const n = state.site.notice;
  if (!n?.active || !n.text) return;
  const key = `notice:${n.text}`;
  let dismissed = null;
  try { dismissed = localStorage.getItem(key); } catch { /* private mode */ }
  if (dismissed) return;
  const bar = $('#noticeBar');
  bar.hidden = false;
  bar.dataset.tone = n.tone || 'gold';
  $('#noticeText').textContent = n.text;
  const link = $('#noticeLink');
  if (n.link) {
    link.hidden = false;
    link.href = n.link;
    link.textContent = n.linkText || 'Read more';
  }
  $('#noticeClose').addEventListener('click', () => {
    bar.hidden = true;
    try { localStorage.setItem(key, '1'); } catch { /* private mode */ }
  });
}

function renderBirthday() {
  const b = state.site.birthday;
  if (!b?.enabled || !b.percent) return;
  $('#birthdayCard').hidden = false;
  $('#birthdayPct').textContent = b.percent;
  $('#birthdayWindow').textContent = b.windowDays;
}

function socialEntries() {
  const c = state.site.content || {};
  const build = {
    instagram: (v) => `https://instagram.com/${String(v).replace('@', '')}`,
    facebook: (v) => (/^https?:/i.test(v) ? v : `https://facebook.com/${v}`),
    tiktok: (v) => (/^https?:/i.test(v) ? v : `https://tiktok.com/@${String(v).replace('@', '')}`),
    google: (v) => (/^https?:/i.test(v) ? v : `https://g.page/${v}`),
    youtube: (v) => (/^https?:/i.test(v) ? v : `https://youtube.com/@${String(v).replace('@', '')}`),
    whatsapp: (v) => `https://wa.me/${String(v).replace(/\D/g, '')}`,
  };
  const labels = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    google: 'Google', youtube: 'YouTube', whatsapp: 'WhatsApp',
  };
  const icons = {
    instagram: '📸', facebook: 'f', tiktok: '♪', google: '★', youtube: '▶', whatsapp: '💬',
  };
  return Object.keys(build)
    .filter((key) => String(c[key] || '').trim())
    .map((key) => ({ key, label: labels[key], icon: icons[key], url: build[key](c[key]) }));
}

function renderSocial() {
  const entries = socialEntries();
  const host = $('#socialLinks');
  if (!entries.length) { host.hidden = true; return; }
  host.innerHTML = entries.map((e) => html`
    <a class="social-link" href="${e.url}" target="_blank" rel="noopener" aria-label="${e.label}">
      <span aria-hidden="true">${e.icon}</span><span>${e.label}</span>
    </a>`).join('');

  const contact = $('#contactList');
  if (contact) {
    const c = state.site.content;
    contact.innerHTML = html`
      <div>📍 ${c.address}</div>
      <div>📞 <a href="tel:${String(c.phone || '').replace(/\s/g, '')}">${c.phone}</a></div>
      <div>✉️ <a href="mailto:${c.email}">${c.email}</a></div>
      ${entries.map((e) => html`<div>${e.icon} <a href="${e.url}" target="_blank" rel="noopener">${e.label}</a></div>`)}`;
  }
}

/* ── packages ───────────────────────────────────────────────────────────── */

let activePlan = null;

function renderPackages() {
  const plans = state.site.packages || [];
  if (!plans.length) return;
  $('#packages').hidden = false;
  $('#packageGrid').innerHTML = plans.map((p) => html`
    <article class="pkg-card">
      <div class="pkg-top">
        <span class="pkg-emoji" aria-hidden="true">${p.emoji}</span>
        ${p.savingPence > 0 ? html`<span class="pkg-save">Save ${moneyShort(p.savingPence)}</span>` : raw('')}
      </div>
      <h3>${p.name}</h3>
      <p class="pkg-desc">${p.description}</p>
      <div class="pkg-price"><b>${money(p.price_pence)}</b><small>${p.sessions} paid · ${p.free_sessions} free</small></div>
      <div class="pkg-dots" aria-label="${p.sessions} paid sessions plus ${p.free_sessions} free">
        ${Array.from({ length: p.sessionsTotal }, (_, i) => html`
          <span class="pkg-dot ${i >= p.sessions ? 'free' : ''}" title="${i >= p.sessions ? 'Free session' : `Session ${i + 1}`}"></span>`)}
      </div>
      <ul class="pkg-list">
        ${(p.services || []).map((s) => html`<li>${s.name} · ${s.duration_min} min</li>`)}
      </ul>
      <button class="btn btn-block" type="button" data-buy="${p.id}">Reserve this package</button>
    </article>`).join('');

  on($('#packageGrid'), 'click', '[data-buy]', (e, btn) => {
    const plan = plans.find((p) => p.id === btn.dataset.buy);
    if (!plan) return;
    activePlan = plan;
    $('#pkgFormTitle').textContent = plan.name;
    $('#pkgFormSummary').textContent = `${money(plan.price_pence)} · ${plan.sessionsTotal} sessions (${plan.sessions} paid + ${plan.free_sessions} free) · valid ${plan.validity_days} days. Pay in the salon on your first visit.`;
    $('#pkgFormResult').innerHTML = '';
    $('#packageFormCard').querySelector('.pkg-form-actions').hidden = false;
    $('#packageFormCard').hidden = false;
    $('#packageFormCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  $('#pkgFormClose').addEventListener('click', () => { $('#packageFormCard').hidden = true; });
  $('#pkgBuyBtn').addEventListener('click', purchasePackage);
}

async function purchasePackage() {
  if (!activePlan) return;
  const firstName = $('#pkgFirst').value.trim();
  const phone = $('#pkgPhone').value.trim();
  if (!firstName) { toast('Please add your first name', 'bad'); return; }
  if (phone.replace(/\D/g, '').length < 10) { toast('Please add a valid mobile number', 'bad'); return; }
  const btn = $('#pkgBuyBtn');
  btn.disabled = true;
  try {
    const res = await api(`/api/public/packages/${encodeURIComponent(activePlan.id)}/purchase`, {
      method: 'POST',
      body: {
        customer: {
          firstName,
          lastName: $('#pkgLast').value.trim(),
          phone,
          email: $('#pkgEmail').value.trim(),
        },
        dateOfBirth: $('#pkgDob').value || '',
        marketingOptIn: $('#pkgMarketing').checked,
      },
    });
    $('#pkgFormResult').innerHTML = html`
      <div class="pkg-success">
        <div class="confirm-mark">✓</div>
        <div>
          <b>Reserved — reference ${res.reference}</b>
          <p class="small">Your ${activePlan.name} is held for you. We'll confirm payment in the salon and message you on WhatsApp.</p>
        </div>
      </div>`;
    toast('Package reserved');
    $('#packageFormCard').querySelector('.pkg-form-actions').hidden = true;
  } catch (err) {
    toast(err.message || 'Could not reserve that package', 'bad');
  } finally {
    btn.disabled = false;
  }
}

/* ── reviews ────────────────────────────────────────────────────────────── */

function stars(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(Math.max(0, 5 - full));
}

function renderReviews() {
  const r = state.site.reviews;
  if (!r || !r.items?.length) return;
  $('#reviews').hidden = false;
  $('#reviewsHeadline').textContent = r.headline;
  $('#reviewsSummary').innerHTML = html`
    <span class="stars" aria-hidden="true">${stars(r.average)}</span>
    <b>${r.average.toFixed(1)}</b> out of 5 · ${r.count} review${r.count === 1 ? '' : 's'} on Google`;
  const google = $('#reviewsGoogle');
  if (r.googleUrl) {
    google.hidden = false;
    google.href = r.googleUrl;
  }
  $('#reviewGrid').innerHTML = r.items.map((rev) => html`
    <article class="review">
      <div class="stars" aria-label="${rev.rating} out of 5">${stars(rev.rating)}</div>
      <p>“${rev.body}”</p>
      <footer>
        <b>${rev.author}</b>
        <span>${rev.source === 'google' ? 'Google' : rev.source}${rev.reviewed_at ? ` · ${new Date(`${rev.reviewed_at}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}</span>
      </footer>
    </article>`).join('');
}

function renderServiceTabs() {
  const cats = ['All', ...state.site.categories];
  const host = freshNode('serviceTabs');
  host.innerHTML = cats.map((c) => html`
    <button class="tab" role="tab" data-cat="${c}" aria-selected="${c === state.category}">${c}</button>`).join('');
  on(host, 'click', '.tab', (e, btn) => {
    state.category = btn.dataset.cat;
    renderServiceTabs();
    renderServices();
  });
}

function renderServices() {
  const list = state.site.services.filter((s) => state.category === 'All' || s.category === state.category);
  $('#serviceGrid').innerHTML = list.map((s) => {
    const selected = state.serviceIds.includes(s.id);
    return html`
      <button class="svc" data-service="${s.id}" data-selected="${selected}" aria-pressed="${selected}">
        <div class="svc-top">
          <h4>${s.name}</h4>
          <span class="svc-price">${moneyShort(s.price_pence)}</span>
        </div>
        <p class="svc-desc">${s.description}</p>
        <div class="svc-meta">
          <span>${s.duration_min} min</span>
          <span>${s.category}</span>
          <span class="svc-add">${selected ? 'Added ✓' : '+ Add'}</span>
        </div>
      </button>`;
  }).join('');
}

function renderTeam() {
  $('#teamGrid').innerHTML = state.site.staff.map((m) => html`
    <article class="member">
      <div class="member-face" style="--c:${m.colour}">${(m.name || '?').split(' ').map((w) => w[0]).join('')}</div>
      <div class="member-body">
        <h4>${m.name}</h4>
        <div class="member-role">${m.title}</div>
        <p>${m.bio}</p>
      </div>
    </article>`).join('');
}

function renderHours() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date().getDay();
  $('#hoursList').innerHTML = state.site.hours
    .slice()
    .sort((a, b) => (a.weekday === 0 ? 7 : a.weekday) - (b.weekday === 0 ? 7 : b.weekday))
    .map((h) => html`
      <div class="hours-row ${h.closed ? 'closed' : ''}">
        <span>${days[h.weekday]}${h.weekday === today ? ' · today' : ''}</span>
        <span>${h.closed ? 'Closed' : `${h.open_time} – ${h.close_time}`}</span>
      </div>`).join('');

  const c = state.site.content;
  const socials = socialEntries();
  $('#contactList').innerHTML = html`
    <div>📍 ${c.address}</div>
    <div>📞 <a href="tel:${String(c.phone || '').replace(/\s/g, '')}">${c.phone}</a></div>
    <div>✉️ <a href="mailto:${c.email}">${c.email}</a></div>
    ${socials.map((e) => html`<div>${e.icon} <a href="${e.url}" target="_blank" rel="noopener">${e.label}</a></div>`)}`;
}

async function updateFloatSlot() {
  try {
    const res = await api(`/api/public/availability?serviceIds=svc_cut&date=${todayStr()}`);
    const next = res.slots?.[0];
    if (next) {
      const t = new Date(next.start).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
      $('#floatSlot').textContent = `Today · ${t}`;
    } else if (res.slots?.length === 0) {
      $('#floatSlot').textContent = 'Tomorrow · book online';
    }
  } catch { /* cosmetic only */ }
}

/* ── wizard shell ───────────────────────────────────────────────────────── */

function renderSteps() {
  $('#steps').innerHTML = STEPS.map((label, i) => html`
    <div class="step-pill" data-state="${i === state.step ? 'active' : (i < state.step ? 'done' : 'todo')}">
      <b>${i < state.step ? '✓' : i + 1}</b><span>${label}</span>
    </div>`).join('');
}

/* Replacing the node drops delegated listeners, so re-renders never double-bind. */
function freshNode(id) {
  const old = document.getElementById(id);
  if (!old) return null;
  const next = old.cloneNode(false);
  old.replaceWith(next);
  return next;
}

function updateFoot() {
  const back = $('#backBtn');
  const next = $('#nextBtn');
  back.style.visibility = state.step === 0 || state.step === 4 ? 'hidden' : 'visible';
  if (state.step === 4) {
    next.textContent = 'Book another';
    next.style.visibility = 'visible';
  } else if (state.step === 3) {
    next.textContent = 'Confirm booking';
    next.style.visibility = 'visible';
  } else {
    next.textContent = 'Continue';
    next.style.visibility = 'visible';
  }
  next.disabled = state.loading;

  const parts = [];
  if (state.serviceIds.length) {
    parts.push(`${state.serviceIds.length} service${state.serviceIds.length > 1 ? 's' : ''} · ${totalDuration()} min · ${moneyShort(totalPrice())}`);
  }
  if (state.step > 1 && state.slot) {
    const staff = state.slots.find((s) => s.start === state.slot);
    parts.push(`${longDate(state.date)} at ${new Date(state.slot).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${staff ? ` with ${staff.staffName}` : ''}`);
  }
  $('#wizardSummary').textContent = parts.join(' — ');
}

function renderStep() {
  renderSteps();
  updateFoot();
  const body = freshNode('wizardBody');
  if (state.step === 0) return renderServiceStep(body);
  if (state.step === 1) return renderStaffStep(body);
  if (state.step === 2) return renderTimeStep(body);
  if (state.step === 3) return renderDetailsStep(body);
  return renderConfirmation(body);
}

function bindChrome() {
  on(document, 'click', '.svc', (e, btn) => {
    toggleService(btn.dataset.service);
    renderServices();
    if (state.step === 0) renderStep();
    else updateFoot();
  });

  $('#nextBtn').addEventListener('click', next);
  $('#backBtn').addEventListener('click', () => {
    if (state.step > 0) { state.step -= 1; renderStep(); }
  });

  $('#menuToggle').addEventListener('click', (e) => {
    const open = $('#nav').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  $('#lookupBtn').addEventListener('click', lookupBooking);

  on(document, 'click', '#nav a', () => {
    $('#nav').classList.remove('open');
    $('#menuToggle').setAttribute('aria-expanded', 'false');
  });
}

function toggleService(id) {
  const i = state.serviceIds.indexOf(id);
  if (i >= 0) state.serviceIds.splice(i, 1);
  else if (state.serviceIds.length >= 4) { toast('Up to four services per booking', 'bad'); return; }
  else state.serviceIds.push(id);
  state.slot = null;
  state.slots = [];
}

async function next() {
  if (state.step === 0) {
    if (!state.serviceIds.length) { toast('Choose at least one service', 'bad'); return; }
    state.step = 1; renderStep(); return;
  }
  if (state.step === 1) {
    state.step = 2;
    renderStep();
    if (!state.month) {
      await loadMonth(todayStr().slice(0, 7));
      if (state.step === 2) renderStep();
    }
    return;
  }
  if (state.step === 2) {
    if (!state.slot) { toast('Pick a time', 'bad'); return; }
    state.step = 3; renderStep(); return;
  }
  if (state.step === 3) {
    if (state.loading) return;
    await submitBooking();
    return;
  }
  if (state.step === 4) {
    state.step = 0; state.serviceIds = []; state.slot = null; state.slots = [];
    state.date = null; state.month = null; state.confirmation = null;
    renderServices(); renderStep();
    document.getElementById('services').scrollIntoView({ behavior: 'smooth' });
  }
}

/* ── step 1: services ───────────────────────────────────────────────────── */

function renderServiceStep(body) {
  const cats = [...new Set(state.site.services.map((s) => s.category))];
  const basket = selectedServices();
  body.innerHTML = html`
    <h3>What are we doing today?</h3>
    <p class="hint">Choose one or more treatments. We'll find a slot long enough for all of them.</p>
    ${basket.length ? html`<div class="basket">${basket.map((s) => html`
      <span class="chip">${s.name} <button type="button" data-remove="${s.id}" aria-label="Remove ${s.name}">×</button></span>`)}
    </div>` : raw('')}
    ${cats.map((cat) => html`
      <h4 style="margin:1.2rem 0 .6rem;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)">${cat}</h4>
      <div class="pick-grid">
        ${state.site.services.filter((s) => s.category === cat).map((s) => html`
          <button class="pick" type="button" data-pick="${s.id}" aria-pressed="${state.serviceIds.includes(s.id)}">
            <span class="avatar" style="--c:var(--plum);background:${state.serviceIds.includes(s.id) ? 'var(--plum)' : '#efe4d8'};color:${state.serviceIds.includes(s.id) ? '#fff' : 'var(--plum)'}">${state.serviceIds.includes(s.id) ? '✓' : '+'}</span>
            <span>
              <b>${s.name}</b>
              <small>${s.duration_min} min · ${moneyShort(s.price_pence)}</small>
            </span>
          </button>`)}
      </div>`)}
  `;
  on(body, 'click', '[data-pick]', (e, btn) => {
    toggleService(btn.dataset.pick);
    renderServices();
    renderStep();
  });
  on(body, 'click', '[data-remove]', (e, btn) => {
    toggleService(btn.dataset.remove);
    renderServices();
    renderStep();
  });
}

/* ── step 2: staff ──────────────────────────────────────────────────────── */

function renderStaffStep(body) {
  const qualified = state.site.staff.filter((m) => state.serviceIds.every((id) => m.serviceIds.includes(id)));
  const pool = qualified.length ? qualified : state.site.staff;
  body.innerHTML = html`
    <h3>Who would you like?</h3>
    <p class="hint">Anyone free is usually the fastest way to get the time you want.</p>
    <div class="pick-grid">
      <button class="pick" type="button" data-staff="any" aria-pressed="${state.staffId === 'any'}">
        <span class="avatar" style="--c:var(--gold)">✦</span>
        <span><b>Any available</b><small>First stylist free at your chosen time</small></span>
      </button>
      ${pool.map((m) => html`
        <button class="pick" type="button" data-staff="${m.id}" aria-pressed="${state.staffId === m.id}">
          <span class="avatar" style="--c:${m.colour}">${(m.name || '?').split(' ').map((w) => w[0]).join('')}</span>
          <span><b>${m.name}</b><small>${m.title}</small></span>
        </button>`)}
    </div>`;
  on(body, 'click', '[data-staff]', (e, btn) => {
    state.staffId = btn.dataset.staff;
    state.slot = null;
    renderStep();
  });
}

/* ── step 3: date & time ────────────────────────────────────────────────── */

function renderTimeStep(body) {
  body.innerHTML = html`
    <h3>When suits you?</h3>
    <p class="hint">Gold dots mark days with availability. Times shown are the start of your appointment.</p>
    <div class="cal-nav">
      <button class="btn btn-ghost btn-sm" type="button" data-month="-1">←</button>
      <b>${state.month ? new Date(`${state.month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'Loading…'}</b>
      <button class="btn btn-ghost btn-sm" type="button" data-month="1">→</button>
    </div>
    <div class="cal" id="calGrid"></div>
    <div id="slotArea"></div>`;
  renderCalendar();
  renderSlots();

  on(body, 'click', '[data-month]', async (e, btn) => {
    const [y, m] = state.month.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(btn.dataset.month), 1);
    await loadMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    renderStep();
  });
  on(body, 'click', '.cal-day', async (e, btn) => {
    if (btn.disabled) return;
    state.date = btn.dataset.date;
    state.slot = null;
    await loadSlots();
    renderCalendar();
    renderSlots();
    updateFoot();
  });
  on(body, 'click', '.slot', (e, btn) => {
    state.slot = btn.dataset.start;
    $$('.slot', body).forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.start === state.slot)));
    updateFoot();
  });
}

function renderCalendar() {
  const grid = $('#calGrid');
  if (!grid || !state.month) return;
  const [y, m] = state.month.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const offset = (firstDow + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const today = todayStr();
  const cells = [];
  for (const d of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) cells.push(`<div class="cal-dow">${d}</div>`);
  for (let i = 0; i < offset; i++) cells.push('<div></div>');
  for (let day = 1; day <= days; day++) {
    const date = `${state.month}-${String(day).padStart(2, '0')}`;
    const info = state.dayCounts[date] || 0;
    const disabled = date < today || info === 0;
    cells.push(html`<button class="cal-day" type="button" data-date="${date}" data-free="${info}"
      aria-selected="${state.date === date}" ${disabled ? 'disabled' : ''}>
      ${day}${info > 0 ? raw('<span class="pip"></span>') : raw('')}
    </button>`);
  }
  grid.innerHTML = cells.join('');
}

function renderSlots() {
  const area = $('#slotArea');
  if (!area) return;
  if (!state.date) {
    area.innerHTML = `<p class="hint" style="margin-top:1rem">Pick a day to see times.</p>`;
    return;
  }
  if (!state.slots.length) {
    area.innerHTML = html`<p class="hint" style="margin-top:1rem">No slots left on ${longDate(state.date)}. Try another day or join the waitlist below.</p>`;
    return;
  }
  area.innerHTML = html`
    <h4 style="margin:1.2rem 0 .2rem;font-size:.95rem">${longDate(state.date)}</h4>
    <div class="slots">
      ${state.slots.map((s) => html`
        <button class="slot" type="button" data-start="${s.start}" aria-pressed="${state.slot === s.start}">
          ${new Date(s.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          <small>${s.staffName.split(' ')[0]}</small>
        </button>`)}
    </div>`;
}

async function loadMonth(month) {
  state.month = month;
  state.dayCounts = {};
  state.loading = true;
  try {
    const res = await api(`/api/public/availability/month?serviceIds=${state.serviceIds.join(',')}&staffId=${state.staffId}&month=${month}`);
    state.dayCounts = Object.fromEntries(res.days.map((d) => [d.date, d.count]));
  } catch {
    state.dayCounts = {};
  } finally {
    state.loading = false;
  }
  if (!state.date || state.date.slice(0, 7) !== month) {
    const today = todayStr();
    const free = Object.keys(state.dayCounts).filter((d) => state.dayCounts[d] > 0 && d >= today).sort()[0];
    state.date = free || null;
  }
  if (state.date) await loadSlots();
}

async function loadSlots() {
  if (!state.date) { state.slots = []; return; }
  state.loading = true;
  updateFoot();
  try {
    const res = await api(`/api/public/availability?serviceIds=${state.serviceIds.join(',')}&staffId=${state.staffId}&date=${state.date}`);
    state.slots = res.slots || [];
  } catch {
    state.slots = [];
  } finally {
    state.loading = false;
    updateFoot();
  }
}

/* ── step 4: details ────────────────────────────────────────────────────── */

function renderDetailsStep(body) {
  const c = state.customer;
  body.innerHTML = html`
    <h3>Almost there</h3>
    <p class="hint">We only use these details for your appointment. Marketing is optional.</p>
    <div class="field-grid">
      <div class="field"><label for="fFirst">First name *</label>
        <input id="fFirst" value="${c.firstName}" autocomplete="given-name" required></div>
      <div class="field"><label for="fLast">Last name</label>
        <input id="fLast" value="${c.lastName}" autocomplete="family-name"></div>
      <div class="field"><label for="fPhone">Mobile *</label>
        <input id="fPhone" value="${c.phone}" autocomplete="tel" placeholder="07700 900123" required></div>
      <div class="field"><label for="fEmail">Email</label>
        <input id="fEmail" type="email" value="${c.email}" autocomplete="email"></div>
      <div class="field"><label for="fDob">Date of birth (optional)</label>
        <input id="fDob" type="date" value="${c.dateOfBirth}">
        <span class="small muted">Used only for your birthday treat.</span></div>
      <div class="field full"><label for="fNotes">Anything we should know?</label>
        <textarea id="fNotes" rows="2" placeholder="Allergies, parking, a stylist you'd rather not see…">${c.notes}</textarea></div>
      <div class="field full">
        <label class="check"><input type="checkbox" id="fMarketing" ${c.marketingOptIn ? 'checked' : ''}>
        Send me occasional offers on WhatsApp. I can reply STOP at any time.</label>
      </div>
    </div>
    <div class="hours-card" style="margin-top:1.2rem;padding:1rem 1.1rem">
      <div class="detail-table" style="margin:0;max-width:none">
        <div><span>Services</span><b>${selectedServices().map((s) => s.name).join(' + ')}</b></div>
        <div><span>Total time</span><b>${totalDuration()} minutes</b></div>
        <div><span>Total price</span><b>${money(totalPrice())}</b></div>
        <div><span>When</span><b>${longDate(state.date)}, ${state.slot ? new Date(state.slot).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}</b></div>
      </div>
    </div>`;
  for (const [id, key] of [['fFirst', 'firstName'], ['fLast', 'lastName'], ['fPhone', 'phone'], ['fEmail', 'email'], ['fDob', 'dateOfBirth'], ['fNotes', 'notes']]) {
    const input = document.getElementById(id);
    input.addEventListener('input', () => { state.customer[key] = input.value; });
  }
  document.getElementById('fMarketing').addEventListener('change', (e) => { state.customer.marketingOptIn = e.target.checked; });
}

async function submitBooking() {
  const c = state.customer;
  if (!c.firstName.trim()) { toast('Please add your first name', 'bad'); return; }
  if (String(c.phone).replace(/\D/g, '').length < 10) { toast('Please add a valid mobile number', 'bad'); return; }

  state.loading = true;
  updateFoot();
  try {
    const res = await api('/api/public/bookings', {
      method: 'POST',
      body: {
        serviceIds: state.serviceIds,
        staffId: state.staffId,
        start: state.slot,
        customer: c,
        notes: c.notes,
      },
    });
    state.confirmation = res;
    state.step = 4;
    renderStep();
    document.getElementById('wizard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (err) {
    if (err.code === 'slot_taken') {
      toast('That time just went. Pick another.', 'bad');
      state.step = 2;
      await loadSlots();
      renderStep();
    } else {
      toast(err.message || 'Could not book that', 'bad');
    }
  } finally {
    state.loading = false;
    updateFoot();
  }
}

function renderConfirmation(body) {
  const a = state.confirmation?.appointment;
  if (!a) { body.innerHTML = '<p>Nothing to show.</p>'; return; }
  body.innerHTML = html`
    <div class="confirm-card">
      <div class="confirm-mark">✓</div>
      <h3>You're booked</h3>
      <div class="ref">${a.reference}</div>
      <p class="hint">We've sent a confirmation to your WhatsApp. Show this reference when you arrive.</p>
      <div class="detail-table">
        <div><span>Name</span><b>${a.first_name} ${a.last_name}</b></div>
        <div><span>Services</span><b>${a.items.map((i) => i.name_snapshot).join(' + ')}</b></div>
        <div><span>When</span><b>${longDate(a.date)} at ${a.time}</b></div>
        <div><span>With</span><b>${a.staff_name}</b></div>
        ${a.discount_pence ? html`<div><span>Discount</span><b>−${money(a.discount_pence)}</b></div>` : raw('')}
        <div><span>Total</span><b>${money(a.total_pence)}</b></div>
      </div>
      <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1.4rem;flex-wrap:wrap">
        ${state.confirmation.whatsappLink ? raw(`<a class="btn btn-gold" href="${escapeHtml(state.confirmation.whatsappLink)}" target="_blank" rel="noopener">Open WhatsApp</a>`) : raw('')}
        <a class="btn btn-ghost" href="#lookup">Manage booking</a>
      </div>
    </div>`;
}

/* ── lookup ─────────────────────────────────────────────────────────────── */

async function lookupBooking() {
  const ref = document.getElementById('lookupRef').value.trim().toUpperCase();
  const phone = document.getElementById('lookupPhone').value.trim();
  const out = document.getElementById('lookupResult');
  if (!ref || !phone) { toast('Enter your reference and phone', 'bad'); return; }
  out.innerHTML = '<p class="hint">Looking…</p>';
  try {
    const { appointment } = await api(`/api/public/bookings/${encodeURIComponent(ref)}?phone=${encodeURIComponent(phone)}`);
    out.innerHTML = html`
      <div class="hours-card" style="margin-top:1rem">
        <div class="svc-top"><h4>${appointment.items.map((i) => i.name_snapshot).join(' + ')}</h4>
          <span class="chip">${appointment.status.replace('_', ' ')}</span></div>
        <div class="detail-table">
          <div><span>When</span><b>${longDate(appointment.date)} at ${appointment.time}</b></div>
          <div><span>With</span><b>${appointment.staff_name}</b></div>
          ${appointment.discount_pence ? html`<div><span>Discount</span><b>−${money(appointment.discount_pence)}</b></div>` : raw('')}
          <div><span>Total</span><b>${money(appointment.total_pence)}</b></div>
        </div>
        ${appointment.status === 'cancelled' ? raw('<p class="hint">This booking is cancelled.</p>') : raw(`
          <button class="btn btn-danger btn-sm" style="margin-top:1rem" id="cancelBooking">Cancel this booking</button>`)}
      </div>`;
    const cancelBtn = document.getElementById('cancelBooking');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (!confirm('Cancel this appointment?')) return;
        try {
          await api(`/api/public/bookings/${encodeURIComponent(ref)}/cancel`, {
            method: 'POST', body: { phone, reason: 'Client cancelled online' },
          });
          toast('Cancelled — we hope to see you soon');
          lookupBooking();
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    }
  } catch (err) {
    out.innerHTML = html`<p class="hint" style="color:var(--bad)">${err.message}</p>`;
  }
}
