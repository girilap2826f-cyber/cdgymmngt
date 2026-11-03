'use strict';
/* ===== helpers ===== */
const $ = (s, e = document) => e.querySelector(s);
const S = { token: localStorage.getItem('gm_token'), name: localStorage.getItem('gm_name') || 'Owner',
            plans: [], settings: {}, photo: null, stream: null, pv: Date.now(), last: null, cur: null };
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const today = () => ymd(new Date());
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const addMonths = (s, n) => { const d = new Date(s + 'T00:00:00'), day = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() !== day) d.setDate(0); return ymd(d); };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const gym = () => S.settings.gymName || 'our gym';

function toast(msg, err) {
  const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), err ? 5000 : 3200);
}

async function api(path, o = {}) {
  const headers = { Authorization: 'Bearer ' + S.token };
  let body = o.body;
  if (body !== undefined && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const res = await fetch('/api' + path, { method: o.method || 'GET', headers, body });
  if (res.status === 401) { logout(); throw new Error('Please sign in again'); }
  if (o.blob) {
    if (!res.ok) { let m = 'Download failed'; try { m = (await res.json()).message || m; } catch (e) {} throw new Error(m); }
    return res.blob();
  }
  const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) throw new Error((data && data.message) || 'Request failed (' + res.status + ')');
  return data;
}
const get = p => api(p);
const post = (p, b) => api(p, { method: 'POST', body: b });
const put = (p, b) => api(p, { method: 'PUT', body: b });
const del = p => api(p, { method: 'DELETE' });

async function openPdf(path) { const b = await api(path, { blob: true }); window.open(URL.createObjectURL(b), '_blank'); }
async function saveFile(path, name) {
  const b = await api(path, { blob: true });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click();
}
function wa(phone, text) {
  let n = String(phone || '').replace(/\D/g, ''); if (n.length === 10) n = '91' + n;
  window.open('https://wa.me/' + n + '?text=' + encodeURIComponent(text), '_blank');
}
const pageHead = (t, actions = '') => `<div class="page-head"><h2>${t}</h2><div>${actions}</div></div>`;
const kindLabel = k => ({ REGISTRATION: 'Joining', RENEWAL: 'Renewal', DUE_PAYMENT: 'Due payment' }[k] || k);
const planOpts = sel => S.plans.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)} - ${inr(p.payable)}</option>`).join('');
const modeOpts = () => '<option value="CASH">Cash</option><option value="UPI">UPI</option><option value="CARD">Card</option>';

function avatar(m, cls = '') {
  return m.hasPhoto ? `<img class="av ${cls}" alt="" src="/api/members/${m.id}/photo?token=${S.token}&v=${S.pv}">`
                    : `<div class="av ${cls}">${esc((m.fullName || '?')[0].toUpperCase())}</div>`;
}
function statusBadge(m) { return m.status === 'ACTIVE' ? '<span class="badge ok">Active</span>' : '<span class="badge bad">Expired</span>'; }
function daysChip(m) {
  const d = m.daysLeft;
  if (d < 0) return `<span class="badge bad">Expired ${-d} day${d === -1 ? '' : 's'} ago</span>`;
  if (d === 0) return '<span class="badge warn">Expires today</span>';
  return `<span class="badge ${d <= 7 ? 'warn' : 'info'}">${d} day${d === 1 ? '' : 's'} left</span>`;
}
const remindBtn = m => `<button class="btn sm" data-act="remind" data-phone="${esc(m.phone)}" data-name="${esc(m.fullName)}" data-exp="${m.expiryDate}" data-days="${m.daysLeft}">WhatsApp</button>`;

/* ===== modal ===== */
function openModal(html, narrow) { $('#modalBox').className = 'modal-box' + (narrow ? ' narrow' : ''); $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { camStop(); S.photo = null; $('#modal').classList.add('hidden'); $('#modalBox').innerHTML = ''; }

/* ===== auth + boot ===== */
const VIEWS = {
  dashboard: ['Dashboard', viewDashboard], members: ['Members', viewMembers], renewals: ['Expiry & renewals', viewRenewals],
  payments: ['Payments & dues', viewPayments], plans: ['Plans', viewPlans], expenses: ['Expenses', viewExpenses],
  checkins: ['Check-ins', viewCheckins], settings: ['Settings', viewSettings]
};
$('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button data-view="${k}">${v[0]}</button>`).join('');

