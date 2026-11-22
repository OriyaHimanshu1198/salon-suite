import {
  api, html, raw, money, moneyShort, $, $$, on, toast, escapeHtml,
  longDate, shortDate, todayStr, addDaysStr, weekStartStr, titleCase, initials, debounce,
} from './api.js';

const state = {
  user: null,
  salon: null,
  view: 'dashboard',
  date: todayStr(),
  rotaWeek: weekStartStr(todayStr()),
  staff: [],
  services: [],
  site: null,
  salesFrom: null,
  salesTo: null,
};

/* ══ boot ═══════════════════════════════════════════════════════════════ */

boot();

async function boot() {
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    state.salon = me.salon;
    showApp();
  } catch {
    $('#loginScreen').classList.remove('hidden');
  }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn');
  btn.disabled = true;
  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email: $('#email').value, password: $('#password').value },
    });
    state.user = res.user;
    state.salon = res.salon;
    showApp();
    toast(`Welcome back, ${res.user.name.split(' ')[0]}`);
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false;
  }
});

function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = state.user.role;
  $('#userAvatar').textContent = initials(state.user.name);
  $('#sideName').textContent = (state.salon?.name || 'Salon').split(' ')[0];

  const hidden = { staff: ['team', 'rota', 'settings', 'sales', 'treatwell'], reception: ['settings', 'sales', 'treatwell'] }[state.user.role] || [];
  $$('#sideNav a').forEach((a) => {
    if (hidden.includes(a.dataset.view)) a.style.display = 'none';
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.reload();
  });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', route);

  refreshMessageCount();
  if (!location.hash) location.hash = '#/dashboard';
  route();
}

function route() {
  const view = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  state.view = view;
  $$('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
  $('#sidebar').classList.remove('open');
  const render = {
    dashboard, calendar, clients, packages, services, team, rota, sales, website, messages, reports, settings, treatwell,
  }[view];
  if (!render) { location.hash = '#/dashboard'; return; }
  const host = document.getElementById('view');
  const fresh = host.cloneNode(false);
  host.replaceWith(fresh);
  fresh.innerHTML = '<div class="card"><div class="empty">Loading…</div></div>';
  render().catch((err) => {
    fresh.innerHTML = `<div class="card"><div class="empty">${escapeHtml(err.message)}</div></div>`;
  });
}

function setHeader(title, sub, actions = '') {
  $('#pageTitle').textContent = title;
  $('#pageSub').textContent = sub || '';
  const host = document.getElementById('topbarActions');
  const fresh = host.cloneNode(false);
  host.replaceWith(fresh);
  fresh.innerHTML = actions;
}

function statusBadge(status) {
  return `<span class="badge badge-${status}">${titleCase(status)}</span>`;
}

async function refreshMessageCount() {
  try {
    const res = await api('/api/admin/notifications?status=queued&limit=100');
    const n = (res.counts?.queued || 0);
    const el = $('#msgCount');
    el.textContent = n > 99 ? '99+' : n;
    el.classList.toggle('hidden', n === 0);
  } catch { /* ignore */ }
}

/* ══ modal helpers ══════════════════════════════════════════════════════ */

function openModal({ title, body, footer = '', wide = false, onMount }) {
  const root = $('#modalRoot');
  root.innerHTML = html`
    <div class="modal-backdrop" data-close="1">
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <header><h3>${title}</h3><button class="icon-btn" type="button" data-close="1" aria-label="Close">×</button></header>
        <div class="body">${raw(body)}</div>
        <footer>${raw(footer || '<button class="btn btn-ghost" type="button" data-close="1">Close</button>')}</footer>
      </div>
    </div>`;
  root.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', (e) => { if (e.target === el) closeModal(); });
  });
  document.addEventListener('keydown', escClose);
  onMount?.(root.querySelector('.modal'));
  return root.querySelector('.modal');
}

function closeModal() {
  $('#modalRoot').innerHTML = '';
  document.removeEventListener('keydown', escClose);
}

function escClose(e) { if (e.key === 'Escape') closeModal(); }

function formValues(form) {
  const out = {};
  for (const el of form.querySelectorAll('[name]')) {
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

/* ══ dashboard ══════════════════════════════════════════════════════════ */

async function dashboard() {
  const data = await api(`/api/admin/dashboard?date=${state.date}`);
  const k = data.kpis;
  setHeader('Dashboard', longDate(state.date), `
    <button class="btn btn-ghost btn-sm" data-day="-1">←</button>
    <input type="date" id="dashDate" value="${state.date}" style="border:1px solid var(--line);border-radius:9px;padding:.4rem .5rem">
    <button class="btn btn-ghost btn-sm" data-day="1">→</button>
    <button class="btn btn-sm" id="newBooking">+ New booking</button>`);

  $('#dashDate').addEventListener('change', (e) => { state.date = e.target.value; dashboard(); });
  on($('#topbarActions'), 'click', '[data-day]', (e, btn) => {
    state.date = addDaysStr(state.date, Number(btn.dataset.day));
    dashboard();
  });
  $('#newBooking').addEventListener('click', () => bookingModal());

  $('#view').innerHTML = html`
    <div class="grid grid-4">
      <div class="kpi"><span>Takings</span><b>${money(k.revenuePence)}</b><small>${money(k.projectedPence)} booked today</small></div>
      <div class="kpi"><span>Appointments</span><b>${k.bookings}</b><small>${k.completed} completed · ${k.noShows} no-show</small></div>
      <div class="kpi"><span>Utilisation</span><b>${k.utilisation}%</b><small>of rostered time</small></div>
      <div class="kpi"><span>New clients</span><b>${k.newClients}</b><small>${k.unreadAlerts} unread alerts</small></div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>${longDate(state.date)}</h3>
        <span class="hint">${data.appointments.length} appointments · ${data.shifts.length} shifts rostered</span>
      </div>
      <div class="appt-list">
        ${data.appointments.length ? data.appointments.map((a) => html`
          <div class="appt">
            <span class="time">${a.time}</span>
            <span class="bar" style="--c:${a.staff_colour}"></span>
            <span class="who">
              <b>${a.first_name} ${a.last_name}</b>
              <small>${a.items.map((i) => i.name_snapshot).join(' + ')} · ${a.staff_name} · ${money(a.total_pence)}</small>
            </span>
            <span class="acts">
              ${statusBadge(a.status)}
              ${a.status === 'confirmed' ? raw(`<button class="btn btn-ghost btn-xs" data-status="arrived" data-id="${a.id}">Arrived</button>`) : raw('')}
              ${['confirmed', 'arrived'].includes(a.status) ? raw(`<button class="btn btn-ghost btn-xs" data-status="completed" data-id="${a.id}">Complete</button>`) : raw('')}
              ${['confirmed', 'arrived'].includes(a.status) ? raw(`<button class="btn btn-ghost btn-xs" data-status="no_show" data-id="${a.id}">No-show</button>`) : raw('')}
              ${a.status !== 'cancelled' ? raw(`<button class="btn btn-ghost btn-xs" data-open="${a.id}">Open</button>`) : raw('')}
            </span>
          </div>`).join('') : '<div class="empty">Nothing booked. A quiet day — or a chance to fill it.</div>'}
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Today by team</h3><span class="hint">services + packages</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Team</th><th class="num">Services</th><th class="num">Packages</th><th class="num">Total</th></tr></thead>
          <tbody>${data.teamSales.staff.map((m) => `
            <tr>
              <td><b>${escapeHtml(m.name)}</b><br><span class="small muted">${m.appointments} appointments · ${m.servicesSold} services</span></td>
              <td class="num">${money(m.serviceRevenue)}</td>
              <td class="num">${m.packagesSold ? money(m.packageRevenue) : '—'}<br><span class="small muted">${m.packagesSold} sold</span></td>
              <td class="num"><b>${money(m.totalRevenue)}</b></td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty">No sales yet today.</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Birthdays this week</h3>
          <button class="btn btn-ghost btn-xs" id="runBirthdays">Send today's wishes</button>
        </div>
        ${data.birthdays.length ? data.birthdays.map((b) => html`
          <div class="conflict">
            <span class="tag">🎂 ${shortDate(b.date)}</span>
            <span><b>${b.first_name} ${b.last_name}</b><br><span class="small muted">${b.phone}</span></span>
          </div>`).join('') : '<div class="empty">No birthdays in the next seven days.</div>'}
      </div>
    </div>`;

  on($('#view'), 'click', '[data-status]', async (e, btn) => {
    try {
      await api(`/api/admin/appointments/${btn.dataset.id}/status`, {
        method: 'POST', body: { status: btn.dataset.status },
      });
      toast('Updated');
      dashboard();
      refreshMessageCount();
    } catch (err) { toast(err.message, 'bad'); }
  });
  on($('#view'), 'click', '[data-open]', (e, btn) => appointmentModal(btn.dataset.open));
  const runBtn = $('#runBirthdays');
  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/birthdays/run', { method: 'POST', body: {} });
        toast(r.skipped === 'already_run' ? "Today's birthday messages already sent" : `Queued ${r.queued} birthday message${r.queued === 1 ? '' : 's'}`);
        refreshMessageCount();
      } catch (err) { toast(err.message, 'bad'); }
    });
  }
}

async function appointmentModal(id) {
  const { appointment: a } = await api(`/api/admin/appointments/${id}`);
  let pkgs = [];
  try { pkgs = (await api(`/api/admin/customers/${a.customer_id}/packages`)).purchases || []; } catch { /* non-fatal */ }
  const itemServiceIds = a.items.map((i) => i.service_id);
  const usable = pkgs.filter((p) => p.status === 'active' && p.sessions_left > 0
    && (p.plan?.serviceIds || []).some((sid) => itemServiceIds.includes(sid)));
  const body = html`
    <div class="client-head">
      <div class="avatar">${initials(`${a.first_name} ${a.last_name}`)}</div>
      <div>
        <h4>${a.first_name} ${a.last_name} ${statusBadge(a.status)}</h4>
        <div class="small muted">${a.reference} · ${a.phone} · ${a.source}</div>
      </div>
    </div>
    <div class="form-grid">
      <div><span class="small muted">When</span><br><b>${longDate(a.date)} ${a.time}–${a.endTime}</b></div>
      <div><span class="small muted">With</span><br><b>${a.staff_name}</b></div>
      <div><span class="small muted">Services</span><br><b>${a.items.map((i) => i.name_snapshot).join(' + ')}</b></div>
      <div><span class="small muted">Total</span><br><b>${money(a.total_pence)}</b> <span class="small muted">paid ${money(a.paid_pence)}</span>
        ${a.discount_pence ? html`<br><span class="small muted">discount applied ${money(a.discount_pence)}</span>` : raw('')}</div>
    </div>
    ${a.customer_notes || a.allergies || a.formula_notes ? html`
      <div class="card" style="margin-top:1rem;background:#fbf7f2">
        ${a.allergies ? html`<div class="small"><b>Allergies:</b> ${a.allergies}</div>` : raw('')}
        ${a.formula_notes ? html`<div class="small"><b>Formula:</b> ${a.formula_notes}</div>` : raw('')}
        ${a.customer_notes ? html`<div class="small"><b>Notes:</b> ${a.customer_notes}</div>` : raw('')}
      </div>` : raw('')}
    <div class="form-grid" style="margin-top:1rem">
      <div class="field full"><label>Appointment notes</label><textarea name="notes" rows="2">${a.notes}</textarea></div>
      <div class="field full"><label>Internal notes</label><textarea name="internal" rows="2">${a.internal_notes}</textarea></div>
      <div class="field"><label>Take payment (£)</label><input name="pay" type="number" min="0" step="0.01" placeholder="0.00"></div>
      <div class="field"><label>Method</label>
        <select name="method"><option value="card">Card</option><option value="cash">Cash</option><option value="transfer">Transfer</option></select>
      </div>
    </div>
    ${usable.length ? html`
      <div class="card" style="margin-top:1rem;background:#f7f3ec">
        <div class="card-head"><h3>Package session</h3><span class="hint">${usable.length} available</span></div>
        <div class="row">
          <select name="pkgId">${usable.map((p) => `<option value="${p.id}">${escapeHtml(p.plan_name)} — ${p.sessions_left} left${p.free_left ? ` · ${p.free_left} free` : ''}</option>`).join('')}</select>
          <button class="btn btn-sm" type="button" id="redeemPkg">Use a session</button>
        </div>
        <p class="small muted" style="margin:.5rem 0 0">Redeeming marks the covered services as paid by the package and reduces this appointment's balance.</p>
      </div>` : raw('')}`;

  const modal = openModal({
    title: 'Appointment',
    body,
    footer: `
      <button class="btn btn-ghost" type="button" data-close="1">Close</button>
      <button class="btn btn-ghost" type="button" id="saveAppt">Save notes</button>
      <button class="btn btn-gold" type="button" id="payBtn">Record payment</button>`,
    wide: true,
  });

  modal.querySelector('#saveAppt').addEventListener('click', async () => {
    try {
      await api(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        body: { notes: modal.querySelector('[name="notes"]').value, internalNotes: modal.querySelector('[name="internal"]').value },
      });
      toast('Saved');
      closeModal();
      route();
    } catch (err) { toast(err.message, 'bad'); }
  });

  modal.querySelector('#payBtn').addEventListener('click', async () => {
    const amount = Math.round(Number(modal.querySelector('[name="pay"]').value || 0) * 100);
    if (!amount) { toast('Enter an amount', 'bad'); return; }
    try {
      await api(`/api/admin/appointments/${id}/payment`, {
        method: 'POST', body: { amountPence: amount, method: modal.querySelector('[name="method"]').value },
      });
      toast('Payment recorded');
      closeModal();
      route();
    } catch (err) { toast(err.message, 'bad'); }
  });

  const redeemBtn = modal.querySelector('#redeemPkg');
  if (redeemBtn) {
    redeemBtn.addEventListener('click', async () => {
      const purchaseId = modal.querySelector('[name="pkgId"]').value;
      if (!purchaseId || !confirm('Use one session from this package for this appointment?')) return;
      try {
        const out = await api(`/api/admin/package-purchases/${purchaseId}/redeem`, {
          method: 'POST', body: { appointmentId: id },
        });
        toast(out.isFree ? 'Free session used' : 'Package session used');
        closeModal();
        route();
        refreshMessageCount();
      } catch (err) { toast(err.message, 'bad'); }
    });
  }
}

/* ══ calendar ═══════════════════════════════════════════════════════════ */

async function calendar() {
  const data = await api(`/api/admin/dashboard?date=${state.date}`);
  setHeader('Calendar', longDate(state.date), `
    <input type="date" id="calDate" value="${state.date}" style="border:1px solid var(--line);border-radius:9px;padding:.4rem .5rem">
    <button class="btn btn-sm" id="newBooking">+ New booking</button>`);
  $('#calDate').addEventListener('change', (e) => { state.date = e.target.value; calendar(); });
  $('#newBooking').addEventListener('click', () => bookingModal(state.date));

  const byStaff = data.staff.map((m) => ({
    ...m,
    appointments: data.appointments.filter((a) => a.staff_id === m.id),
    shift: data.shifts.find((s) => s.staff_id === m.id),
  }));

  $('#view').innerHTML = html`
    <div class="card">
      <div class="cal-toolbar" style="margin-bottom:1rem">
        <button class="btn btn-ghost btn-sm" data-day="-1">← Previous</button>
        <button class="btn btn-ghost btn-sm" data-day="0">Today</button>
        <button class="btn btn-ghost btn-sm" data-day="1">Next →</button>
        <span class="spacer"></span>
        <span class="small muted">${data.appointments.length} booked · ${data.staff.length} team members</span>
      </div>
      <div class="day-grid">
        ${byStaff.map((m) => html`
          <div class="day-col" style="--c:${m.colour}">
            <header>
              <span>${m.name}</span>
              <span class="small muted">${m.shift ? `${m.shift.start_time}–${m.shift.end_time}` : 'Off'}</span>
            </header>
            <div class="slot-list">
              ${m.appointments.length ? m.appointments.map((a) => html`
                <div class="mini-appt" style="--c:${m.colour}" data-open="${a.id}">
                  <b>${a.time} · ${a.first_name} ${a.last_name}</b>
                  <small>${a.items.map((i) => i.name_snapshot).join(' + ')}</small>
                  <div>${statusBadge(a.status)}</div>
                </div>`).join('') : '<div class="small muted" style="padding:.3rem">No bookings</div>'}
            </div>
          </div>`)}
      </div>
    </div>`;

  on($('#view'), 'click', '[data-day]', (e, btn) => {
    const n = Number(btn.dataset.day);
    state.date = n === 0 ? todayStr() : addDaysStr(state.date, n);
    calendar();
  });
  on($('#view'), 'click', '[data-open]', (e, btn) => appointmentModal(btn.dataset.open));
}

/* ══ booking modal ══════════════════════════════════════════════════════ */

async function bookingModal(date = state.date) {
  if (!state.services.length) {
    const [s, t] = await Promise.all([api('/api/admin/services'), api('/api/admin/staff')]);
    state.services = s.services;
    state.staff = t.staff;
  }
  const services = state.services.filter((s) => s.active);
  const staff = state.staff.filter((s) => s.active);

  const body = html`
    <div class="form-grid">
      <div class="field full">
        <label>Client</label>
        <input name="clientSearch" placeholder="Search by name or phone — leave blank to add a new client" autocomplete="off">
        <div id="clientHits" class="small"></div>
      </div>
      <div class="field"><label>First name</label><input name="firstName" required></div>
      <div class="field"><label>Last name</label><input name="lastName"></div>
      <div class="field"><label>Mobile</label><input name="phone" required placeholder="07700 900123"></div>
      <div class="field"><label>Email</label><input name="email" type="email"></div>
      <div class="field full"><label>Services</label>
        <select name="serviceIds" multiple size="6">
          ${services.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} — ${s.duration_min}m · ${moneyShort(s.price_pence)}</option>`).join('')}
        </select>
        <span class="small muted">Ctrl/Cmd-click for more than one</span>
      </div>
      <div class="field"><label>Stylist</label>
        <select name="staffId"><option value="any">Any available</option>${staff.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Date</label><input name="date" type="date" value="${date}"></div>
      <div class="field full"><label>Time</label><select name="start"><option value="">Choose a date first</option></select></div>
      <div class="field full"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
    </div>`;

  const modal = openModal({
    title: 'New booking',
    body,
    wide: true,
    footer: `
      <button class="btn btn-ghost" type="button" data-close="1">Cancel</button>
      <button class="btn" type="button" id="createBooking">Create booking</button>`,
  });

  const form = modal.querySelector('.body');
  let clientId = null;

  const loadSlots = async () => {
    const serviceIds = [...form.querySelector('[name="serviceIds"]').selectedOptions].map((o) => o.value);
    const dateVal = form.querySelector('[name="date"]').value;
    const staffId = form.querySelector('[name="staffId"]').value;
    const select = form.querySelector('[name="start"]');
    if (!serviceIds.length || !dateVal) { select.innerHTML = '<option value="">Choose services and a date</option>'; return; }
    select.innerHTML = '<option value="">Loading…</option>';
    try {
      const res = await api(`/api/public/availability?serviceIds=${serviceIds.join(',')}&staffId=${staffId}&date=${dateVal}`);
      select.innerHTML = res.slots.length
        ? res.slots.map((s) => `<option value="${s.start}">${new Date(s.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} — ${escapeHtml(s.staffName)}</option>`).join('')
        : '<option value="">No slots that day</option>';
    } catch {
      select.innerHTML = '<option value="">Could not load slots</option>';
    }
  };

  form.querySelector('[name="serviceIds"]').addEventListener('change', loadSlots);
  form.querySelector('[name="date"]').addEventListener('change', loadSlots);
  form.querySelector('[name="staffId"]').addEventListener('change', loadSlots);

  const search = form.querySelector('[name="clientSearch"]');
  const hitsEl = form.querySelector('#clientHits');
  search.addEventListener('input', debounce(async () => {
    const term = search.value.trim();
    if (term.length < 2) { hitsEl.innerHTML = ''; return; }
    const res = await api(`/api/admin/customers?q=${encodeURIComponent(term)}&limit=6`);
    hitsEl.innerHTML = res.customers.map((c) => `
      <button type="button" class="btn btn-ghost btn-xs" data-client="${c.id}" data-name="${escapeHtml(c.first_name)}" data-last="${escapeHtml(c.last_name)}" data-phone="${c.phone}">
        ${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)} · ${c.phone}</button>`).join(' ');
  }, 250));

  on(hitsEl, 'click', '[data-client]', (e, btn) => {
    clientId = btn.dataset.client;
    form.querySelector('[name="firstName"]').value = btn.dataset.name;
    form.querySelector('[name="lastName"]').value = btn.dataset.last;
    form.querySelector('[name="phone"]').value = btn.dataset.phone;
    hitsEl.innerHTML = `<span class="badge badge-confirmed">Existing client selected</span>`;
  });

  loadSlots();

  modal.querySelector('#createBooking').addEventListener('click', async () => {
    const v = formValues(form);
    const serviceIds = [...form.querySelector('[name="serviceIds"]').selectedOptions].map((o) => o.value);
    if (!serviceIds.length) { toast('Choose at least one service', 'bad'); return; }
    if (!v.start) { toast('Choose a time', 'bad'); return; }
    if (!v.firstName || !v.phone) { toast('Client name and mobile are required', 'bad'); return; }
    try {
      const res = await api('/api/admin/appointments', {
        method: 'POST',
        body: {
          serviceIds,
          staffId: v.staffId,
          start: v.start,
          customer: { firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email },
          customerId: clientId,
          notes: v.notes,
          source: 'admin',
        },
      });
      toast(`Booked · ${res.reference}`);
      closeModal();
      route();
      refreshMessageCount();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ══ clients ════════════════════════════════════════════════════════════ */

async function clients() {
  if (!state.staff.length) state.staff = (await api('/api/admin/staff')).staff;
  setHeader('Clients', 'The client book', `
    <button class="btn btn-ghost btn-sm" id="exportClients">Export CSV</button>
    <button class="btn btn-sm" id="addClient">+ Add client</button>`);
  $('#exportClients').addEventListener('click', () => { window.location.href = '/api/admin/customers/export.csv'; });
  $('#addClient').addEventListener('click', () => clientModal(null));

  $('#view').innerHTML = html`
    <div class="card">
      <div class="row" style="margin-bottom:.8rem">
        <input id="clientSearch" placeholder="Search name, phone or email" style="border:1px solid var(--line);border-radius:9px;padding:.45rem .6rem;min-width:240px">
        <select id="segment" style="border:1px solid var(--line);border-radius:9px;padding:.45rem .6rem">
          <option value="all">All clients</option>
          <option value="vip">VIP</option>
          <option value="colour">Colour clients</option>
          <option value="nails">Nails</option>
          <option value="lapsed">Lapsed 90 days</option>
          <option value="new">New (30 days)</option>
          <option value="marketing">Marketing opt-in</option>
          <option value="consent">No WhatsApp consent</option>
        </select>
        <span class="row-end small muted" id="clientCount"></span>
      </div>
      <div class="table-wrap"><table id="clientTable"></table></div>
    </div>`;

  const load = async () => {
    const term = $('#clientSearch').value.trim();
    const segment = $('#segment').value;
    const res = await api(`/api/admin/customers?q=${encodeURIComponent(term)}&segment=${segment}`);
    $('#clientCount').textContent = `${res.customers.length} clients`;
    $('#clientTable').innerHTML = `
      <thead><tr><th>Name</th><th>Phone</th><th>Tags</th><th class="num">Visits</th><th class="num">Spend</th><th>Last visit</th><th>WhatsApp</th></tr></thead>
      <tbody>${res.customers.map((c) => `
        <tr data-client="${c.id}" style="cursor:pointer">
          <td><b>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</b><br><span class="small muted">${escapeHtml(c.email || '')}</span></td>
          <td class="mono">${c.phone}</td>
          <td>${(c.tags || '').split(',').filter(Boolean).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</td>
          <td class="num">${c.visit_count}</td>
          <td class="num">${money(c.total_spend_pence)}</td>
          <td class="small">${c.last_visit_at ? shortDate(c.last_visit_at.slice(0, 10)) : '—'}</td>
          <td>${c.whatsapp_opt_in ? '<span class="badge badge-completed">Yes</span>' : '<span class="badge badge-cancelled">No</span>'}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="empty">No clients match.</td></tr>'}</tbody>`;
  };

  $('#clientSearch').addEventListener('input', debounce(load, 300));
  $('#segment').addEventListener('change', load);
  on($('#view'), 'click', '[data-client]', (e, row) => clientModal(row.dataset.client));
  await load();
}

async function clientModal(id) {
  const [data, pkgRes] = id
    ? await Promise.all([
      api(`/api/admin/customers/${id}`),
      api(`/api/admin/customers/${id}/packages`).catch(() => ({ purchases: [] })),
    ])
    : [null, { purchases: [] }];
  const c = data?.customer || {
    first_name: '', last_name: '', phone: '', email: '', dob: '', tags: '', allergies: '',
    formula_notes: '', notes: '', whatsapp_opt_in: 1, marketing_opt_in: 0,
  };

  const body = html`
    <div class="form-grid">
      <div class="field"><label>First name</label><input name="firstName" value="${c.first_name}"></div>
      <div class="field"><label>Last name</label><input name="lastName" value="${c.last_name}"></div>
      <div class="field"><label>Mobile</label><input name="phone" value="${c.phone}"></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${c.email}"></div>
      <div class="field"><label>Date of birth</label><input name="dob" type="date" value="${c.dob || ''}"></div>
      <div class="field"><label>Tags</label><input name="tags" value="${c.tags}" placeholder="VIP, Colour"></div>
      <div class="field"><label>Preferred stylist</label>
        <select name="preferredStaffId"><option value="">None</option>${state.staff.map((m) => `<option value="${m.id}" ${c.preferred_staff_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select>
      </div>
      <div class="field full"><label>Allergies / sensitivities</label><textarea name="allergies" rows="2">${c.allergies}</textarea></div>
      <div class="field full"><label>Colour formula notes</label><textarea name="formulaNotes" rows="2">${c.formula_notes}</textarea></div>
      <div class="field full"><label>General notes</label><textarea name="notes" rows="2">${c.notes}</textarea></div>
      <div class="field full">
        <label class="check"><input type="checkbox" name="whatsappOptIn" ${c.whatsapp_opt_in ? 'checked' : ''}> WhatsApp messages allowed</label>
        <label class="check"><input type="checkbox" name="marketingOptIn" ${c.marketing_opt_in ? 'checked' : ''}> Marketing / offers allowed</label>
      </div>
    </div>
    ${data ? html`
      <h4 style="margin:1.2rem 0 .5rem">History</h4>
      <div class="timeline">
        ${data.appointments.slice(0, 12).map((a) => html`
          <div class="tl-item">
            <span class="dot"></span>
            <div><b>${a.date} ${a.time}</b> · ${a.items.map((i) => i.name_snapshot).join(' + ')} · ${a.staff_name} ${statusBadge(a.status)}</div>
          </div>`).join('') || '<div class="small muted">No visits yet.</div>'}
      </div>
      <h4 style="margin:1.2rem 0 .5rem">Messages</h4>
      <div class="timeline">
        ${data.notifications.slice(0, 8).map((n) => html`
          <div class="tl-item"><span class="dot"></span><div><b>${titleCase(n.template_key)}</b> ${statusBadge(n.status)}<br><span class="small muted">${escapeHtml(n.body.slice(0, 120))}</span></div></div>`).join('') || '<div class="small muted">No messages.</div>'}
      </div>
      <h4 style="margin:1.2rem 0 .5rem">Treatment packages</h4>
      <div class="timeline">
        ${pkgRes.purchases.map((p) => html`
          <div class="tl-item">
            <span class="dot"></span>
            <div>
              <b>${p.plan_name}</b> ${statusBadge(p.status)}
              <div class="small muted">${p.reference} · ${p.sessions_used}/${p.sessions_total} sessions used
                ${p.paymentDue ? ` · ${money(p.paymentDue)} due` : ''}${p.expires_at ? ` · expires ${shortDate(p.expires_at.slice(0, 10))}` : ''}</div>
            </div>
          </div>`).join('') || '<div class="small muted">No packages yet.</div>'}
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:.6rem" type="button" id="sellPackageForClient">+ Sell a package</button>` : raw('')}`;

  const modal = openModal({
    title: id ? `${c.first_name} ${c.last_name}` : 'New client',
    body,
    wide: true,
    footer: `
      <button class="btn btn-ghost" type="button" data-close="1">Close</button>
      ${id ? '<button class="btn btn-danger" type="button" id="eraseClient">Erase (GDPR)</button>' : ''}
      <button class="btn" type="button" id="saveClient">Save client</button>`,
  });

  const sellBtn = modal.querySelector('#sellPackageForClient');
  if (sellBtn) {
    sellBtn.addEventListener('click', () => sellPackageModal(id, `${c.first_name} ${c.last_name}`));
  }

  modal.querySelector('#saveClient').addEventListener('click', async () => {
    const v = formValues(modal);
    const payload = {
      firstName: v.firstName, lastName: v.lastName, phone: v.phone, email: v.email, dob: v.dob || null,
      tags: v.tags, preferredStaffId: v.preferredStaffId || null,
      allergies: v.allergies, formulaNotes: v.formulaNotes, notes: v.notes,
      whatsappOptIn: v.whatsappOptIn, marketingOptIn: v.marketingOptIn,
    };
    try {
      if (id) await api(`/api/admin/customers/${id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/customers', { method: 'POST', body: payload });
      toast('Client saved');
      closeModal();
      clients();
    } catch (err) { toast(err.message, 'bad'); }
  });

  const erase = modal.querySelector('#eraseClient');
  if (erase) {
    erase.addEventListener('click', async () => {
      if (!confirm('Permanently erase this client and their appointments? This cannot be undone.')) return;
      try {
        await api(`/api/admin/customers/${id}`, { method: 'DELETE' });
        toast('Client erased');
        closeModal();
        clients();
      } catch (err) { toast(err.message, 'bad'); }
    });
  }
}

/* ══ packages (loyalty) ═════════════════════════════════════════════════ */

function pkgProgress(p) {
  const total = p.sessions_total || 0;
  const used = p.sessions_used || 0;
  const paid = p.plan?.sessions ?? total;
  const pips = Array.from({ length: total }, (_, i) => {
    const cls = [i < used ? 'used' : '', i >= paid ? 'free' : ''].filter(Boolean).join(' ');
    return `<span class="pkg-pip ${cls}" title="${i >= paid ? 'Free session' : `Session ${i + 1}`}"></span>`;
  }).join('');
  return `<div class="pkg-progress">${pips}</div><span class="small muted">${used}/${total} used</span>`;
}

async function packages() {
  const [pkgRes, svcRes] = await Promise.all([
    api('/api/admin/packages'),
    state.services.length ? { services: state.services } : api('/api/admin/services'),
  ]);
  state.services = svcRes.services;
  const purchases = pkgRes.purchases;
  const active = purchases.filter((p) => p.status === 'active');
  const due = purchases.reduce((n, p) => n + (p.paymentDue || 0), 0);
  const sessionsLeft = active.reduce((n, p) => n + (p.sessions_left || 0), 0);

  setHeader('Packages', 'Package purchases and sessions', `
    <button class="btn btn-ghost btn-sm" id="sellPkg">+ Sell package</button>`);
  $('#sellPkg').addEventListener('click', () => sellPackageModal());

  $('#view').innerHTML = html`
    <div class="grid grid-4">
      <div class="kpi"><span>Active packages</span><b>${active.length}</b><small>${purchases.length} sold in total</small></div>
      <div class="kpi"><span>Sessions left</span><b>${sessionsLeft}</b><small>to be redeemed</small></div>
      <div class="kpi"><span>Payment due</span><b>${money(due)}</b><small>${purchases.filter((p) => p.paymentDue > 0).length} packages</small></div>
      <div class="kpi"><span>Collected</span><b>${money(purchases.filter((p) => p.status !== 'cancelled').reduce((n, p) => n + p.paid_pence, 0))}</b><small>package payments</small></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Package purchases</h3><span class="hint">${purchases.length} records</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Reference</th><th>Client</th><th>Treatment</th><th>Progress</th><th class="num">Payment</th><th>Sold by</th><th>Status</th><th></th></tr></thead>
        <tbody>${purchases.map((p) => `
          <tr>
            <td class="mono">${escapeHtml(p.reference)}<br><span class="small muted">${shortDate(p.purchased_at.slice(0, 10))}</span></td>
            <td><b>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</b><br><span class="small muted">${p.phone}</span></td>
            <td>${escapeHtml(p.plan_name || p.service_name || 'Custom')}<br><span class="small muted">${p.channel === 'online' ? 'Bought online' : 'Sold in salon'}</span></td>
            <td>${pkgProgress(p)}</td>
            <td class="num">${money(p.paid_pence)}<br><span class="small muted">${p.paymentDue > 0 ? `${money(p.paymentDue)} due` : 'paid'}</span></td>
            <td class="small">${escapeHtml(p.sold_by_name || '—')}</td>
            <td>${statusBadge(p.status)}</td>
            <td class="num" style="white-space:nowrap">
              ${p.status === 'active' && p.sessions_left > 0 ? `<button class="btn btn-ghost btn-xs" data-redeem="${p.id}">Use session</button>` : ''}
              ${p.paymentDue > 0 && p.status !== 'cancelled' ? `<button class="btn btn-ghost btn-xs" data-pay="${p.id}">Payment</button>` : ''}
              ${p.status === 'active' ? `<button class="btn btn-ghost btn-xs" data-cancel="${p.id}">Cancel</button>` : ''}
            </td>
          </tr>`).join('') || '<tr><td colspan="8" class="empty">No packages sold yet.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  on($('#view'), 'click', '[data-plan]', (e, btn) => planModal(plans.find((p) => p.id === btn.dataset.plan)));
  on($('#view'), 'click', '[data-redeem]', async (e, btn) => {
    const p = purchases.find((x) => x.id === btn.dataset.redeem);
    if (!p || !confirm(`Use one session on ${p.plan_name} for ${p.first_name} ${p.last_name}?`)) return;
    try {
      const out = await api(`/api/admin/package-purchases/${p.id}/redeem`, { method: 'POST', body: {} });
      toast(out.isFree ? 'Free session used' : 'Session used');
      packages();
      refreshMessageCount();
    } catch (err) { toast(err.message, 'bad'); }
  });
  on($('#view'), 'click', '[data-pay]', (e, btn) => {
    packagePaymentModal(purchases.find((x) => x.id === btn.dataset.pay));
  });
  on($('#view'), 'click', '[data-cancel]', async (e, btn) => {
    const p = purchases.find((x) => x.id === btn.dataset.cancel);
    if (!p || !confirm(`Cancel ${p.reference}? Sessions already used stay used.`)) return;
    try {
      await api(`/api/admin/package-purchases/${p.id}/cancel`, { method: 'POST', body: { reason: 'Cancelled by staff' } });
      toast('Package cancelled');
      packages();
    } catch (err) { toast(err.message, 'bad'); }
  });
}


async function sellPackageModal(customerId = null, customerName = '') {
  const [pkgRes, svcRes, custRes] = await Promise.all([
    api('/api/admin/packages'),
    api('/api/admin/services?limit=500'),
    customerId ? Promise.resolve(null) : api('/api/admin/customers?limit=500'),
  ]);
  const plans = pkgRes.plans.filter((p) => p.active);
  const services = svcRes.services.filter((s) => s.active);
  if (!plans.length && !services.length) { toast('Create a package plan or ensure services exist', 'bad'); return; }
  const clients = custRes?.customers || [];

  const body = html`
    <div class="form-grid">
      ${customerId ? html`
        <div class="field full"><label>Client</label><input value="${customerName}" disabled></div>` : html`
        <div class="field full"><label>Client</label>
          <select name="customerId">${clients.map((c) => `<option value="${c.id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)} — ${c.phone}</option>`).join('')}</select>
        </div>`}
      <div class="field full"><label>Package type</label>
        <select name="packageType" id="packageType">
          ${plans.length ? plans.map((p) => `<option value="plan:${p.id}">${escapeHtml(p.name)} — ${money(p.price_pence)} · ${p.sessionsTotal} sessions</option>`).join('') : ''}
          ${services.length ? services.map((s) => `<option value="service:${s.id}">${escapeHtml(s.name)} — ${money(s.price_pence)} (5 paid + 1 free)</option>`).join('') : ''}
        </select>
      </div>
      <div class="field"><label>Payment taken now (£)</label><input name="paid" type="number" min="0" step="0.01" placeholder="0.00"></div>
      <div class="field"><label>Notes</label><input name="notes" placeholder="Optional"></div>
    </div>
    <p class="small muted" style="margin-top:.8rem">The sale is credited to you in the daily sales report. Leave the payment blank to record it later.</p>`;

  const modal = openModal({
    title: 'Sell a package',
    body,
    footer: `<button class="btn btn-ghost" type="button" data-close="1">Cancel</button>
      <button class="btn" type="button" id="saveSale">Sell package</button>`,
  });

  modal.querySelector('#saveSale').addEventListener('click', async () => {
    const v = formValues(modal);
    const packageType = modal.querySelector('#packageType').value;
    try {
      const body = { paidPence: Math.round(Number(v.paid || 0) * 100), notes: v.notes || '' };
      if (packageType.startsWith('plan:')) {
        body.planId = packageType.split(':')[1];
      } else if (packageType.startsWith('service:')) {
        body.serviceId = packageType.split(':')[1];
      }
      body.customerId = customerId || v.customerId;
      await api('/api/admin/package-purchases', { method: 'POST', body });
      toast('Package sold');
      closeModal();
      packages();
      refreshMessageCount();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

function packagePaymentModal(p) {
  if (!p) return;
  const modal = openModal({
    title: `Payment · ${p.reference}`,
    body: html`
      <div class="form-grid">
        <div class="field"><label>Amount (£)</label>
          <input name="amount" type="number" min="0" step="0.01" value="${(p.paymentDue / 100).toFixed(2)}"></div>
        <div class="field"><label>Method</label>
          <select name="method"><option value="card">Card</option><option value="cash">Cash</option><option value="transfer">Transfer</option></select></div>
      </div>
      <p class="small muted">Plan ${money(p.price_pence)} · paid ${money(p.paid_pence)} · due ${money(p.paymentDue)}</p>`,
    footer: `<button class="btn btn-ghost" type="button" data-close="1">Cancel</button>
      <button class="btn btn-gold" type="button" id="savePkgPay">Record payment</button>`,
  });
  modal.querySelector('#savePkgPay').addEventListener('click', async () => {
    const v = formValues(modal);
    try {
      await api(`/api/admin/package-purchases/${p.id}/payment`, {
        method: 'POST',
        body: { amountPence: Math.round(Number(v.amount || 0) * 100), method: v.method },
      });
      toast('Payment recorded');
      closeModal();
      packages();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ══ staff sales ════════════════════════════════════════════════════════ */

async function sales() {
  state.salesFrom ||= todayStr();
  state.salesTo ||= todayStr();
  const qs = state.salesFrom === state.salesTo
    ? `date=${state.salesFrom}`
    : `from=${state.salesFrom}&to=${state.salesTo}`;
  const data = await api(`/api/admin/sales?${qs}`);
  const range = data.from === data.to ? longDate(data.from) : `${shortDate(data.from)} → ${shortDate(data.to)}`;
  setHeader('Sales', `Team performance · ${range}`, `
    <button class="btn btn-ghost btn-sm" data-range="today">Today</button>
    <button class="btn btn-ghost btn-sm" data-range="week">7 days</button>
    <button class="btn btn-ghost btn-sm" data-range="month">This month</button>
    <button class="btn btn-ghost btn-sm" id="exportSales">Export CSV</button>`);

  on($('#topbarActions'), 'click', '[data-range]', (e, btn) => {
    const today = todayStr();
    if (btn.dataset.range === 'today') { state.salesFrom = today; state.salesTo = today; }
    if (btn.dataset.range === 'week') { state.salesFrom = addDaysStr(today, -6); state.salesTo = today; }
    if (btn.dataset.range === 'month') { state.salesFrom = `${today.slice(0, 7)}-01`; state.salesTo = today; }
    sales();
  });
  $('#exportSales').addEventListener('click', () => {
    window.location.href = `/api/admin/sales/export.csv?${qs}`;
  });

  const maxDay = Math.max(1, ...data.days.map((d) => d.serviceRevenue + d.packageRevenue));

  $('#view').innerHTML = html`
    <div class="grid grid-4">
      <div class="kpi"><span>Total sales</span><b>${money(data.totals.totalRevenue)}</b><small>${data.totals.appointments} appointments</small></div>
      <div class="kpi"><span>Services sold</span><b>${data.totals.servicesSold}</b><small>${money(data.totals.serviceRevenue)}</small></div>
      <div class="kpi"><span>Packages sold</span><b>${data.totals.packagesSold}</b><small>${money(data.totals.packageRevenue)}</small></div>
      <div class="kpi"><span>Commission</span><b>${money(data.totals.commissionPence)}</b><small>on services</small></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>By team member</h3><span class="hint">${range}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Team</th><th class="num">Appointments</th><th class="num">Services</th><th class="num">Service £</th><th class="num">Packages</th><th class="num">Package £</th><th class="num">Total</th><th class="num">Commission</th></tr></thead>
        <tbody>${data.staff.map((m) => `
          <tr>
            <td><b>${escapeHtml(m.name)}</b><br><span class="small muted">${escapeHtml(m.title || '')}</span></td>
            <td class="num">${m.appointments}</td>
            <td class="num">${m.servicesSold}</td>
            <td class="num">${money(m.serviceRevenue)}</td>
            <td class="num">${m.packagesSold}</td>
            <td class="num">${money(m.packageRevenue)}</td>
            <td class="num"><b>${money(m.totalRevenue)}</b></td>
            <td class="num">${money(m.commissionPence)}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="empty">No completed sales in this period.</td></tr>'}</tbody>
      </table></div>
    </div>

    ${data.days.length > 1 ? html`
      <div class="card">
        <div class="card-head"><h3>Daily sales</h3><span class="hint">services + packages</span></div>
        <div class="bar-chart">
          ${data.days.map((d) => `<div style="height:${Math.max(2, Math.round(((d.serviceRevenue + d.packageRevenue) / maxDay) * 100))}%" title="${d.date}: ${money(d.serviceRevenue + d.packageRevenue)}"><span>${d.date.slice(8)}</span></div>`).join('')}
        </div>
        <div style="height:1.4rem"></div>
      </div>` : raw('')}

    <div class="card">
      <div class="card-head"><h3>What each person sold</h3></div>
      <div class="grid grid-2">
        ${data.staff.map((m) => html`
          <div class="sales-person">
            <div class="row" style="justify-content:space-between">
              <b>${m.name}</b>
              <span>${money(m.totalRevenue)}</span>
            </div>
            ${m.items.length ? m.items.map((i) => html`
              <div class="sales-line"><span>${i.name} × ${i.count}</span><span>${money(i.revenue)}</span></div>`).join('') : html`<div class="small muted">No services completed.</div>`}
            ${m.packages.length ? html`<div class="sales-line" style="margin-top:.4rem"><span>Packages sold</span><span>${m.packages.map((p) => p.reference).join(', ')}</span></div>` : raw('')}
          </div>`)}
      </div>
    </div>`;
}

/* ══ services ═══════════════════════════════════════════════════════════ */

async function services() {
  const { services: rows } = await api('/api/admin/services');
  state.services = rows;
  setHeader('Services', 'Menu, durations and prices', '<button class="btn btn-sm" id="addService">+ Add service</button>');
  $('#addService').addEventListener('click', () => serviceModal(null));

  const byCat = {};
  for (const s of rows) (byCat[s.category] ||= []).push(s);

  $('#view').innerHTML = Object.entries(byCat).map(([cat, list]) => html`
    <div class="card">
      <div class="card-head"><h3>${cat}</h3><span class="hint">${list.length} services</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Service</th><th class="num">Duration</th><th class="num">Buffer</th><th class="num">Price</th><th class="num">Deposit</th><th>Online</th><th>Team</th><th></th></tr></thead>
        <tbody>${list.map((s) => `
          <tr>
            <td><b>${escapeHtml(s.name)}</b><br><span class="small muted">${escapeHtml(s.description)}</span></td>
            <td class="num">${s.duration_min}m</td>
            <td class="num">${s.buffer_min}m</td>
            <td class="num">${money(s.price_pence)}</td>
            <td class="num">${money(s.deposit_pence)}</td>
            <td>${s.online_bookable ? '✓' : '—'}</td>
            <td class="small">${s.staffIds.length}</td>
            <td class="num"><button class="btn btn-ghost btn-xs" data-service="${s.id}">Edit</button></td>
          </tr>`).join('')}</tbody>
      </table></div>
    </div>`).join('');

  on($('#view'), 'click', '[data-service]', (e, btn) => {
    serviceModal(rows.find((s) => s.id === btn.dataset.service));
  });
}

function serviceModal(svc) {
  const s = svc || { name: '', category: 'Hair', description: '', duration_min: 45, buffer_min: 10, price_pence: 4500, deposit_pence: 0, online_bookable: 1, active: 1 };
  const modal = openModal({
    title: svc ? 'Edit service' : 'New service',
    body: html`
      <div class="form-grid">
        <div class="field full"><label>Name</label><input name="name" value="${s.name}"></div>
        <div class="field"><label>Category</label><input name="category" value="${s.category}"></div>
        <div class="field"><label>Duration (min)</label><input name="durationMin" type="number" min="5" value="${s.duration_min}"></div>
        <div class="field"><label>Buffer (min)</label><input name="bufferMin" type="number" min="0" value="${s.buffer_min}"></div>
        <div class="field"><label>Price (£)</label><input name="price" type="number" step="0.01" value="${(s.price_pence / 100).toFixed(2)}"></div>
        <div class="field"><label>Deposit (£)</label><input name="deposit" type="number" step="0.01" value="${(s.deposit_pence / 100).toFixed(2)}"></div>
        <div class="field full"><label>Description</label><textarea name="description" rows="2">${s.description}</textarea></div>
        <div class="field full"><label class="check"><input type="checkbox" name="onlineBookable" ${s.online_bookable ? 'checked' : ''}> Bookable online</label></div>
      </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close="1">Cancel</button><button class="btn" type="button" id="saveService">Save</button>`,
  });

  modal.querySelector('#saveService').addEventListener('click', async () => {
    const v = formValues(modal);
    const payload = {
      name: v.name, category: v.category, description: v.description,
      durationMin: Number(v.durationMin), bufferMin: Number(v.bufferMin),
      pricePence: Math.round(Number(v.price) * 100), depositPence: Math.round(Number(v.deposit) * 100),
      onlineBookable: v.onlineBookable,
    };
    try {
      if (svc) await api(`/api/admin/services/${svc.id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/services', { method: 'POST', body: payload });
      toast('Service saved');
      closeModal();
      services();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ══ team ═══════════════════════════════════════════════════════════════ */

async function team() {
  const [{ staff }, { services: svcRows }] = await Promise.all([
    api('/api/admin/staff'), api('/api/admin/services'),
  ]);
  state.staff = staff;
  state.services = svcRows;
  setHeader('Team', `${staff.filter((s) => s.active).length} active`, '<button class="btn btn-sm" id="addStaff">+ Add team member</button>');
  $('#addStaff').addEventListener('click', () => staffModal(null));

  $('#view').innerHTML = html`
    <div class="grid grid-3">
      ${staff.map((m) => html`
        <div class="card" style="border-top:4px solid ${m.colour}">
          <div class="row">
            <div style="width:44px;height:44px;border-radius:50%;background:${m.colour};color:#fff;display:grid;place-items:center;font-family:var(--serif)">${initials(m.name)}</div>
            <div>
              <b>${m.name}</b><br><span class="small muted">${m.title}${m.active ? '' : ' · inactive'}</span>
            </div>
            <span class="row-end"></span>
            <button class="btn btn-ghost btn-xs" data-staff="${m.id}">Edit</button>
          </div>
          <p class="small muted" style="margin:.7rem 0">${m.bio}</p>
          <div class="small"><b>${m.serviceIds.length}</b> services · <b>${m.commission_pct}%</b> commission · ${m.employment_type.replace('_', ' ')}</div>
          <div class="small muted" style="margin-top:.4rem">${m.user ? `Login: ${m.user.email}` : 'No login account'}</div>
        </div>`)}
    </div>`;

  on($('#view'), 'click', '[data-staff]', (e, btn) => staffModal(staff.find((m) => m.id === btn.dataset.staff)));
}

function staffModal(member) {
  const m = member || { name: '', title: 'Stylist', bio: '', phone: '', email: '', colour: '#8B5CF6', employment_type: 'full_time', commission_pct: 0, serviceIds: [] };
  const modal = openModal({
    title: member ? 'Edit team member' : 'New team member',
    body: html`
      <div class="form-grid">
        <div class="field"><label>Name</label><input name="name" value="${m.name}"></div>
        <div class="field"><label>Job title</label><input name="title" value="${m.title}"></div>
        <div class="field"><label>Phone</label><input name="phone" value="${m.phone}"></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${m.email}"></div>
        <div class="field"><label>Colour</label><input name="colour" type="color" value="${m.colour}"></div>
        <div class="field"><label>Employment</label>
          <select name="employmentType">
            <option value="full_time" ${m.employment_type === 'full_time' ? 'selected' : ''}>Full time</option>
            <option value="part_time" ${m.employment_type === 'part_time' ? 'selected' : ''}>Part time</option>
            <option value="freelance" ${m.employment_type === 'freelance' ? 'selected' : ''}>Freelance</option>
          </select></div>
        <div class="field"><label>Commission %</label><input name="commissionPct" type="number" step="0.5" value="${m.commission_pct}"></div>
        <div class="field full"><label>Bio</label><textarea name="bio" rows="2">${m.bio}</textarea></div>
        <div class="field full"><label>Can perform</label>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.3rem;max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:.6rem">
            ${state.services.map((s) => `<label class="check"><input type="checkbox" name="svc_${s.id}" ${m.serviceIds.includes(s.id) ? 'checked' : ''}> ${escapeHtml(s.name)}</label>`).join('')}
          </div>
        </div>
        ${member ? `<div class="field full"><label class="check"><input type="checkbox" name="active" ${member.active ? 'checked' : ''}> Active (shows on website)</label></div>` : ''}
      </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close="1">Cancel</button><button class="btn" type="button" id="saveStaff">Save</button>`,
    wide: true,
  });

  modal.querySelector('#saveStaff').addEventListener('click', async () => {
    const v = formValues(modal);
    const serviceIds = state.services.filter((s) => v[`svc_${s.id}`]).map((s) => s.id);
    const payload = {
      name: v.name, title: v.title, phone: v.phone, email: v.email, bio: v.bio,
      colour: v.colour, employmentType: v.employmentType,
      commissionPct: Number(v.commissionPct) || 0, serviceIds,
      ...(member ? { active: v.active } : {}),
    };
    try {
      if (member) await api(`/api/admin/staff/${member.id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/staff', { method: 'POST', body: payload });
      toast('Team updated');
      closeModal();
      team();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ══ rota ═══════════════════════════════════════════════════════════════ */

async function rota() {
  if (!state.staff.length) state.staff = (await api('/api/admin/staff')).staff;
  const data = await api(`/api/admin/rota?week=${state.rotaWeek}`);
  setHeader('Rota', `Week of ${shortDate(data.weekStart)}`, `
    <button class="btn btn-ghost btn-sm" data-week="-1">←</button>
    <input type="date" id="rotaWeek" value="${state.rotaWeek}" style="border:1px solid var(--line);border-radius:9px;padding:.4rem .5rem">
    <button class="btn btn-ghost btn-sm" data-week="1">→</button>
    <button class="btn btn-ghost btn-sm" id="copyWeek">Copy → next week</button>
    <button class="btn btn-ghost btn-sm" id="applyPattern">Apply pattern</button>`);

  $('#rotaWeek').addEventListener('change', (e) => { state.rotaWeek = weekStartStr(e.target.value); rota(); });
  on($('#topbarActions'), 'click', '[data-week]', (e, btn) => {
    state.rotaWeek = addDaysStr(state.rotaWeek, Number(btn.dataset.week) * 7);
    rota();
  });
  $('#copyWeek').addEventListener('click', async () => {
    try {
      const res = await api('/api/admin/rota/copy', {
        method: 'POST', body: { fromWeek: state.rotaWeek, toWeek: addDaysStr(state.rotaWeek, 7) },
      });
      toast(`Copied ${res.copied} shifts (${res.skipped} skipped)`);
      state.rotaWeek = addDaysStr(state.rotaWeek, 7);
      rota();
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#applyPattern').addEventListener('click', async () => {
    try {
      const res = await api('/api/admin/rota/template', { method: 'POST', body: { week: state.rotaWeek } });
      toast(`Created ${res.created} shifts from recent pattern`);
      rota();
    } catch (err) { toast(err.message, 'bad'); }
  });

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const conflicts = data.conflicts || [];
  const staffName = (id) => data.grid.find((g) => g.id === id)?.name || '';

  $('#view').innerHTML = html`
    ${conflicts.length ? html`
      <div class="card" style="border-left:4px solid var(--warn)">
        <div class="card-head"><h3>${conflicts.length} rota warnings</h3><span class="hint">Fix before publishing</span></div>
        ${conflicts.map((c) => html`<div class="conflict"><code>${c.code.replace(/_/g, ' ')}</code><span><b>${staffName(c.staffId)}</b> · ${c.date} — ${c.detail}</span></div>`)}
      </div>` : raw('')}

    <div class="card">
      <div class="rota-scroll">
        <table class="rota">
          <thead><tr><th class="staff-col">Team</th>
            ${data.days.map((d, i) => `<th>${dayNames[i]}<br><span class="muted">${shortDate(d)}</span></th>`).join('')}
          </tr></thead>
          <tbody>
            ${data.grid.map((m) => html`
              <tr>
                <td><div class="staff-cell"><span class="avatar" style="--c:${m.colour}">${initials(m.name)}</span>${m.name.split(' ')[0]}</div></td>
                ${data.days.map((d) => {
                  const shifts = m.shifts.filter((s) => s.work_date === d);
                  const off = m.timeOff.find((o) => o.start_date <= d && o.end_date >= d);
                  return html`<td>
                    <div class="cell" data-add="${m.id}" data-date="${d}">
                      ${off ? html`<div class="off">${off.type}${off.status === 'pending' ? ' (pending)' : ''}</div>` : raw('')}
                      ${shifts.map((s) => html`
                        <div class="shift" style="--c:${m.colour}" data-shift="${s.id}">
                          <b>${s.start_time}–${s.end_time}</b>
                          <small>${s.break_min ? `${s.break_min}m break` : 'no break'}</small>
                        </div>`)}
                    </div>
                  </td>`;
                })}
              </tr>`)}
          </tbody>
        </table>
      </div>
      <p class="small muted" style="margin:.8rem 0 0">Click an empty cell to add a shift, a shift to edit it. Warnings are advisory; overlapping shifts are blocked.</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>Time off</h3><button class="btn btn-ghost btn-sm" id="addTimeOff">+ Request time off</button></div>
      <div id="timeOffList" class="small muted">Loading…</div>
    </div>`;

  on($('#view'), 'click', '[data-add]', (e, cell) => {
    if (e.target.closest('[data-shift]')) return;
    shiftModal(null, cell.dataset.add, cell.dataset.date);
  });
  on($('#view'), 'click', '[data-shift]', (e, el) => {
    e.stopPropagation();
    const shift = data.grid.flatMap((g) => g.shifts).find((s) => s.id === el.dataset.shift);
    if (!shift) return; /* stale node from a previous render */
    shiftModal(shift, shift.staff_id, shift.work_date);
  });
  $('#addTimeOff').addEventListener('click', () => timeOffModal());
  loadTimeOff();
}

async function loadTimeOff() {
  try {
    const { timeOff } = await api('/api/admin/timeoff');
    $('#timeOffList').innerHTML = timeOff.length
      ? `<table><thead><tr><th>Team</th><th>From</th><th>To</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${timeOff.map((t) => `
        <tr><td>${escapeHtml(t.staff_name)}</td><td>${t.start_date}</td><td>${t.end_date}</td><td>${t.type}</td>
        <td>${statusBadge(t.status)}</td>
        <td class="num">${t.status === 'pending' ? `<button class="btn btn-ghost btn-xs" data-approve="${t.id}">Approve</button>` : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No time off booked.</div>';
    on($('#timeOffList'), 'click', '[data-approve]', async (e, btn) => {
      await api(`/api/admin/timeoff/${btn.dataset.approve}`, { method: 'PATCH', body: { status: 'approved' } });
      toast('Approved');
      loadTimeOff();
    });
  } catch { /* ignore */ }
}

function shiftModal(shift, staffId, date) {
  const s = shift || { start_time: '09:00', end_time: '17:00', break_min: 30, notes: '' };
  const modal = openModal({
    title: shift ? 'Edit shift' : `Add shift · ${shortDate(date)}`,
    body: html`
      <div class="form-grid">
        <div class="field"><label>Start</label><input name="start" type="time" value="${s.start_time}"></div>
        <div class="field"><label>End</label><input name="end" type="time" value="${s.end_time}"></div>
        <div class="field"><label>Break (min)</label><input name="breakMin" type="number" min="0" value="${s.break_min}"></div>
        <div class="field full"><label>Notes</label><input name="notes" value="${s.notes}"></div>
      </div>`,
    footer: `
      ${shift ? '<button class="btn btn-danger" type="button" id="deleteShift">Delete</button>' : ''}
      <button class="btn btn-ghost" type="button" data-close="1">Cancel</button>
      <button class="btn" type="button" id="saveShift">Save shift</button>`,
  });

  modal.querySelector('#saveShift').addEventListener('click', async () => {
    const v = formValues(modal);
    try {
      if (shift) await api(`/api/admin/rota/${shift.id}`, { method: 'PATCH', body: { start: v.start, end: v.end, breakMin: Number(v.breakMin), notes: v.notes } });
      else await api('/api/admin/rota', { method: 'POST', body: { staffId, date, start: v.start, end: v.end, breakMin: Number(v.breakMin), notes: v.notes } });
      toast('Shift saved');
      closeModal();
      rota();
    } catch (err) { toast(err.message, 'bad'); }
  });

  const del = modal.querySelector('#deleteShift');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this shift?')) return;
    try {
      const res = await api(`/api/admin/rota/${shift.id}`, { method: 'DELETE' });
      toast(res.warnings || 'Shift deleted', res.warnings ? 'bad' : 'ok');
      closeModal();
      rota();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

function timeOffModal() {
  const modal = openModal({
    title: 'Request time off',
    body: html`
      <div class="form-grid">
        <div class="field full"><label>Team member</label>
          <select name="staffId">${state.staff.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}</select></div>
        <div class="field"><label>From</label><input name="startDate" type="date" value="${todayStr()}"></div>
        <div class="field"><label>To</label><input name="endDate" type="date" value="${todayStr()}"></div>
        <div class="field"><label>Type</label>
          <select name="type"><option value="holiday">Holiday</option><option value="sick">Sick</option><option value="training">Training</option><option value="unpaid">Unpaid</option></select></div>
        <div class="field full"><label>Reason</label><input name="reason"></div>
      </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close="1">Cancel</button><button class="btn" type="button" id="saveTimeOff">Save</button>`,
  });
  modal.querySelector('#saveTimeOff').addEventListener('click', async () => {
    const v = formValues(modal);
    try {
      const res = await api('/api/admin/timeoff', { method: 'POST', body: v });
      toast(res.clashingShifts?.length ? `${res.clashingShifts.length} shifts clash with this leave` : 'Time off saved', res.clashingShifts?.length ? 'bad' : 'ok');
      closeModal();
      rota();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ══ website ════════════════════════════════════════════════════════════ */

async function website() {
  const [site, offersRes, reviewsRes] = await Promise.all([
    api('/api/admin/site'), api('/api/admin/offers'), api('/api/admin/reviews'),
  ]);
  state.site = site;
  setHeader('Website', 'Content, notice bar, socials, reviews and offers', '<a class="btn btn-ghost btn-sm" href="/" target="_blank">View site ↗</a>');

  const c = site.content;
  const fields = [
    ['hero_kicker', 'Hero kicker'], ['hero_title', 'Hero headline (use <em> for italic)'],
    ['hero_sub', 'Hero paragraph'], ['about_title', 'About heading'], ['about_body', 'About paragraph'],
    ['address', 'Address'], ['phone', 'Phone'], ['email', 'Email'],
    ['booking_policy', 'Booking policy'], ['footer_note', 'Footer note'],
  ];
  const socialFields = [
    ['instagram', 'Instagram handle or URL'], ['facebook', 'Facebook page or URL'],
    ['tiktok', 'TikTok handle or URL'], ['google', 'Google Business URL'],
    ['youtube', 'YouTube handle or URL'], ['whatsapp', 'WhatsApp number (digits)'],
  ];
  const n = site.notice;

  $('#view').innerHTML = html`
    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Site content</h3></div>
        <div class="form-grid">
          ${fields.map(([key, label]) => html`
            <div class="field ${key.includes('body') || key.includes('policy') || key.includes('sub') ? 'full' : ''}">
              <label>${label}</label>
              ${key.includes('body') || key.includes('policy')
                ? html`<textarea name="${key}" rows="3">${c[key] || ''}</textarea>`
                : html`<input name="${key}" value="${c[key] || ''}">`}
            </div>`)}
        </div>
        <button class="btn" style="margin-top:1rem" id="saveSite">Save content</button>
      </div>

      <div class="card">
        <div class="card-head"><h3>Opening hours</h3></div>
        <div id="hoursForm"></div>
        <button class="btn" style="margin-top:1rem" id="saveHours">Save hours</button>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>Notice bar</h3><span class="hint">top of the website</span></div>
        <div class="form-grid">
          <div class="field"><label>Show the bar</label>
            <label class="check"><input type="checkbox" id="noticeActive" ${n.active ? 'checked' : ''}> Visible to visitors</label>
          </div>
          <div class="field"><label>Tone</label>
            <select id="noticeTone">
              <option value="gold" ${n.tone === 'gold' ? 'selected' : ''}>Gold</option>
              <option value="plum" ${n.tone === 'plum' ? 'selected' : ''}>Plum</option>
            </select>
          </div>
          <div class="field full"><label>Message</label><input id="noticeText" value="${n.text}"></div>
          <div class="field"><label>Link</label><input id="noticeLink" value="${n.link}" placeholder="#offers"></div>
          <div class="field"><label>Link label</label><input id="noticeLinkText" value="${n.linkText}" placeholder="See offers"></div>
        </div>
        <button class="btn" style="margin-top:1rem" id="saveNotice">Save notice</button>
      </div>

      <div class="card">
        <div class="card-head"><h3>Social media</h3><span class="hint">empty fields are hidden</span></div>
        <div class="form-grid">
          ${socialFields.map(([key, label]) => html`
            <div class="field"><label>${label}</label><input name="${key}" value="${c[key] || ''}"></div>`)}
        </div>
        <button class="btn" style="margin-top:1rem" id="saveSocials">Save social links</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>Google reviews</h3>
        <div class="row-end">
          <button class="btn btn-ghost btn-sm" id="syncReviews">Sync from Google</button>
          <button class="btn btn-sm" id="addReview">+ Add review</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Author</th><th>Rating</th><th>Review</th><th>Date</th><th>Shown</th><th></th></tr></thead>
        <tbody>${reviewsRes.reviews.map((r) => `
          <tr>
            <td><b>${escapeHtml(r.author)}</b><br><span class="small muted">${escapeHtml(r.source)}</span></td>
            <td class="stars-cell">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</td>
            <td class="small" style="max-width:380px">${escapeHtml(r.body)}</td>
            <td class="small">${r.reviewed_at || '—'}</td>
            <td>${r.featured ? '<span class="badge badge-completed">Yes</span>' : '<span class="badge badge-cancelled">Hidden</span>'}</td>
            <td class="num" style="white-space:nowrap">
              <button class="btn btn-ghost btn-xs" data-review="${r.id}">Edit</button>
              <button class="btn btn-ghost btn-xs" data-del-review="${r.id}">Delete</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty">No reviews yet.</td></tr>'}</tbody>
      </table></div>
      <p class="small muted" style="margin:.8rem 0 0">${reviewsRes.configured
        ? 'Google Places is configured — sync pulls the latest reviews.'
        : 'Curated reviews are used until you add GOOGLE_PLACES_API_KEY and a Google place ID in Settings.'}</p>
    </div>

    <div class="card">
      <div class="card-head"><h3>Offers &amp; promotions</h3><button class="btn btn-sm" id="addOffer">+ New offer</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Offer</th><th>Type</th><th>Code</th><th>Runs</th><th>Status</th><th></th></tr></thead>
        <tbody>${offersRes.offers.map((o) => `
          <tr>
            <td><b>${o.emoji} ${escapeHtml(o.title)}</b><br><span class="small muted">${escapeHtml(o.description)}</span></td>
            <td>${o.kind === 'percent' ? `${o.value}% off` : `${moneyShort(o.value * 100)} off`}</td>
            <td class="mono">${escapeHtml(o.code || '—')}</td>
            <td class="small">${o.starts_on || '—'} → ${o.ends_on || '—'}</td>
            <td>${o.active ? '<span class="badge badge-completed">Live</span>' : '<span class="badge badge-cancelled">Paused</span>'}</td>
            <td class="num"><button class="btn btn-ghost btn-xs" data-offer="${o.id}">Edit</button></td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty">No offers yet.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  $('#hoursForm').innerHTML = site.hours
    .slice().sort((a, b) => (a.weekday === 0 ? 7 : a.weekday) - (b.weekday === 0 ? 7 : b.weekday))
    .map((h) => `
      <div class="row" style="margin-bottom:.4rem">
        <span style="width:92px" class="small">${days[h.weekday]}</span>
        <input type="time" name="open_${h.weekday}" value="${h.open_time || '09:00'}" ${h.closed ? 'disabled' : ''} style="border:1px solid var(--line);border-radius:8px;padding:.3rem">
        <input type="time" name="close_${h.weekday}" value="${h.close_time || '17:00'}" ${h.closed ? 'disabled' : ''} style="border:1px solid var(--line);border-radius:8px;padding:.3rem">
        <label class="check"><input type="checkbox" name="closed_${h.weekday}" ${h.closed ? 'checked' : ''}> Closed</label>
      </div>`).join('');

  $('#saveSite').addEventListener('click', async () => {
    const content = {};
    for (const [key] of fields) content[key] = $(`[name="${key}"]`, $('#view')).value;
    try {
      await api('/api/admin/site', { method: 'PATCH', body: { content } });
      toast('Website updated');
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('#saveSocials').addEventListener('click', async () => {
    const content = {};
    for (const [key] of socialFields) content[key] = $(`[name="${key}"]`, $('#view')).value;
    try {
      await api('/api/admin/site', { method: 'PATCH', body: { content } });
      toast('Social links updated');
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('#saveNotice').addEventListener('click', async () => {
    try {
      await api('/api/admin/notice', {
        method: 'PATCH',
        body: {
          active: $('#noticeActive').checked,
          tone: $('#noticeTone').value,
          text: $('#noticeText').value,
          link: $('#noticeLink').value,
          linkText: $('#noticeLinkText').value,
        },
      });
      toast('Notice bar updated');
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('#saveHours').addEventListener('click', async () => {
    const hours = site.hours.map((h) => ({
      weekday: h.weekday,
      closed: $(`[name="closed_${h.weekday}"]`, $('#view')).checked,
      open: $(`[name="open_${h.weekday}"]`, $('#view')).value,
      close: $(`[name="close_${h.weekday}"]`, $('#view')).value,
    }));
    try {
      await api('/api/admin/hours', { method: 'PATCH', body: { hours } });
      toast('Hours updated');
      website();
    } catch (err) { toast(err.message, 'bad'); }
  });

  $('#addOffer').addEventListener('click', () => offerModal(null, offersRes.offers));
  on($('#view'), 'click', '[data-offer]', (e, btn) => offerModal(offersRes.offers.find((o) => o.id === btn.dataset.offer), offersRes.offers));

  $('#addReview').addEventListener('click', () => reviewModal(null));
  on($('#view'), 'click', '[data-review]', (e, btn) => reviewModal(reviewsRes.reviews.find((r) => r.id === btn.dataset.review)));
  on($('#view'), 'click', '[data-del-review]', async (e, btn) => {
    if (!confirm('Delete this review?')) return;
    try {
      await api(`/api/admin/reviews/${btn.dataset.delReview}`, { method: 'DELETE' });
      toast('Review deleted');
      website();
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#syncReviews').addEventListener('click', async () => {
    try {
      const r = await api('/api/admin/reviews/sync', { method: 'POST' });
      toast(r.configured ? `Synced ${r.synced} new review${r.synced === 1 ? '' : 's'}` : r.message);
      if (r.configured) website();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

function reviewModal(review) {
  const r = review || { author: '', rating: 5, body: '', source: 'google', reviewed_at: todayStr(), featured: 1 };
  const modal = openModal({
    title: review ? 'Edit review' : 'Add review',
    body: html`
      <div class="form-grid">
        <div class="field"><label>Author</label><input name="author" value="${r.author}"></div>
        <div class="field"><label>Rating</label>
          <select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${r.rating === n ? 'selected' : ''}>${n} star${n === 1 ? '' : 's'}</option>`).join('')}</select>
        </div>
        <div class="field full"><label>Review</label><textarea name="body" rows="4">${r.body}</textarea></div>
        <div class="field"><label>Date</label><input name="reviewedAt" type="date" value="${r.reviewed_at || ''}"></div>
        <div class="field"><label>Source</label><input name="source" value="${r.source}"></div>
        <div class="field full"><label class="check"><input type="checkbox" name="featured" ${r.featured ? 'checked' : ''}> Show on the website</label></div>
      </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-close="1">Cancel</button>
      <button class="btn" type="button" id="saveReview">Save review</button>`,
  });
  modal.querySelector('#saveReview').addEventListener('click', async () => {
    const v = formValues(modal);
    const payload = {
      author: v.author, rating: Number(v.rating), body: v.body,
      source: v.source, reviewedAt: v.reviewedAt || null, featured: v.featured,
    };
    try {
      if (review) await api(`/api/admin/reviews/${review.id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/reviews', { method: 'POST', body: payload });
      toast('Review saved');
      closeModal();
      website();
    } catch (err) { toast(err.message, 'bad'); }
  });
}

function offerModal(offer, all) {
  const o = offer || { title: '', description: '', kind: 'percent', value: 10, code: '', starts_on: todayStr(), ends_on: addDaysStr(todayStr(), 30), emoji: '✨', active: 1, serviceIds: [] };
  const modal = openModal({
    title: offer ? 'Edit offer' : 'New offer',
    body: html`
      <div class="form-grid">
        <div class="field full"><label>Title</label><input name="title" value="${o.title}"></div>
        <div class="field full"><label>Description</label><textarea name="description" rows="2">${o.description}</textarea></div>
        <div class="field"><label>Type</label>
          <select name="kind">
            <option value="percent" ${o.kind === 'percent' ? 'selected' : ''}>Percent off</option>
            <option value="amount" ${o.kind === 'amount' ? 'selected' : ''}>Amount off (£)</option>
            <option value="freebie" ${o.kind === 'freebie' ? 'selected' : ''}>Freebie</option>
          </select></div>
        <div class="field"><label>Value</label><input name="value" type="number" step="0.01" value="${o.value}"></div>
        <div class="field"><label>Promo code</label><input name="code" value="${o.code}"></div>
        <div class="field"><label>Emoji</label><input name="emoji" value="${o.emoji}"></div>
        <div class="field"><label>Starts</label><input name="startsOn" type="date" value="${o.starts_on || ''}"></div>
        <div class="field"><label>Ends</label><input name="endsOn" type="date" value="${o.ends_on || ''}"></div>
        <div class="field full"><label class="check"><input type="checkbox" name="active" ${o.active ? 'checked' : ''}> Live on the website</label></div>
      </div>`,
    footer: `${offer ? '<button class="btn btn-danger" type="button" id="deleteOffer">Delete</button>' : ''}
      <button class="btn btn-ghost" type="button" data-close="1">Cancel</button>
      <button class="btn" type="button" id="saveOffer">Save offer</button>`,
  });

  modal.querySelector('#saveOffer').addEventListener('click', async () => {
    const v = formValues(modal);
    const payload = {
      title: v.title, description: v.description, kind: v.kind, value: Number(v.value),
      code: v.code, emoji: v.emoji, startsOn: v.startsOn || null, endsOn: v.endsOn || null, active: v.active,
    };
    try {
      if (offer) await api(`/api/admin/offers/${offer.id}`, { method: 'PATCH', body: payload });
      else await api('/api/admin/offers', { method: 'POST', body: payload });
      toast('Offer saved');
      closeModal();
      website();
    } catch (err) { toast(err.message, 'bad'); }
  });

  const del = modal.querySelector('#deleteOffer');
  if (del) del.addEventListener('click', async () => {
    if (!confirm('Delete this offer?')) return;
    await api(`/api/admin/offers/${offer.id}`, { method: 'DELETE' });
    toast('Offer deleted');
    closeModal();
    website();
  });
}

/* ══ messages ═══════════════════════════════════════════════════════════ */

async function messages() {
  const [res, tplRes, segRes, offersRes] = await Promise.all([
    api('/api/admin/notifications?limit=150'),
    api('/api/admin/templates'),
    api('/api/admin/segments'),
    api('/api/admin/offers'),
  ]);
  setHeader('Messages', `WhatsApp outbox · ${res.mode === 'api' ? 'Cloud API' : 'click-to-send'}`);

  $('#view').innerHTML = html`
    <div class="card">
      <div class="tabs" id="msgTabs">
        <button class="tab" data-tab="outbox" aria-selected="true">Outbox</button>
        <button class="tab" data-tab="templates" aria-selected="false">Templates</button>
        <button class="tab" data-tab="broadcast" aria-selected="false">Broadcast</button>
      </div>
      <div id="msgPanel"></div>
    </div>`;

  const panels = {
    outbox: () => html`
      <div class="row" style="margin-bottom:.8rem">
        <select id="msgStatus" style="border:1px solid var(--line);border-radius:9px;padding:.4rem .6rem">
          <option value="">All messages</option><option value="queued">Queued</option><option value="sent">Sent</option><option value="failed">Failed</option>
        </select>
        <span class="small muted">${res.configured ? 'Cloud API credentials detected.' : 'No API credentials — messages open as WhatsApp links.'}</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>When</th><th>To</th><th>Message</th><th>Status</th><th></th></tr></thead>
        <tbody>${res.notifications.map((n) => `
          <tr>
            <td class="small">${new Date(n.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td class="small"><b>${escapeHtml(n.first_name || '')} ${escapeHtml(n.last_name || '')}</b><br>${n.to_phone}</td>
            <td class="small" style="max-width:420px">${escapeHtml(n.body.slice(0, 150))}${n.body.length > 150 ? '…' : ''}<br>
              <span class="muted">${titleCase(n.template_key)}${n.reference ? ` · ${n.reference}` : ''}</span>
              ${n.last_error ? `<br><span style="color:var(--bad)">${escapeHtml(n.last_error)}</span>` : ''}</td>
            <td>${statusBadge(n.status)}</td>
            <td class="num">
              ${n.channel === 'internal' ? '' : `
                ${n.wa_link ? `<a class="btn btn-ghost btn-xs" href="${n.wa_link}" target="_blank" rel="noopener">WhatsApp ↗</a>` : ''}
                ${n.status !== 'sent' ? `<button class="btn btn-ghost btn-xs" data-mark="${n.id}">Mark sent</button>` : ''}
                ${n.status === 'failed' ? `<button class="btn btn-ghost btn-xs" data-retry="${n.id}">Retry</button>` : ''}`}
            </td>
          </tr>`).join('') || '<tr><td colspan="5" class="empty">Outbox is empty.</td></tr>'}</tbody>
      </table></div>`,

    templates: () => html`
      <p class="small muted" style="margin-top:0">Placeholders: {{first_name}}, {{service_list}}, {{date}}, {{time}}, {{staff_name}}, {{reference}}, {{salon_name}}, {{booking_url}}, {{offer_title}}. Unknown placeholders are left visible so typos are obvious.</p>
      ${tplRes.templates.map((t) => html`
        <div class="card" style="margin-bottom:.8rem;background:#fbf7f2">
          <div class="card-head"><h3>${t.name}</h3><span class="small muted mono">${t.key}</span></div>
          <textarea rows="3" style="width:100%;border:1px solid var(--line);border-radius:9px;padding:.6rem" data-tpl="${t.key}">${t.body}</textarea>
          <button class="btn btn-sm" style="margin-top:.5rem" data-save-tpl="${t.key}">Save template</button>
        </div>`) }`,

    broadcast: () => html`
      <div class="form-grid">
        <div class="field"><label>Offer</label>
          <select name="offerId"><option value="">No specific offer</option>${offersRes.offers.map((o) => `<option value="${o.id}">${escapeHtml(o.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Audience</label>
          <select name="segment">${segRes.map((s) => `<option value="${s.key}">${titleCase(s.key)} — ${s.size} clients</option>`).join('')}</select></div>
      </div>
      <p class="small muted">Only clients with WhatsApp and marketing consent are included. Messages queue in the outbox — nothing is sent until you release them.</p>
      <button class="btn" id="sendBroadcast">Queue broadcast</button>`,
  };

  const renderPanel = (tab) => {
    $('#msgPanel').innerHTML = panels[tab]();
    if (tab === 'outbox') {
      $('#msgStatus').addEventListener('change', async (e) => {
        const qs = e.target.value ? `?status=${e.target.value}` : '';
        const r = await api(`/api/admin/notifications${qs}`);
        res.notifications = r.notifications;
        renderPanel('outbox');
      });
      on($('#msgPanel'), 'click', '[data-mark]', async (e, btn) => {
        await api(`/api/admin/notifications/${btn.dataset.mark}/mark-sent`, { method: 'POST' });
        toast('Marked sent');
        messages();
      });
      on($('#msgPanel'), 'click', '[data-retry]', async (e, btn) => {
        await api(`/api/admin/notifications/${btn.dataset.retry}/retry`, { method: 'POST' });
        toast('Requeued');
        messages();
      });
    }
    if (tab === 'templates') {
      on($('#msgPanel'), 'click', '[data-save-tpl]', async (e, btn) => {
        const key = btn.dataset.saveTpl;
        const body = $(`[data-tpl="${key}"]`, $('#msgPanel')).value;
        await api(`/api/admin/templates/${key}`, { method: 'PUT', body: { body } });
        toast('Template saved');
      });
    }
    if (tab === 'broadcast') {
      $('#sendBroadcast').addEventListener('click', async () => {
        const offerId = $('[name="offerId"]', $('#msgPanel')).value || null;
        const segment = $('[name="segment"]', $('#msgPanel')).value;
        try {
          const r = await api('/api/admin/broadcast', { method: 'POST', body: { offerId, segment } });
          toast(`Queued ${r.queued} messages`);
          refreshMessageCount();
        } catch (err) { toast(err.message, 'bad'); }
      });
    }
  };

  renderPanel('outbox');
  on($('#msgTabs'), 'click', '.tab', (e, btn) => {
    $$('#msgTabs .tab').forEach((t) => t.setAttribute('aria-selected', String(t === btn)));
    renderPanel(btn.dataset.tab);
  });
}

/* ══ reports ════════════════════════════════════════════════════════════ */

async function reports() {
  const from = addDaysStr(todayStr(), -29);
  const to = todayStr();
  const data = await api(`/api/admin/reports?from=${from}&to=${to}`);
  setHeader('Reports', `${from} → ${to}`, '<button class="btn btn-ghost btn-sm" id="exportAppts">Export appointments</button>');
  $('#exportAppts').addEventListener('click', () => { window.location.href = `/api/admin/appointments/export.csv?from=${from}&to=${to}`; });

  const maxDay = Math.max(1, ...data.byDay.map((d) => d.revenuePence));
  $('#view').innerHTML = html`
    <div class="grid grid-4">
      <div class="kpi"><span>Revenue</span><b>${money(data.totals.revenuePence)}</b><small>${data.totals.completed} completed</small></div>
      <div class="kpi"><span>Average ticket</span><b>${money(data.totals.averagePence)}</b><small>per completed visit</small></div>
      <div class="kpi"><span>Utilisation</span><b>${data.totals.utilisation}%</b><small>of rostered time</small></div>
      <div class="kpi"><span>Lost</span><b>${data.totals.noShows + data.totals.cancelled}</b><small>${data.totals.noShows} no-show · ${data.totals.cancelled} cancelled</small></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Daily revenue</h3><span class="hint">last 30 days</span></div>
      <div class="bar-chart">
        ${data.byDay.map((d) => `<div style="height:${Math.max(2, Math.round((d.revenuePence / maxDay) * 100))}%" title="${d.date}: ${money(d.revenuePence)}"><span>${d.date.slice(8)}</span></div>`).join('')}
      </div>
      <div style="height:1.4rem"></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h3>By stylist</h3></div>
        <table><thead><tr><th>Team</th><th class="num">Visits</th><th class="num">Revenue</th></tr></thead>
          <tbody>${data.byStaff.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td class="num">${s.visits}</td><td class="num">${money(s.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>Top services</h3></div>
        <table><thead><tr><th>Service</th><th class="num">Booked</th><th class="num">Revenue</th></tr></thead>
          <tbody>${data.byService.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td class="num">${s.count}</td><td class="num">${money(s.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No data</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Top clients</h3></div>
      <table><thead><tr><th>Client</th><th class="num">Visits</th><th class="num">Spend</th></tr></thead>
        <tbody>${data.topClients.map((c) => `<tr><td>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</td><td class="num">${c.visits}</td><td class="num">${money(c.spend)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No data</td></tr>'}</tbody>
      </table>
    </div>`;
}

/* ══ settings ═══════════════════════════════════════════════════════════ */

async function settings() {
  const res = await api('/api/admin/settings');
  setHeader('Settings', 'Salon preferences', '');
  const s = res.settings;
  const groups = [
    ['Salon', [
      ['salon.name', 'Salon name'], ['salon.timezone', 'Timezone'], ['salon.currency', 'Currency'],
      ['salon.country_code', 'WhatsApp country code'],
    ]],
    ['Booking rules', [
      ['booking.slot_step_minutes', 'Slot step (minutes)'], ['booking.min_notice_minutes', 'Minimum notice (minutes)'],
      ['booking.horizon_days', 'Booking horizon (days)'], ['booking.cancellation_notice_hours', 'Cancellation notice (hours)'],
      ['booking.max_services', 'Max services per booking'],
    ]],
    ['WhatsApp', [
      ['whatsapp.mode', 'Mode (link or api)'], ['whatsapp.reminder_hours', 'Reminder lead time (hours)'],
      ['whatsapp.sender_name', 'Sender name'],
    ]],
    ['Loyalty, reviews & packages', [
      ['loyalty.points_per_pound', 'Points per £1'],
      ['packages.enabled', 'Packages online (1/0)'],
      ['reviews.headline', 'Reviews heading'],
      ['reviews.google_url', 'Google reviews link'],
      ['reviews.google_place_id', 'Google place ID'],
      ['reviews.min_rating', 'Minimum rating shown'],
    ]],
    ['Birthday treats', [
      ['birthday.enabled', 'Enabled (1/0)'],
      ['birthday.discount_pct', 'Discount (%)'],
      ['birthday.window_days', 'Days either side'],
    ]],
  ];

  $('#view').innerHTML = html`
    <div class="card" style="border-left:4px solid ${res.whatsappConfigured ? 'var(--ok)' : 'var(--warn)'}">
      <b>WhatsApp: ${res.whatsappMode === 'api' ? 'Cloud API connected' : 'click-to-send links'}</b>
      <p class="small muted" style="margin:.3rem 0 0">
        ${res.whatsappConfigured
          ? 'Credentials detected. Messages send automatically from the outbox.'
          : 'Add WHATSAPP_TOKEN and WHATSAPP_PHONE_ID to .env to send automatically. Until then the outbox opens wa.me links.'}
      </p>
    </div>

    ${groups.map(([title, items]) => html`
      <div class="card">
        <div class="card-head"><h3>${title}</h3></div>
        <div class="form-grid">
          ${items.map(([key, label]) => html`
            <div class="field"><label>${label}</label>
              <input name="${key}" value="${s[key] ?? ''}" ${['booking.auto_confirm'].includes(key) ? '' : ''}>
            </div>`)}
        </div>
      </div>`)}

    <div class="row">
      <button class="btn" id="saveSettings">Save settings</button>
      <span class="small muted">Only the owner can change settings.</span>
    </div>

    <div class="card">
      <div class="card-head"><h3>Recent activity</h3></div>
      <div id="auditList" class="small muted">Loading…</div>
    </div>`;

  $('#saveSettings').addEventListener('click', async () => {
    const body = {};
    for (const [, items] of groups) for (const [key] of items) body[key] = $(`[name="${key}"]`, $('#view')).value;
    try {
      await api('/api/admin/settings', { method: 'PATCH', body });
      toast('Settings saved');
    } catch (err) { toast(err.message, 'bad'); }
  });

  try {
    const { entries } = await api('/api/admin/audit?limit=25');
    $('#auditList').innerHTML = entries.map((a) => `
      <div class="conflict"><code>${a.action}</code><span><b>${escapeHtml(a.actor_name)}</b> · ${a.entity}${a.detail ? ` · ${escapeHtml(a.detail)}` : ''}<br>
        <span class="muted">${new Date(a.created_at).toLocaleString('en-GB')}</span></span></div>`).join('') || 'No activity yet.';
  } catch {
    $('#auditList').textContent = 'Audit log unavailable.';
  }
}

/* ══ Treatwell Integration ═════════════════════════════════════════════════════════ */

async function treatwell() {
  const res = await api('/api/admin/treatwell/status');
  setHeader('Treatwell Connect', 'Customer & booking imports from Treatwell', `
    <div style="display:flex;gap:.5rem;align-items:center">
      <label class="check"><input type="checkbox" id="twEnabled" ${res.enabled ? 'checked' : ''}> Enable integration</label>
      <button class="btn btn-sm" id="saveTwSettings">Save</button>
    </div>`);

  // Import history
  const importsHtml = res.imports.map((imp) => `
    <tr>
      <td>${shortDate(imp.created_at)}</td>
      <td>${imp.type}</td>
      <td>${imp.source}</td>
      <td>${imp.rows_total}</td>
      <td>${imp.rows_created}</td>
      <td>${imp.rows_updated}</td>
      <td>${imp.rows_skipped}</td>
      <td><span class="badge badge-${imp.status}">${imp.status}</span></td>
    </tr>`).join('');

  // Mappings
  const { mappings } = await api('/api/admin/treatwell/mappings');
  const pendingMappings = mappings.filter(m => m.status === 'pending');
  const confirmedMappings = mappings.filter(m => m.status === 'confirmed');
  const rejectedMappings = mappings.filter(m => m.status === 'rejected');

  const renderMappings = (list, showActions = true) => list.map((m) => `
    <tr>
      <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
      <td>${escapeHtml(m.phone)}</td>
      <td>${escapeHtml(m.email || '')}</td>
      <td>${escapeHtml(m.treatwell_customer_id || '')}</td>
      <td>${escapeHtml(m.treatwell_email || '')}</td>
      <td>${Math.round(m.confidence * 100)}%</td>
      <td><span class="badge badge-${m.status}">${m.status}</span></td>
      ${showActions ? `
      <td>
        <button class="btn btn-ghost btn-sm" data-confirm="${m.id}">Confirm</button>
        <button class="btn btn-ghost btn-sm" data-reject="${m.id}">Reject</button>
      </td>` : ''}
    </tr>`).join('');

  $('#view').innerHTML = html`
    <div class="card" style="border-left:4px solid ${res.enabled ? 'var(--ok)' : 'var(--warn)'}">
      <b>Status: ${res.enabled ? 'Connected' : 'Not configured'}</b>
      <p class="small muted" style="margin:.3rem 0 0">
        ${res.lastSync ? `Last sync: ${longDate(res.lastSync)}` : 'No sync yet.'}
        ${res.apiUrl ? ` · API: ${res.apiUrl}` : ''}
      </p>
    </div>

    <div class="card">
      <div class="card-head"><h3>Import Customers</h3></div>
      <p class="small muted">Paste Treatwell customer export CSV (headers: first_name,last_name,email,phone,date_of_birth,address,notes)</p>
      <div class="field full"><textarea id="twCustomerCsv" rows="8" placeholder="first_name,last_name,email,phone,date_of_birth,address,notes&#10;John,Doe,john@example.com,07700900123,1990-01-15,123 Street,..."></textarea></div>
      <button class="btn" id="importCustomers">Import Customers</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Import Bookings</h3></div>
      <p class="small muted">Paste Treatwell booking export CSV (headers: customer_email,customer_phone,service_name,staff_name,start_date,start_time,duration_minutes,status,notes)</p>
      <div class="field full"><textarea id="twBookingCsv" rows="8" placeholder="customer_email,customer_phone,service_name,staff_name,start_date,start_time,duration_minutes,status,notes&#10;john@example.com,,Cut & Finish,Anya Petrova,2026-01-20,10:00,45,confirmed,"></textarea></div>
      <button class="btn" id="importBookings">Import Bookings</button>
    </div>

    <div class="card">
      <div class="card-head"><h3>Import History</h3></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Source</th><th>Total</th><th>Created</th><th>Updated</th><th>Skipped</th><th>Status</th></tr></thead>
          <tbody>${importsHtml || '<tr><td colspan="8" class="empty">No imports yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Customer Mappings (${pendingMappings.length} pending)</h3></div>
      <p class="small muted">Review potential duplicates. Confirm = link to existing client. Reject = create new client on next import.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Local Client</th><th>Phone</th><th>Email</th><th>Treatwell ID</th><th>Treatwell Email</th><th>Confidence</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody id="pendingMappings">${renderMappings(pendingMappings) || '<tr><td colspan="8" class="empty">No pending mappings</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <details>
      <summary>Confirmed mappings (${confirmedMappings.length})</summary>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Local Client</th><th>Phone</th><th>Email</th><th>Treatwell ID</th><th>Treatwell Email</th><th>Confidence</th><th>Status</th></tr></thead>
          <tbody>${renderMappings(confirmedMappings, false) || '<tr><td colspan="7" class="empty">None</td></tr>'}</tbody>
        </table>
      </div>
    </details>

    <details>
      <summary>Rejected mappings (${rejectedMappings.length})</summary>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Local Client</th><th>Phone</th><th>Email</th><th>Treatwell ID</th><th>Treatwell Email</th><th>Confidence</th><th>Status</th></tr></thead>
          <tbody>${renderMappings(rejectedMappings, false) || '<tr><td colspan="7" class="empty">None</td></tr>'}</tbody>
        </table>
      </div>
    </details>

    <div class="card">
      <div class="card-head"><h3>Manual Merge</h3></div>
      <p class="small muted">Merge two client records into one (keeps all history). Use when duplicates are found outside of imports.</p>
      <div class="field-grid">
        <div class="field"><label>Keep this client (ID)</label><input id="mergeKeepId" placeholder="cus_001"></div>
        <div class="field"><label>Merge this client (ID)</label><input id="mergeMergeId" placeholder="cus_002"></div>
      </div>
      <button class="btn btn-danger" id="mergeClients">Merge Clients</button>
    </div>`;

  // Event listeners
  $('#importCustomers').addEventListener('click', async () => {
    const csvText = $('#twCustomerCsv').value.trim();
    if (!csvText) return toast('Paste CSV data first', 'bad');
    $('#importCustomers').disabled = true;
    try {
      const res = await api('/api/admin/treatwell/import/customers', { method: 'POST', body: { csvText } });
      toast(`Imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped`);
      location.reload();
    } catch (err) { toast(err.message, 'bad'); }
    finally { $('#importCustomers').disabled = false; }
  });

  $('#importBookings').addEventListener('click', async () => {
    const csvText = $('#twBookingCsv').value.trim();
    if (!csvText) return toast('Paste CSV data first', 'bad');
    $('#importBookings').disabled = true;
    try {
      const res = await api('/api/admin/treatwell/import/bookings', { method: 'POST', body: { csvText } });
      toast(`Imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped`);
      location.reload();
    } catch (err) { toast(err.message, 'bad'); }
    finally { $('#importBookings').disabled = false; }
  });

  $('#saveTwSettings').addEventListener('click', async () => {
    const enabled = $('#twEnabled').checked ? '1' : '0';
    try {
      await api('/api/admin/treatwell/settings', { method: 'PATCH', body: { 'treatwell.enabled': enabled } });
      toast('Settings saved');
    } catch (err) { toast(err.message, 'bad'); }
  });

  // Mapping actions (event delegation)
  $('#pendingMappings').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.confirm) {
      try {
        await api(`/api/admin/treatwell/mappings/${btn.dataset.confirm}/confirm`, { method: 'POST' });
        toast('Mapping confirmed');
        location.reload();
      } catch (err) { toast(err.message, 'bad'); }
    }
    if (btn.dataset.reject) {
      try {
        await api(`/api/admin/treatwell/mappings/${btn.dataset.reject}/reject`, { method: 'POST' });
        toast('Mapping rejected');
        location.reload();
      } catch (err) { toast(err.message, 'bad'); }
    }
  });

  $('#mergeClients').addEventListener('click', async () => {
    const keepId = $('#mergeKeepId').value.trim();
    const mergeId = $('#mergeMergeId').value.trim();
    if (!keepId || !mergeId) return toast('Both client IDs required', 'bad');
    if (keepId === mergeId) return toast('Cannot merge a client with themselves', 'bad');
    if (!confirm(`Merge ${mergeId} into ${keepId}? This cannot be undone.`)) return;
    try {
      await api('/api/admin/treatwell/mappings/merge', { method: 'POST', body: { keepId, mergeId } });
      toast('Clients merged');
      location.reload();
    } catch (err) { toast(err.message, 'bad'); }
  });
}