function logout() { localStorage.removeItem('gm_token'); S.token = null; $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
async function boot() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  try { [S.plans, S.settings] = await Promise.all([get('/plans'), get('/settings')]); } catch (e) { return; }
  applyBrand(); go('dashboard');
}
function applyBrand() {
  $('#brandName').textContent = S.settings.gymName || 'Gym';
  const img = $('#brandLogo'); img.classList.remove('hidden');
  img.onerror = () => img.classList.add('hidden');
  img.src = `/api/settings/logo?token=${S.token}&v=${Date.now()}`;
}
function go(v) {
  S.view = v; camStop();
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $('#main').innerHTML = '<p class="muted">Loading…</p>';
  VIEWS[v][1]().catch(e => { $('#main').innerHTML = `<p class="error">${esc(e.message)}</p>`; });
}
const refresh = () => go(S.view);

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#lerr').textContent = '';
  try {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#lu').value, password: $('#lp').value }) });
    const j = await res.json(); if (!res.ok) throw new Error(j.message);
    S.token = j.token; S.name = j.name; localStorage.setItem('gm_token', j.token); localStorage.setItem('gm_name', j.name);
    $('#lp').value = ''; boot();
  } catch (err) { $('#lerr').textContent = err.message; }
});

/* ===== dashboard ===== */
async function viewDashboard() {
  const d = await get('/dashboard');
  const max = Math.max(1, ...d.trend.flatMap(t => [Number(t.revenue), Number(t.expense)]));
  const pop = Object.entries(d.planPopularity), pmax = Math.max(1, ...pop.map(x => x[1]));
  const stat = (l, v, c = '') => `<div class="card stat ${c}"><span>${l}</span><b>${v}</b></div>`;
  $('#main').innerHTML = pageHead(`Hello, ${esc(S.name)}`, `<button class="btn primary" data-act="new-member">+ New member</button>`) + `
  <div class="hero">
    <div class="hero-main"><small>Active members</small><div class="big">${d.activeMembers}</div>
      <div class="split"><span>${d.totalMembers} total</span><span>${d.expiredMembers} expired</span><span>${d.todayCheckIns} checked in today</span></div></div>
    <div class="stats">
      ${stat('Revenue this month', inr(d.monthlyRevenue), 'good')}
      ${stat('Expenses this month', inr(d.monthlyExpenses))}
      ${stat(d.monthlyProfit >= 0 ? 'Profit this month' : 'Loss this month', inr(Math.abs(d.monthlyProfit)), d.monthlyProfit >= 0 ? 'good' : 'bad')}
      ${stat('Pending dues', inr(d.pendingDues), d.pendingDues > 0 ? 'warn' : '')}
      ${stat('Expiring in 7 days', d.expiringSoonCount, d.expiringSoonCount ? 'warn' : '')}
      ${stat("Today's check-ins", d.todayCheckIns)}
    </div></div>
  <div class="grid-2">
    <div class="card"><h3>Revenue and expenses, last 6 months</h3>
      <div class="bars">${d.trend.map(t => `<div class="bar-group"><div class="pair">
        <i class="r" title="Revenue ${inr(t.revenue)}" style="height:${Number(t.revenue) / max * 100}%"></i>
        <i class="e" title="Expenses ${inr(t.expense)}" style="height:${Number(t.expense) / max * 100}%"></i></div><em>${t.month}</em></div>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Revenue</span><span><i style="background:var(--amber)"></i>Expenses</span></div></div>
    <div class="card"><h3>Plan popularity</h3>${pop.length ? pop.map(([n, c]) => `<div class="hbar"><div class="t"><span>${esc(n)}</span><b>${c}</b></div><div class="b"><i style="width:${c / pmax * 100}%"></i></div></div>`).join('') : '<p class="muted">Add members to see which plans sell best.</p>'}</div>
  </div>
  <div class="card tbl" style="margin-top:16px"><div style="padding:18px 18px 4px"><h3>Expiring in the next 7 days</h3></div>
    ${d.expiringSoon.length ? `<table><tbody>${d.expiringSoon.map(m => `<tr><td><div class="who">${avatar(m)}<div><b>${esc(m.fullName)}</b><small>${esc(m.phone)}</small></div></div></td>
      <td>${fmtDate(m.expiryDate)}</td><td>${daysChip(m)}</td><td class="num"><div class="row-actions">${remindBtn(m)}<button class="btn sm primary" data-act="renew" data-id="${m.id}">Renew</button></div></td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No memberships expire this week.</div>'}</div>`;
}

/* ===== members ===== */
async function viewMembers() {
  $('#main').innerHTML = pageHead('Members', '<button class="btn primary" data-act="new-member">+ New member</button>') + `
  <div class="card toolbar"><input id="mq" placeholder="Search by name, phone or member ID"><select id="ms" style="width:auto"><option value="">All status</option><option value="ACTIVE">Active</option><option value="EXPIRED">Expired</option></select>
  <select id="mp" style="width:auto"><option value="">All plans</option>${S.plans.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
  <div class="card tbl" id="mTable"></div>`;
  ['mq', 'ms', 'mp'].forEach(id => $('#' + id).addEventListener('input', debounce(loadMembers, 250)));
  await loadMembers();
}
async function loadMembers() {
  const q = new URLSearchParams({ q: $('#mq').value, status: $('#ms').value, planId: $('#mp').value });
  const list = await get('/members?' + q);
  $('#mTable').innerHTML = list.length ? `<table><thead><tr><th>Member</th><th>ID</th><th>Plan</th><th>Expiry</th><th>Status</th><th class="num">Due</th><th></th></tr></thead><tbody>
  ${list.map(m => `<tr><td><div class="who">${avatar(m)}<div><b>${esc(m.fullName)}</b><small>${esc(m.phone)}</small></div></div></td>
   <td>${esc(m.memberCode)}</td><td>${esc(m.plan ? m.plan.name : '-')}</td><td>${fmtDate(m.expiryDate)}</td><td>${statusBadge(m)}</td>
   <td class="num">${Number(m.balanceDue) > 0 ? `<span class="badge warn">${inr(m.balanceDue)}</span>` : '-'}</td>
   <td class="num"><div class="row-actions"><button class="btn sm" data-act="view" data-id="${m.id}">Profile</button><button class="btn sm primary" data-act="renew" data-id="${m.id}">Renew</button></div></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">No members found. Use "New member" to register the first one.</div>';
}

function memberForm(m) {
  const edit = !!m; m = m || {}; S.photo = null;
  openModal(`<h2>${edit ? 'Edit member' : 'New member registration'}</h2><form id="mf" class="fgrid">
   <label>Full name *<input name="fullName" required value="${esc(m.fullName)}"></label>
   <label>Phone number *<input name="phone" required inputmode="tel" value="${esc(m.phone)}"></label>
   <label>Email (optional)<input name="email" type="email" value="${esc(m.email)}"></label>
   <label>Date of birth<input name="dateOfBirth" type="date" value="${esc(m.dateOfBirth)}"></label>
   <label>Gender<select name="gender"><option>Male</option><option>Female</option><option>Other</option></select></label>
   <label>ID proof (e.g. Aadhaar last 4 digits)<input name="idProof" maxlength="20" value="${esc(m.idProof)}"></label>
   <label class="span2">Address<input name="address" value="${esc(m.address)}"></label>
   <label>Emergency contact name<input name="emergencyName" value="${esc(m.emergencyName)}"></label>
   <label>Emergency contact number<input name="emergencyPhone" inputmode="tel" value="${esc(m.emergencyPhone)}"></label>
   <label class="span2">Health notes (optional)<input name="healthNotes" value="${esc(m.healthNotes)}"></label>
   ${edit ? '' : `<label>Plan *<select name="planId" id="fPlan" required>${planOpts()}</select></label>
   <label>Start date<input name="startDate" id="fStart" type="date" value="${today()}"></label>
   <label>Amount paid (₹)<input name="amountPaid" id="fPaid" type="number" min="0" step="0.01" required></label>
   <label>Payment mode<select name="paymentMode">${modeOpts()}</select></label>
   <div class="summary span2" id="fSum"></div>`}
   <div class="span2 photo-box"><div id="pv" class="av lg">${m.hasPhoto ? `<img class="av lg" src="/api/members/${m.id}/photo?token=${S.token}&v=${S.pv}" alt="">` : 'Photo'}</div>
     <div><button type="button" class="btn sm" data-act="cam-start">Use camera</button>
       <label class="btn sm" style="display:inline-flex;flex-direction:row;color:inherit">Upload photo<input type="file" id="pf" accept="image/*" hidden></label>
       <button type="button" class="btn sm primary hidden" id="snap" data-act="cam-snap">Capture</button><video id="cam" class="hidden" autoplay playsinline muted></video></div></div>
   <div class="span2 actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">${edit ? 'Save changes' : 'Register and create PDF'}</button></div></form>`);
  $('#mf [name=gender]').value = m.gender || 'Male';
  if (edit) $('#mf').dataset.id = m.id; else { $('#fPlan').addEventListener('change', () => planChanged()); $('#fStart').addEventListener('input', sumUpdate); $('#fPaid').addEventListener('input', sumUpdate); planChanged(); }
  $('#pf').addEventListener('change', async e => { if (e.target.files[0]) setPhoto(e.target.files[0]); });
}
function curPlan(sel) { return S.plans.find(p => p.id === Number($(sel).value)); }
function planChanged() { const p = curPlan('#fPlan'); if (p) $('#fPaid').value = p.payable; sumUpdate(); }
function sumUpdate() {
  const p = curPlan('#fPlan'); if (!p) return;
  const start = $('#fStart').value || today(), paid = Number($('#fPaid').value || 0);
  $('#fSum').textContent = `Plan price ${inr(p.payable)}${Number(p.discountPercent) ? ` (after ${p.discountPercent}% off)` : ''}  |  Valid till ${fmtDate(addMonths(start, p.durationMonths))}  |  Balance due ${inr(Math.max(0, p.payable - paid))}`;
}
async function shrink(blob) {
  const img = await createImageBitmap(blob), s = Math.min(1, 640 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}
async function setPhoto(blob) {
  S.photo = await shrink(blob);
  $('#pv').innerHTML = `<img class="av lg" alt="" src="${URL.createObjectURL(S.photo)}">`;
}
async function camStart() {
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = $('#cam'); v.srcObject = S.stream; v.classList.remove('hidden'); $('#snap').classList.remove('hidden');
  } catch (e) { toast('Camera not available: ' + e.message, true); }
}
function camSnap() {
  const v = $('#cam'), c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(async b => { await setPhoto(b); camStop(); }, 'image/jpeg', 0.9);
}
function camStop() {
  if (S.stream) S.stream.getTracks().forEach(t => t.stop()); S.stream = null;
  const v = $('#cam'), s = $('#snap'); if (v) v.classList.add('hidden'); if (s) s.classList.add('hidden');
}
async function uploadPhoto(id) {
  if (!S.photo) return; const fd = new FormData(); fd.append('file', S.photo, 'photo.jpg');
  await api(`/members/${id}/photo`, { method: 'POST', body: fd }); S.pv = Date.now();
}
async function saveMember(form) {
  const data = Object.fromEntries(new FormData(form));
  Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
  if (data.planId) data.planId = Number(data.planId);
  if (data.amountPaid !== undefined) data.amountPaid = Number(data.amountPaid);
  const id = form.dataset.id;
  if (id) { await put('/members/' + id, data); await uploadPhoto(id); closeModal(); toast('Member updated'); refresh(); return; }
  const res = await post('/members', data);
  try { await uploadPhoto(res.member.id); } catch (e) { toast('Member saved but photo failed: ' + e.message, true); }
  S.photo = null; doneModal('Member registered', res.member.id && (await get('/members/' + res.member.id)), res.payment);
}
function doneModal(title, m, p) {
  S.last = { m, p }; camStop();
  openModal(`<h2>${title}</h2><div class="profile-head">${avatar(m, 'lg')}<div><b style="font-size:19px">${esc(m.fullName)}</b><div class="muted">${esc(m.memberCode)} | ${esc(m.phone)}</div></div></div>
   <dl class="kv"><dt>Plan</dt><dd>${esc(p.planName)}</dd><dt>Valid</dt><dd>${fmtDate(p.periodStart)} to ${fmtDate(p.periodEnd)}</dd>
   <dt>Paid</dt><dd>${inr(p.amount)} (${p.mode})</dd><dt>Balance due</dt><dd>${inr(p.balanceAfter)}</dd><dt>Receipt no.</dt><dd>${esc(p.receiptNo)}</dd></dl>
   <div class="actions"><button class="btn" data-act="close">Close</button><button class="btn" data-act="mail-doc">Email</button>
   <button class="btn" data-act="wa-doc">Share on WhatsApp</button><button class="btn primary" data-act="pdf" data-path="/payments/${p.id}/pdf">Open PDF</button></div>`);
  refreshIfList();
}
const refreshIfList = () => { if (['members', 'dashboard', 'renewals', 'payments'].includes(S.view)) go(S.view); };
function docMessage() {
  const { m, p } = S.last;
  return `Hi ${m.fullName}, welcome to ${gym()}! Member ID: ${m.memberCode}. Plan: ${p.planName}, valid ${fmtDate(p.periodStart)} to ${fmtDate(p.periodEnd)}. Paid ${inr(p.amount)}, balance ${inr(p.balanceAfter)}. Receipt no. ${p.receiptNo}. Billing contact: ${S.settings.billingNumber || ''}`;
}

async function memberProfile(id) {
  const [m, pays] = await Promise.all([get('/members/' + id), get(`/members/${id}/payments`)]); S.cur = m;
  openModal(`<div class="profile-head">${avatar(m, 'lg')}<div><h2 style="margin:0">${esc(m.fullName)}</h2><div class="muted">${esc(m.memberCode)} ${statusBadge(m)}</div></div></div>
  <dl class="kv"><dt>Phone</dt><dd>${esc(m.phone)}</dd><dt>Email</dt><dd>${esc(m.email || '-')}</dd><dt>Address</dt><dd>${esc(m.address || '-')}</dd>
  <dt>Date of birth</dt><dd>${fmtDate(m.dateOfBirth)} ${m.gender ? '| ' + esc(m.gender) : ''}</dd>
  <dt>Emergency contact</dt><dd>${esc(m.emergencyName || '-')} ${esc(m.emergencyPhone || '')}</dd><dt>ID proof</dt><dd>${esc(m.idProof || '-')}</dd>
  <dt>Health notes</dt><dd>${esc(m.healthNotes || '-')}</dd><dt>Plan</dt><dd>${esc(m.plan ? m.plan.name : '-')} (${fmtDate(m.startDate)} to ${fmtDate(m.expiryDate)})</dd>
  <dt>Balance due</dt><dd>${inr(m.balanceDue)}</dd></dl>
  <h3 style="margin-top:14px">Payment history</h3>
  <div class="card tbl" style="margin:8px 0 14px">${pays.length ? `<table><tbody>${pays.map(p => `<tr><td>${fmtDate(p.paymentDate)}</td><td>${kindLabel(p.kind)}</td><td>${p.mode}</td><td class="num">${inr(p.amount)}</td>
   <td class="num"><button class="btn sm" data-act="pdf" data-path="/payments/${p.id}/pdf">Receipt</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No payments yet.</div>'}</div>
  <div class="actions"><button class="btn danger" data-act="delete" data-id="${m.id}">Delete</button><button class="btn" data-act="edit">Edit</button>
  ${Number(m.balanceDue) > 0 ? `<button class="btn" data-act="due" data-id="${m.id}">Collect due</button>` : ''}
  <button class="btn" data-act="pdf" data-path="/members/${m.id}/pdf">Membership PDF</button><button class="btn primary" data-act="renew" data-id="${m.id}">Renew</button>
  <button class="btn" data-act="close">Close</button></div>`);
}

async function renewForm(id) {
  const m = await get('/members/' + id), cur = m.plan ? m.plan.id : S.plans[0].id; S.cur = m;
  openModal(`<h2>Renew membership</h2><p class="muted">${esc(m.fullName)} (${esc(m.memberCode)}), currently ${m.status === 'ACTIVE' ? 'valid till ' + fmtDate(m.expiryDate) : 'expired on ' + fmtDate(m.expiryDate)}</p>
  <form id="rf" class="fgrid" data-id="${id}"><label class="span2">Plan<select name="planId" id="rPlan">${planOpts(cur)}</select></label>
  <label>Amount paid (₹)<input name="amountPaid" id="rPaid" type="number" min="0" step="0.01" required></label><label>Payment mode<select name="paymentMode">${modeOpts()}</select></label>
  <div class="summary span2" id="rSum"></div><div class="span2 actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Confirm renewal</button></div></form>`, true);
  const upd = () => {
    const p = curPlan('#rPlan'), start = m.status === 'ACTIVE' ? m.expiryDate : today();
    $('#rSum').textContent = `Price ${inr(p.payable)}  |  New expiry ${fmtDate(addMonths(start, p.durationMonths))}  |  Balance after payment ${inr(Math.max(0, p.payable - Number($('#rPaid').value || 0)) + Number(m.balanceDue))}`;
  };
  $('#rPlan').addEventListener('change', () => { $('#rPaid').value = curPlan('#rPlan').payable; upd(); });
  $('#rPaid').addEventListener('input', upd); $('#rPaid').value = curPlan('#rPlan').payable; upd();
}
function dueForm(id) {
  const m = S.cur;
  openModal(`<h2>Collect pending due</h2><p class="muted">${esc(m.fullName)} owes ${inr(m.balanceDue)}</p><form id="df" class="fgrid" data-id="${id}">
  <label>Amount (₹)<input name="amount" type="number" min="1" max="${m.balanceDue}" step="0.01" value="${m.balanceDue}" required></label>
  <label>Payment mode<select name="paymentMode">${modeOpts()}</select></label>
  <div class="span2 actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Record payment</button></div></form>`, true);
}

/* ===== renewals ===== */
async function viewRenewals(days = 7) {
  const list = await get('/members/expiring?days=' + days);
  $('#main').innerHTML = pageHead('Expiry & renewals', `<select id="rd" style="width:auto"><option value="7">Next 7 days</option><option value="15">Next 15 days</option><option value="30">Next 30 days</option></select>`) + `
  <div class="card tbl">${list.length ? `<table><thead><tr><th>Member</th><th>Plan</th><th>Expiry</th><th>Status</th><th class="num">Due</th><th></th></tr></thead><tbody>
  ${list.map(m => `<tr><td><div class="who">${avatar(m)}<div><b>${esc(m.fullName)}</b><small>${esc(m.phone)}</small></div></div></td><td>${esc(m.plan ? m.plan.name : '-')}</td><td>${fmtDate(m.expiryDate)}</td><td>${daysChip(m)}</td>
  <td class="num">${Number(m.balanceDue) > 0 ? inr(m.balanceDue) : '-'}</td><td class="num"><div class="row-actions">${remindBtn(m)}<button class="btn sm primary" data-act="renew" data-id="${m.id}">Renew</button></div></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Nobody is expiring in this period.</div>'}</div>`;
  $('#rd').value = days; $('#rd').addEventListener('change', e => viewRenewals(Number(e.target.value)).catch(x => toast(x.message, true)));
}

/* ===== payments & dues ===== */
async function viewPayments() {
  const [pays, mem] = await Promise.all([get('/payments'), get('/members')]);
  const dues = mem.filter(m => Number(m.balanceDue) > 0), total = dues.reduce((s, m) => s + Number(m.balanceDue), 0);
  $('#main').innerHTML = pageHead('Payments & dues') + `
  <div class="card tbl"><div style="padding:18px 18px 4px"><h3>Pending dues ${dues.length ? `<span class="badge warn">${inr(total)}</span>` : ''}</h3></div>
  ${dues.length ? `<table><tbody>${dues.map(m => `<tr><td><div class="who">${avatar(m)}<div><b>${esc(m.fullName)}</b><small>${esc(m.phone)}</small></div></div></td><td class="num"><b>${inr(m.balanceDue)}</b></td>
   <td class="num"><div class="row-actions"><button class="btn sm" data-act="dues-wa" data-phone="${esc(m.phone)}" data-name="${esc(m.fullName)}" data-due="${m.balanceDue}">WhatsApp</button><button class="btn sm primary" data-act="due-open" data-id="${m.id}">Collect</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No pending dues.</div>'}</div>
  <div class="card tbl" style="margin-top:16px"><div style="padding:18px 18px 4px"><h3>Payment history</h3></div>
  ${pays.length ? `<table><thead><tr><th>Date</th><th>Receipt</th><th>Member</th><th>Type</th><th>Mode</th><th class="num">Amount</th><th></th></tr></thead><tbody>
  ${pays.map(p => `<tr><td>${fmtDate(p.paymentDate)}</td><td>${esc(p.receiptNo)}</td><td>${esc(p.member.fullName)}<br><small class="muted">${esc(p.member.memberCode)}</small></td><td>${kindLabel(p.kind)}</td><td>${p.mode}</td>
  <td class="num"><b>${inr(p.amount)}</b></td><td class="num"><button class="btn sm" data-act="pdf" data-path="/payments/${p.id}/pdf">Receipt</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Payments will appear here once you register a member.</div>'}</div>`;
}

/* ===== plans ===== */
async function viewPlans() {
  S.plans = await get('/plans');
  $('#main').innerHTML = pageHead('Membership plans', '<button class="btn primary" data-act="plan-new">+ Add plan</button>') + `<div class="plan-cards">
  ${S.plans.map(p => `<div class="card"><h3>${esc(p.name)}</h3><b class="price">${inr(p.payable)}</b>${Number(p.discountPercent) ? `<s>${inr(p.price)}</s> <span class="badge ok">${p.discountPercent}% off</span>` : ''}
  <p class="muted">${p.durationMonths} month${p.durationMonths > 1 ? 's' : ''}${p.offerNote ? ' | ' + esc(p.offerNote) : ''}</p>
  <div class="actions" style="justify-content:flex-start"><button class="btn sm" data-act="plan-edit" data-id="${p.id}">Edit</button><button class="btn sm danger" data-act="plan-del" data-id="${p.id}">Remove</button></div></div>`).join('')}</div>`;
}
function planForm(p) {
  p = p || {};
  openModal(`<h2>${p.id ? 'Edit plan' : 'Add plan'}</h2><form id="pf2" class="fgrid" data-id="${p.id || ''}">
  <label class="span2">Plan name<input name="name" required value="${esc(p.name)}" placeholder="e.g. Monthly"></label>
  <label>Duration (months)<select name="durationMonths"><option value="1">1 - Monthly</option><option value="3">3 - Quarterly</option><option value="6">6 - Half-yearly</option><option value="12">12 - Yearly</option></select></label>
  <label>Price (₹)<input name="price" type="number" min="0" step="0.01" required value="${p.price ?? ''}"></label>
  <label>Discount (%)<input name="discountPercent" type="number" min="0" max="100" step="0.5" value="${p.discountPercent ?? 0}"></label>
  <label>Offer note<input name="offerNote" value="${esc(p.offerNote)}" placeholder="e.g. Diwali offer"></label>
  <div class="span2 actions"><button type="button" class="btn" data-act="close">Cancel</button><button class="btn primary">Save plan</button></div></form>`, true);
  $('#pf2 [name=durationMonths]').value = p.durationMonths || 1;
}

/* ===== expenses ===== */
async function viewExpenses() {
  const list = await get('/expenses'), mo = today().slice(0, 7);
  const month = list.filter(e => e.expenseDate.startsWith(mo)).reduce((s, e) => s + Number(e.amount), 0);
  $('#main').innerHTML = pageHead('Expenses', `<span class="badge info">This month ${inr(month)}</span>`) + `
  <form id="ef" class="card toolbar"><select name="category" style="width:auto"><option>Rent</option><option>Electricity</option><option>Salaries</option><option>Equipment</option><option>Maintenance</option><option>Other</option></select>
  <input name="amount" type="number" min="1" step="0.01" placeholder="Amount (₹)" required style="max-width:160px"><input name="expenseDate" type="date" value="${today()}" style="max-width:170px">
  <input name="note" placeholder="Note (optional)"><button class="btn primary">Add expense</button></form>
  <div class="card tbl">${list.length ? `<table><thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>
  ${list.map(e => `<tr><td>${fmtDate(e.expenseDate)}</td><td>${esc(e.category)}</td><td>${esc(e.note || '')}</td><td class="num"><b>${inr(e.amount)}</b></td><td class="num"><button class="btn sm danger" data-act="exp-del" data-id="${e.id}">Delete</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No expenses recorded yet. Add rent, electricity, salaries and equipment costs to see your profit.</div>'}</div>`;
}

/* ===== check-ins ===== */
async function viewCheckins() {
  const list = await get('/attendance/today');
  $('#main').innerHTML = pageHead("Today's check-ins", `<span class="badge info">${list.length} so far</span>`) + `
  <form id="cf" class="card toolbar"><input name="identifier" placeholder="Member ID (e.g. GYM0001) or phone number" required autofocus><button class="btn primary">Check in</button></form>
  <div class="card tbl">${list.length ? `<table><thead><tr><th>Member</th><th>Time</th><th>Membership</th></tr></thead><tbody>${list.map(a => `<tr><td><div class="who">${avatar(a.member)}<div><b>${esc(a.member.fullName)}</b><small>${esc(a.member.memberCode)}</small></div></div></td><td>${esc(a.checkInTime)}</td><td>${daysChip(a.member)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nobody has checked in yet today.</div>'}</div>`;
}

/* ===== settings ===== */
async function viewSettings() {
  S.settings = await get('/settings'); const s = S.settings;
  $('#main').innerHTML = pageHead('Settings') + `<div class="grid-2" style="margin-top:0">
  <form id="sf" class="card fgrid"><h3 class="span2">Gym profile (printed on PDFs)</h3>
    <label>Gym name<input name="gymName" required value="${esc(s.gymName)}"></label><label>Gym email<input name="gymEmail" type="email" value="${esc(s.gymEmail)}"></label>
    <label class="span2">Address<input name="gymAddress" value="${esc(s.gymAddress)}"></label>
    <label class="span2">Terms & conditions (one per line)<textarea name="terms" style="min-height:130px">${esc(s.terms)}</textarea></label>
    <div class="span2 actions"><button class="btn primary">Save profile</button></div></form>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div class="card"><h3>Billing number</h3><p class="muted" style="margin-top:0">Printed on every receipt. Changing it needs an OTP sent to your registered phone (${esc(s.ownerPhoneMasked)}).</p>
      <p style="font-size:22px;font-family:'Barlow Condensed',sans-serif;font-weight:600;margin:8px 0">${esc(s.billingNumber)}</p><button class="btn" data-act="bill-open">Change billing number</button></div>
    <div class="card"><h3>Logo</h3><p class="muted" style="margin-top:0">PNG or JPG, shown in the sidebar and on PDFs.</p><input type="file" id="logoFile" accept="image/png,image/jpeg"></div>
    <div class="card"><h3>Export and backup</h3><div class="actions" style="justify-content:flex-start;margin:0">
      <button class="btn sm" data-act="export" data-f="members">Members (Excel)</button><button class="btn sm" data-act="export" data-f="payments">Payments (Excel)</button><button class="btn sm" data-act="export" data-f="expenses">Expenses (Excel)</button></div>
      <p class="muted" style="margin-bottom:0">Full backup: copy the <b>data</b> folder next to the app while it is stopped.</p></div>
    <form id="pwf" class="card fgrid"><h3 class="span2">Change password</h3><label>Current<input name="oldPassword" type="password" required></label><label>New<input name="newPassword" type="password" minlength="6" required></label>
      <div class="span2 actions"><button class="btn">Update password</button></div></form>
  </div></div>`;
  $('#logoFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return; const fd = new FormData(); fd.append('file', f);
    try { await api('/settings/logo', { method: 'POST', body: fd }); toast('Logo saved'); applyBrand(); } catch (x) { toast(x.message, true); }
  });
}
function billOpen() {
  openModal(`<h2>Change billing number</h2><div id="bstep"><label>New billing number<input id="bn" inputmode="tel" placeholder="10-digit number"></label>
  <div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="bill-otp">Send OTP</button></div></div>`, true);
}
async function billOtp() {
  const num = $('#bn').value.trim(); if (!num) { toast('Enter the new number first', true); return; }
  const r = await post('/settings/billing-number/request-otp');
  $('#bstep').innerHTML = `<p class="muted">${esc(r.message)}. It is valid for 5 minutes.</p>${r.devOtp ? `<p class="otp-hint">Dev mode: your OTP is <b>${r.devOtp}</b> (also printed in the IntelliJ console).</p>` : ''}
  <input type="hidden" id="bn2" value="${esc(num)}"><label>Enter OTP<input id="bo" inputmode="numeric" maxlength="6" autofocus></label>
  <div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="bill-verify">Verify and change to ${esc(num)}</button></div>`;
}
async function billVerify() {
  const r = await post('/settings/billing-number/change', { newNumber: $('#bn2').value, otp: $('#bo').value });
  S.settings.billingNumber = r.billingNumber; closeModal(); toast('Billing number updated'); viewSettings();
}

/* ===== events ===== */
const ACT = {
  close: closeModal, logout,
  'new-member': () => memberForm(),
  view: el => memberProfile(el.dataset.id),
  edit: () => memberForm(S.cur),
  renew: el => renewForm(el.dataset.id),
  due: el => dueForm(el.dataset.id),
  'due-open': async el => { S.cur = await get('/members/' + el.dataset.id); dueForm(el.dataset.id); },
  pdf: el => openPdf(el.dataset.path),
  delete: async el => { if (confirm('Delete this member with all payment and check-in history? This cannot be undone.')) { await del('/members/' + el.dataset.id); closeModal(); toast('Member deleted'); refresh(); } },
  'cam-start': camStart, 'cam-snap': camSnap,
  'wa-doc': async () => { const { m, p } = S.last; wa(m.phone, docMessage()); await saveFile(`/payments/${p.id}/pdf`, `${p.receiptNo}.pdf`); toast('PDF downloaded. Attach it in WhatsApp.'); },
  'mail-doc': async () => { const { m, p } = S.last; await saveFile(`/payments/${p.id}/pdf`, `${p.receiptNo}.pdf`);
    location.href = `mailto:${m.email || ''}?subject=${encodeURIComponent('Your membership at ' + gym())}&body=${encodeURIComponent(docMessage() + '\n\n(Please attach the downloaded PDF.)')}`; },
  remind: el => { const d = Number(el.dataset.days);
    wa(el.dataset.phone, `Hi ${el.dataset.name}, your ${gym()} membership ${d < 0 ? 'expired on' : 'expires on'} ${fmtDate(el.dataset.exp)}. Please renew to keep training without a break. Billing contact: ${S.settings.billingNumber || ''}`); },
  'dues-wa': el => wa(el.dataset.phone, `Hi ${el.dataset.name}, a gentle reminder: ${inr(el.dataset.due)} is pending at ${gym()}. Please clear it at your convenience. Billing contact: ${S.settings.billingNumber || ''}`),
  'plan-new': () => planForm(), 'plan-edit': el => planForm(S.plans.find(p => p.id === Number(el.dataset.id))),
  'plan-del': async el => { if (confirm('Remove this plan? Existing members keep it until they renew.')) { await del('/plans/' + el.dataset.id); toast('Plan removed'); refresh(); } },
  'exp-del': async el => { if (confirm('Delete this expense?')) { await del('/expenses/' + el.dataset.id); refresh(); } },
  'bill-open': billOpen, 'bill-otp': billOtp, 'bill-verify': billVerify,
  export: el => saveFile(`/export/${el.dataset.f}.csv`, `${el.dataset.f}.csv`)
};
document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view]'); if (nav) { go(nav.dataset.view); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  Promise.resolve(ACT[el.dataset.act](el)).catch(err => toast(err.message, true));
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, id = f.id;
  try {
    if (id === 'mf') await saveMember(f);
    else if (id === 'rf') { const d = Object.fromEntries(new FormData(f)); d.planId = Number(d.planId); d.amountPaid = Number(d.amountPaid);
      const res = await post(`/members/${f.dataset.id}/renew`, d); doneModal('Membership renewed', await get('/members/' + f.dataset.id), res.payment); }
    else if (id === 'df') { const d = Object.fromEntries(new FormData(f)); d.amount = Number(d.amount);
      const res = await post(`/members/${f.dataset.id}/pay-due`, d); doneModal('Payment recorded', await get('/members/' + f.dataset.id), res.payment); }
    else if (id === 'pf2') { const d = Object.fromEntries(new FormData(f)); d.durationMonths = Number(d.durationMonths); d.price = Number(d.price); d.discountPercent = Number(d.discountPercent || 0);
      if (f.dataset.id) await put('/plans/' + f.dataset.id, d); else await post('/plans', d); closeModal(); toast('Plan saved'); refresh(); }
    else if (id === 'ef') { const d = Object.fromEntries(new FormData(f)); d.amount = Number(d.amount); if (!d.note) delete d.note; await post('/expenses', d); toast('Expense added'); refresh(); }
    else if (id === 'cf') { const r = await post('/attendance/checkin', Object.fromEntries(new FormData(f)));
      toast(r.alreadyCheckedIn ? `${r.member.fullName} was already checked in today` : `${r.member.fullName} checked in`, r.expired); if (r.expired) toast('Membership has expired. Ask them to renew.', true); refresh(); }
    else if (id === 'sf') { S.settings = await put('/settings', Object.fromEntries(new FormData(f))); applyBrand(); toast('Profile saved'); }
    else if (id === 'pwf') { await post('/auth/change-password', Object.fromEntries(new FormData(f))); f.reset(); toast('Password changed'); }
  } catch (err) { toast(err.message, true); }
});

if (S.token) boot(); else $('#login').classList.remove('hidden');
