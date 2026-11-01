// Sessions, Profile, Wallet (ledger), Leaderboard, Recap
import * as S from './store.js';
import { LEVELS } from './data.js';
import { $, $$, esc, avatar, levelBadge, stars, starRow, chip, credits, toast, openModal, closeModal, confirmDialog, timeAgo, fmtDate } from './ui.js';
import { openBooking } from './views_dir.js';

const STATUS = {
  requested: ['Awaiting peer', 'bg-amber-50 text-amber-800 ring-amber-200', 'fa-hourglass-half'],
  accepted: ['Accepted: ready to join', 'bg-emerald-50 text-emerald-800 ring-emerald-200', 'fa-circle-check'],
  live: ['Live now', 'bg-emerald-600 text-white ring-emerald-700', 'fa-video'],
  completed: ['Completed', 'bg-slate-100 text-slate-700 ring-slate-200', 'fa-flag-checkered'],
  declined: ['Declined', 'bg-rose-50 text-rose-700 ring-rose-200', 'fa-ban'],
  cancelled: ['Cancelled', 'bg-slate-100 text-slate-500 ring-slate-200', 'fa-xmark'],
};
const statusPill = s => { const [l, c, i] = STATUS[s]; return `<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c}"><i class="fa-solid ${i} text-[10px]"></i>${l}</span>`; };
const empty = (icon, title, text, cta = '') => `<div class="card p-10 text-center"><i class="fa-solid ${icon} text-4xl text-slate-300"></i><h3 class="mt-3 font-semibold text-slate-900">${title}</h3><p class="text-sm text-slate-500 mt-1">${text}</p>${cta}</div>`;
const wrap = (inner, wide = 'max-w-6xl') => `<div class="${wide} mx-auto px-4 sm:px-6 py-6 fade-in">${inner}</div>`;

// ================= SESSIONS =================
export function mountSessions(root) {
  let tab = 'active';
  const me = S.me();
  function sessionCard(s) {
    const isL = s.learnerId === me, other = S.user(isL ? s.mentorId : s.learnerId);
    let actions = '';
    if (s.status === 'requested') actions = isL
      ? `<span class="text-xs text-slate-500">Nothing charged yet.</span><button class="btn-outline" data-cancel="${s.id}">Cancel request</button>`
      : `<button class="btn-outline" data-decline="${s.id}">Decline</button><button class="btn-primary" data-accept="${s.id}"><i class="fa-solid fa-check"></i>Accept</button>`;
    else if (s.status === 'accepted' || s.status === 'live') actions = `<button class="btn-ghost text-rose-600" data-cancel="${s.id}">Cancel</button><a href="#/room/${s.id}" class="btn-primary bg-emerald-600 hover:bg-emerald-700"><i class="fa-solid fa-video"></i>${s.status === 'live' ? 'Rejoin room' : 'Join room'}</a>`;
    else if (s.status === 'completed') actions = `${!s.rating && isL ? `<a href="#/recap/${s.id}" class="btn-outline text-amber-700 border-amber-300"><i class="fa-regular fa-star"></i>Rate</a>` : ''}<a href="#/recap/${s.id}" class="btn-outline"><i class="fa-regular fa-file-lines"></i>Recap</a>`;
    const net = s.status === 'completed' ? (isL ? `<span class="text-rose-600 font-semibold">−${s.cost}</span>` : `<span class="text-emerald-600 font-semibold">+${s.cost}</span>`) : `<span class="text-slate-700">${credits(s.cost)}</span>`;
    return `<article class="card p-4 sm:p-5" data-sid="${s.id}">
      <div class="flex items-start gap-3">${avatar(other, 'w-11 h-11', true)}
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2"><h3 class="font-semibold text-slate-900">${esc(s.title)}</h3>${statusPill(s.status)}</div>
          <p class="text-sm text-slate-500 mt-0.5">${isL ? 'with peer' : 'helping'} <a class="font-medium text-slate-700 hover:text-indigo-600" href="#/u/${other.id}">${esc(other.name)}</a> · ${esc(s.topic)} · ${esc(s.lang)} · ${s.duration} min</p>
          ${s.problem ? `<p class="text-sm text-slate-600 mt-2 line-clamp-2">${esc(s.problem)}</p>` : ''}
          <p class="text-xs text-slate-400 mt-2"><i class="fa-regular fa-clock mr-1"></i>${s.status === 'completed' ? 'Finished ' + timeAgo(s.endedAt) : s.slot !== 'As soon as possible' ? 'Preferred ' + esc(s.slot) : 'As soon as possible'} · requested ${timeAgo(s.createdAt)}</p>
        </div>
        <div class="text-right shrink-0"><div class="text-lg">${net}</div><div class="text-[11px] text-slate-400">${s.status === 'completed' ? (isL ? 'spent' : 'earned') : isL ? 'you pay' : 'you earn'}</div></div>
      </div>
      ${actions ? `<div class="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">${actions}</div>` : ''}
    </article>`;
  }
  function render() {
    const all = S.sessionsOf(me);
    const incoming = all.filter(s => s.mentorId === me && s.status === 'requested');
    const active = all.filter(s => ['requested', 'accepted', 'live'].includes(s.status) && !incoming.includes(s));
    const history = all.filter(s => ['completed', 'declined', 'cancelled'].includes(s.status));
    const list = { active, history }[tab];
    root.innerHTML = wrap(`
      <div class="flex flex-wrap items-end justify-between gap-3 mb-5"><div><h1 class="text-2xl font-bold text-slate-900">My sessions</h1><p class="text-sm text-slate-500">Requests, upcoming and past sessions. Credits move only when a session is completed.</p></div><a href="#/peers" class="btn-primary"><i class="fa-solid fa-magnifying-glass"></i>Find a peer</a></div>
      ${incoming.length ? `<section id="incoming" class="mb-6"><h2 class="font-semibold text-slate-900 mb-3 flex items-center gap-2"><span class="w-6 h-6 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">${incoming.length}</span>Requests waiting for you</h2><div class="grid gap-3">${incoming.map(sessionCard).join('')}</div></section>` : ''}
      <div class="seg mb-4" role="tablist"><button class="seg-btn ${tab === 'active' ? 'on' : ''}" data-tab="active">Upcoming &amp; pending <span class="text-xs text-slate-400">${active.length}</span></button><button class="seg-btn ${tab === 'history' ? 'on' : ''}" data-tab="history">History <span class="text-xs text-slate-400">${history.length}</span></button></div>
      <div class="grid gap-3">${list.length ? list.map(sessionCard).join('') : empty('fa-calendar-xmark', tab === 'active' ? 'Nothing scheduled' : 'No history yet', tab === 'active' ? 'Find a peer and send your first request.' : 'Completed sessions will show up here.', tab === 'active' ? '<a href="#/peers" class="btn-primary mt-4">Browse peers</a>' : '')}</div>`);
  }
  render();
  root.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); return; }
    const a = e.target.closest('[data-accept]');
    if (a) { const r = await S.acceptSession(a.dataset.accept); if (r.ok) { toast('Accepted. Both of you can now join the live room.', 'ok'); } else toast(r.error, 'err'); return; }
    const d = e.target.closest('[data-decline]');
    if (d) { if (await confirmDialog({ title: 'Decline this request?', body: 'The learner will be notified. No credits are charged.', confirm: 'Decline', danger: true, icon: 'fa-ban' })) { const result = await S.declineSession(d.dataset.decline); if (result.ok) toast('Request declined', 'info'); else toast(result.error, 'err'); } return; }
    const c = e.target.closest('[data-cancel]');
    if (c) { if (await confirmDialog({ title: 'Cancel this session?', body: 'No credits will be charged to anyone.', confirm: 'Cancel session', danger: true, icon: 'fa-xmark' })) { const result = await S.cancelSession(c.dataset.cancel, me); if (result.ok) toast('Session cancelled. No credits charged.', 'info'); else toast(result.error, 'err'); } }
  });
  return { refresh: render };
}

// ================= PROFILE =================
export function mountProfile(root, uid) {
  const u = S.user(uid);
  if (!u) { root.innerHTML = wrap(empty('fa-user-slash', 'User not found', 'This profile does not exist.', '<a href="#/peers" class="btn-primary mt-4">Back to directory</a>')); return; }
  const me = S.me(), isMe = uid === me;
  let tab = 'overview';
  function render() {
    const li = S.levelInfo(uid), st = S.stats(uid), badges = S.badgesOf(uid), can = S.canBook(me, uid);
    const reviews = S.reviewsOf(uid);
    const un = badges.filter(b => b.unlocked).length;
    const ledger = S.ledgerOf(uid).sort((a, b) => b.ts - a.ts);
    root.innerHTML = wrap(`
    <section class="card overflow-hidden">
      <div class="h-24 sm:h-28" style="background:linear-gradient(120deg,hsl(${u.hue} 70% 55%),hsl(${(u.hue + 60) % 360} 70% 45%))"></div>
      <div class="px-5 sm:px-8 pb-6 -mt-10 sm:-mt-12">
        <div class="flex flex-wrap items-end gap-4"><div class="ring-4 ring-white rounded-full">${avatar(u, 'w-20 h-20 sm:w-24 sm:h-24 text-2xl', true)}</div>
          <div class="min-w-0 flex-1 pt-12 sm:pt-0"><div class="flex flex-wrap items-center gap-2"><h1 class="text-2xl font-bold text-slate-900">${esc(u.name)}</h1>${levelBadge(uid)}${isMe ? '<span class="text-xs rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5">You</span>' : ''}</div><p class="text-slate-500">${esc(u.title)} · ${u.exp} yr${u.exp > 1 ? 's' : ''} experience</p></div>
          <div class="flex gap-2">${isMe ? `<a href="#/wallet" class="btn-outline"><i class="fa-solid fa-receipt"></i>My ledger</a>` : can.ok ? `<button class="btn-primary" id="p-book"><i class="fa-solid fa-calendar-plus"></i>Book a session · ${credits(S.rate(uid), 'text-white')}/15m</button>` : `<button class="btn-outline opacity-60 cursor-not-allowed" disabled title="${esc(can.reason)}"><i class="fa-solid fa-lock"></i>${esc(can.reason)}</button>`}</div></div>
        <div class="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-xl bg-amber-50 ring-1 ring-amber-100 p-4"><div class="text-xs text-amber-700 font-medium">Credit balance</div><div class="mt-1 text-2xl font-bold text-slate-900">${isMe ? credits(S.balance(uid)) : '<span class="text-lg text-slate-500">Private</span>'}</div></div>
          <div class="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4"><div class="text-xs text-slate-500 font-medium">Sessions helped</div><div class="mt-1 text-2xl font-bold text-slate-900">${st.helped}</div></div>
          <div class="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4"><div class="text-xs text-slate-500 font-medium">Helpfulness rating</div><div class="mt-1 text-2xl font-bold text-slate-900">${st.ratingCount ? st.rating.toFixed(1) : '–'}<span class="text-sm font-normal text-slate-400"> ${st.ratingCount ? `(${st.ratingCount})` : ''}</span></div></div>
          <div class="rounded-xl bg-slate-50 ring-1 ring-slate-100 p-4"><div class="text-xs text-slate-500 font-medium">Badges</div><div class="mt-1 text-2xl font-bold text-slate-900">${un}<span class="text-sm font-normal text-slate-400"> / ${badges.length}</span></div></div>
        </div>
        <div class="mt-5"><div class="flex justify-between text-xs text-slate-500 mb-1"><span class="font-medium">Level ${li.n} · ${li.name}</span><span>${li.next ? `${li.toNext} more earned credits to <b>${li.next.name}</b>` : 'Top level reached'}</span></div><div class="progress"><i style="width:${li.pct}%"></i></div></div>
      </div>
    </section>
    <div class="seg my-5" role="tablist">${[['overview', 'Overview'], ['badges', 'Badges'], ['history', 'Credit history'], ['reviews', `Reviews (${reviews.length})`]].map(([k, l]) => `<button class="seg-btn ${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="tab-body">${tabBody(tab, { u, st, badges, reviews, ledger, can })}</div>`);
    const pb = $('#p-book', root); if (pb) pb.onclick = () => openBooking(uid);
  }
  function tabBody(t, c) {
    const { u, badges, reviews, ledger } = c;
    if (t === 'overview') return `<div class="grid lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2 space-y-5"><div class="card p-5"><h2 class="font-semibold text-slate-900 mb-2">About</h2><p class="text-slate-600 text-sm leading-relaxed">${esc(u.bio)}</p></div>
        <div class="card p-5"><h2 class="font-semibold text-slate-900 mb-3">Can help with</h2><div class="flex flex-wrap gap-2">${u.skills.map(s => `<span class="rounded-lg bg-indigo-50 text-indigo-700 text-sm px-3 py-1">${esc(s)}</span>`).join('')}</div>
        <div class="mt-4 grid sm:grid-cols-2 gap-4 text-sm"><div><div class="label">Topics</div><div class="flex flex-wrap gap-1.5">${u.topics.map(t => chip(t)).join('')}</div></div><div><div class="label">Languages</div><div class="flex flex-wrap gap-1.5">${u.langs.map(t => chip(t)).join('')}</div></div><div><div class="label">Speaks</div><span class="text-slate-600">${u.speaks.join(', ')}</span></div></div></div>
        <div class="card p-5"><h2 class="font-semibold text-slate-900 mb-3">Recent feedback</h2>${reviews.slice(0, 2).map(r => reviewHTML(r)).join('') || '<p class="text-sm text-slate-500">No written feedback yet.</p>'}</div></div>
      <div class="space-y-5"><div class="card p-5"><h2 class="font-semibold text-slate-900 mb-3"><i class="fa-regular fa-clock mr-1.5 text-slate-400"></i>Free time slots</h2><div class="flex flex-wrap gap-2">${u.slots.map(s => `<span class="rounded-md ring-1 ring-slate-200 px-2.5 py-1 text-sm text-slate-700">${esc(s)}</span>`).join('')}</div><p class="text-xs text-slate-400 mt-3">Weekly recurring availability</p></div>
        <div class="card p-5"><h2 class="font-semibold text-slate-900 mb-3">Rate</h2><div class="flex items-center justify-between text-sm"><span class="text-slate-500">15 min</span>${credits(S.price(u.id, 15))}</div><div class="flex items-center justify-between text-sm mt-1"><span class="text-slate-500">30 min</span>${credits(S.price(u.id, 30))}</div><div class="flex items-center justify-between text-sm mt-1"><span class="text-slate-500">45 min</span>${credits(S.price(u.id, 45))}</div></div></div></div>`;
    if (t === 'badges') return `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${badges.map(b => `<div class="card p-4 flex gap-4 items-center ${b.unlocked ? '' : 'bg-slate-50'}"><div class="badge-hex bg-gradient-to-br ${b.color} ${b.unlocked ? '' : 'badge-locked'}"><i class="fa-solid ${b.icon}"></i></div><div class="min-w-0 flex-1"><div class="font-semibold text-slate-900 flex items-center gap-2">${esc(b.name)}${b.unlocked ? '<i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>' : ''}</div><p class="text-xs text-slate-500">${esc(b.desc)}</p>${b.unlocked ? '' : `<div class="progress mt-2"><i style="width:${Math.round(b.value / b.target * 100)}%"></i></div><div class="text-[11px] text-slate-400 mt-1">${Math.floor(b.value)} / ${b.target}</div>`}</div></div>`).join('')}</div>`;
    if (t === 'reviews') return `<div class="card p-5">${reviews.map(reviewHTML).join('') || '<p class="text-sm text-slate-500">No reviews yet.</p>'}</div>`;
    return `<div class="card overflow-hidden">${ledgerTable(ledger.slice(0, 15))}${ledger.length > 15 ? `<div class="p-3 text-center border-t border-slate-100"><a href="#/wallet" class="text-sm text-indigo-600 hover:underline">${isMe ? 'See full ledger' : ''}</a></div>` : ''}</div>`;
  }
  const reviewHTML = r => { const f = S.user(r.fromId) || { name: 'Peer', hue: 200 }; return `<div class="py-3 first:pt-0 last:pb-0 border-b last:border-0 border-slate-100"><div class="flex items-center gap-2">${avatar(f, 'w-7 h-7 text-[10px]')}<span class="text-sm font-medium text-slate-800">${esc(f.name)}</span><span class="text-xs">${starRow(r.stars)}</span><span class="ml-auto text-xs text-slate-400">${timeAgo(r.ts)}</span></div><p class="text-sm text-slate-600 mt-1.5">${esc(r.text)}</p>${r.sessionTitle ? `<p class="text-xs text-slate-400 mt-1">on “${esc(r.sessionTitle)}”</p>` : ''}</div>`; };
  render();
  root.addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; render(); } });
  return { refresh: render };
}

const TYPE = { earn: ['Earned', 'bg-emerald-50 text-emerald-700', 'fa-arrow-down'], spend: ['Spent', 'bg-rose-50 text-rose-700', 'fa-arrow-up'], bonus: ['Bonus', 'bg-amber-50 text-amber-700', 'fa-star'], grant: ['Grant', 'bg-sky-50 text-sky-700', 'fa-gift'], reserve: ['Reserved', 'bg-indigo-50 text-indigo-700', 'fa-lock'], release: ['Released', 'bg-slate-100 text-slate-700', 'fa-lock-open'] };
function ledgerTable(rows, withBalance) {
  if (!rows.length) return `<p class="p-8 text-center text-sm text-slate-500">No credit activity yet.</p>`;
  return `<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th class="text-left font-medium px-4 py-2.5">When</th><th class="text-left font-medium px-4 py-2.5">Type</th><th class="text-left font-medium px-4 py-2.5">Reason</th><th class="text-right font-medium px-4 py-2.5">Credits</th>${withBalance ? '<th class="text-right font-medium px-4 py-2.5">Balance</th>' : ''}</tr></thead><tbody class="divide-y divide-slate-100">${rows.map(l => { const [lb, cl, ic] = TYPE[l.type] || ['Activity', 'bg-slate-100 text-slate-700', 'fa-circle-info']; return `<tr class="hover:bg-slate-50"><td class="px-4 py-3 whitespace-nowrap text-slate-500" title="${new Date(l.ts).toLocaleString()}">${timeAgo(l.ts)}</td><td class="px-4 py-3"><span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cl}"><i class="fa-solid ${ic} text-[9px]"></i>${lb}</span></td><td class="px-4 py-3 text-slate-700">${esc(l.reason)}${l.sessionId && S.session(l.sessionId) ? ` <a class="text-indigo-600 text-xs hover:underline" href="#/recap/${l.sessionId}">recap</a>` : ''}</td><td class="px-4 py-3 text-right font-semibold whitespace-nowrap ${l.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}">${l.delta > 0 ? '+' : l.delta < 0 ? '−' : '—'}${l.delta === 0 ? '' : Math.abs(l.delta)}</td>${withBalance ? `<td class="px-4 py-3 text-right text-slate-500 whitespace-nowrap">${l.bal}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
}

// ================= WALLET / LEDGER =================
export function mountWallet(root) {
  const me = S.me(); let f = 'all';
  function render() {
    const rowsAsc = S.ledgerOf(me).slice().sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0)); let run = 0; rowsAsc.forEach(r => { run += Number(r.delta || 0); r.bal = run; });
    const rows = rowsAsc.slice().reverse().filter(r => f === 'all' || (f === 'in' ? r.delta > 0 : r.delta < 0));
    const li = S.levelInfo(me), res = S.reserved(me);
    const pending = S.sessions().filter(s => s.learnerId === me && ['accepted', 'live'].includes(s.status));
    root.innerHTML = wrap(`
    <h1 class="text-2xl font-bold text-slate-900">Credit ledger</h1><p class="text-sm text-slate-500 mb-5">Every earned, spent, reserved, or released credit transaction is shown here. Pending reservations are not final charges.</p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div class="card p-5 bg-gradient-to-br from-amber-50 to-white"><div class="text-xs font-medium text-amber-700">Balance</div><div class="mt-1 text-3xl font-bold text-slate-900">${credits(S.balance(me))}</div><div class="text-xs text-slate-500 mt-1">${S.available(me)} available${res ? ` · ${res} reserved` : ''}</div></div>
      <div class="card p-5"><div class="text-xs font-medium text-emerald-700">Total earned</div><div class="mt-1 text-3xl font-bold text-emerald-600">+${S.earned(me)}</div><div class="text-xs text-slate-500 mt-1">from completed help sessions &amp; bonuses</div></div>
      <div class="card p-5"><div class="text-xs font-medium text-rose-700">Total spent</div><div class="mt-1 text-3xl font-bold text-rose-600">−${S.spent(me)}</div><div class="text-xs text-slate-500 mt-1">on completed peer sessions</div></div>
      <div class="card p-5"><div class="text-xs font-medium text-slate-500">Level</div><div class="mt-1">${levelBadge(me)}</div><div class="progress mt-3"><i style="width:${li.pct}%"></i></div><div class="text-xs text-slate-500 mt-1">${li.next ? `${li.toNext} credits to ${li.next.name}` : 'Max level'}</div></div>
    </div>
    ${pending.length ? `<div class="card p-4 mb-5 bg-indigo-50 border-indigo-200"><div class="text-sm font-semibold text-indigo-900 mb-2"><i class="fa-solid fa-lock mr-1.5"></i>Reserved for upcoming sessions (not charged yet)</div>${pending.map(s => `<div class="flex justify-between text-sm text-indigo-800"><span>${esc(s.title)}</span><span>${credits(s.cost)}</span></div>`).join('')}</div>` : ''}
    <div class="card overflow-hidden"><div class="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100"><h2 class="font-semibold text-slate-900">Transactions <span class="text-slate-400 font-normal text-sm">(${rows.length})</span></h2><div class="seg">${[['all', 'All'], ['in', 'Earned'], ['out', 'Spent']].map(([k, l]) => `<button class="seg-btn ${f === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>${ledgerTable(rows, true)}</div>
    <div class="mt-5 grid md:grid-cols-2 gap-4"><div class="card p-5"><h3 class="font-semibold text-slate-900 mb-2"><i class="fa-solid fa-circle-info text-indigo-500 mr-1.5"></i>How credits work</h3><ul class="text-sm text-slate-600 space-y-1.5 list-disc pl-5"><li>Your one-time 500-credit welcome bonus helps you get started but does not count toward levels.</li><li>Sessions cost credits based on duration; the other participant earns credits after completion.</li><li>Credits move <b>only</b> when a session is completed.</li><li>Helpful sessions rated 4★ or 5★ earn the helper a 5-credit bonus.</li></ul></div>
    <div class="card p-5"><h3 class="font-semibold text-slate-900 mb-2"><i class="fa-solid fa-ranking-star text-indigo-500 mr-1.5"></i>Levels</h3><div class="space-y-1.5">${LEVELS.map(l => `<div class="flex items-center justify-between text-sm"><span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${l.cls}"><i class="fa-solid ${l.icon} text-[10px]"></i>L${l.n} ${l.name}</span><span class="text-slate-500">${l.min}+ earned from helping</span></div>`).join('')}</div></div></div>`);
  }
  render();
  root.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; render(); } });
  return { refresh: render };
}

// ================= LEADERBOARD =================
export function mountLeaderboard(root) {
  let by = 'helped';
  const me = S.me();
  function render() {
    const rows = S.users().map(u => ({ u, st: S.stats(u.id), earned: S.earned(u.id), un: S.badgesOf(u.id).filter(b => b.unlocked).length })).filter(r => r.st.helped > 0 || r.earned > 0);
    const key = { helped: r => r.st.helped, rating: r => r.st.ratingCount >= 5 ? r.st.rating : -1, earned: r => r.earned }[by];
    rows.sort((a, b) => key(b) - key(a));
    const medal = i => i < 3 ? `<span class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style="background:${['#f59e0b', '#94a3b8', '#b45309'][i]}">${i + 1}</span>` : `<span class="w-8 text-center text-slate-400 font-semibold">${i + 1}</span>`;
    root.innerHTML = wrap(`
    <div class="flex flex-wrap items-end justify-between gap-3 mb-5"><div><h1 class="text-2xl font-bold text-slate-900">Top helpers</h1><p class="text-sm text-slate-500">The community members who give the most help.</p></div>
      <div class="seg">${[['helped', 'Sessions helped'], ['rating', 'Top rated'], ['earned', 'Credits earned']].map(([k, l]) => `<button class="seg-btn ${by === k ? 'on' : ''}" data-by="${k}">${l}</button>`).join('')}</div></div>
    ${by === 'rating' ? '<p class="text-xs text-slate-400 mb-3">Showing peers with at least 5 ratings.</p>' : ''}
    <div class="card divide-y divide-slate-100">${rows.filter(r => by !== 'rating' || r.st.ratingCount >= 5).map((r, i) => `<a href="#/u/${r.u.id}" class="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 ${r.u.id === me ? 'bg-indigo-50/60' : ''}">${medal(i)}${avatar(r.u, 'w-10 h-10', true)}<div class="min-w-0 flex-1"><div class="font-semibold text-slate-900 flex flex-wrap items-center gap-2">${esc(r.u.name)}${r.u.id === me ? '<span class="text-xs rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5">You</span>' : ''}${levelBadge(r.u.id, true)}</div><div class="text-xs text-slate-500 truncate">${esc(r.u.title)}</div></div>
      <div class="hidden sm:flex items-center gap-1 text-xs text-slate-500" title="${r.un} badges">${S.badgesOf(r.u.id).filter(b => b.unlocked).slice(-4).map(b => `<span class="w-6 h-6 rounded-md bg-gradient-to-br ${b.color} text-white flex items-center justify-center text-[10px]" title="${esc(b.name)}"><i class="fa-solid ${b.icon}"></i></span>`).join('')}</div>
      <div class="text-right w-28"><div class="font-bold text-slate-900">${by === 'helped' ? `${r.st.helped}<span class="text-xs font-normal text-slate-400"> sessions</span>` : by === 'rating' ? `<i class="fa-solid fa-star text-amber-400 text-sm"></i> ${r.st.rating.toFixed(2)}` : credits(r.earned)}</div><div class="text-[11px] text-slate-400">${by === 'helped' ? stars(r.st.rating, r.st.ratingCount).replace(/<[^>]+>/g, '') : by === 'rating' ? r.st.ratingCount + ' ratings' : r.st.helped + ' sessions'}</div></div></a>`).join('')}</div>`);
  }
  render();
  root.addEventListener('click', e => { const b = e.target.closest('[data-by]'); if (b) { by = b.dataset.by; render(); } });
  return { refresh: render };
}

// ================= RECAP =================
export function mountRecap(root, sid) {
  const s = S.session(sid), me = S.me();
  if (!s) { root.innerHTML = wrap(empty('fa-circle-question', 'Recap not found', 'This session does not exist.', '<a href="#/sessions" class="btn-primary mt-4">My sessions</a>'), 'max-w-3xl'); return; }
  if (s.status !== 'completed') { root.innerHTML = wrap(empty('fa-hourglass-half', 'Session not completed yet', 'The recap is available after the session ends.', `<a href="#/sessions" class="btn-primary mt-4">My sessions</a>`), 'max-w-3xl'); return; }
  const isL = s.learnerId === me, isM = s.mentorId === me;
  const L = S.user(s.learnerId), M = S.user(s.mentorId);
  let pick = 0;
  function render() {
    const r = s.recap || {};
    const bonus = s.rating ? S.bonusFor(s.rating.stars) : 0;
    root.innerHTML = wrap(`
    <div class="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-6 sm:p-8 mb-5 text-center relative overflow-hidden"><div class="absolute -left-8 -top-8 w-40 h-40 rounded-full bg-white/10"></div>
      <div class="relative"><div class="w-14 h-14 rounded-full bg-white/20 mx-auto flex items-center justify-center coin-pop"><i class="fa-solid fa-coins text-2xl"></i></div><h1 class="mt-3 text-2xl font-bold">Session complete</h1><p class="text-emerald-50 text-sm mt-1">${esc(s.title)}</p>
      <div class="mt-5 inline-flex flex-wrap items-center justify-center gap-4 sm:gap-6 bg-white/15 rounded-xl px-5 py-3"><div class="text-center">${avatar(L, 'w-10 h-10 text-sm')}<div class="text-xs mt-1">${esc(L.name.split(' ')[0])}</div><div class="font-bold">−${s.cost}</div></div><i class="fa-solid fa-arrow-right-long text-xl opacity-70"></i><div class="text-center">${avatar(M, 'w-10 h-10 text-sm')}<div class="text-xs mt-1">${esc(M.name.split(' ')[0])}</div><div class="font-bold">+${s.cost}${bonus ? ` <span class="text-amber-200">+${bonus}</span>` : ''}</div></div></div>
      ${(isL || isM) ? `<p class="mt-3 text-sm text-emerald-50">Your new balance: <b>${S.balance(me)}</b> credits</p>` : ''}</div></div>
    ${isL && !s.rating ? `<section id="rate-box" class="card p-5 mb-5 border-amber-200 bg-amber-50/50"><h2 class="font-semibold text-slate-900">How helpful was ${esc(M.name.split(' ')[0])}?</h2><p class="text-sm text-slate-500">Helpful sessions rated 4★ or 5★ earn your peer a 5-credit bonus.</p>
      <div class="mt-2 flex items-center" id="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map(n => `<button class="star-btn" data-star="${n}" role="radio" aria-label="${n} star${n > 1 ? 's' : ''}" aria-checked="false"><i class="fa-solid fa-star"></i></button>`).join('')}<span id="star-hint" class="ml-3 text-sm text-slate-500"></span></div>
      <textarea id="rate-text" rows="2" maxlength="240" class="input mt-3" placeholder="What did they help you with? (optional)"></textarea><div class="mt-3 flex justify-end"><button id="rate-send" class="btn-primary" disabled><i class="fa-solid fa-paper-plane"></i>Submit rating</button></div></section>`
      : s.rating ? `<section class="card p-4 mb-5 flex items-center gap-3"><span class="text-lg">${starRow(s.rating.stars)}</span><div class="text-sm text-slate-600 flex-1">${s.rating.comment ? `“${esc(s.rating.comment)}”` : 'Rated ' + s.rating.stars + ' out of 5'}</div>${bonus ? `<span class="text-xs rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 font-medium"><i class="fa-solid fa-star mr-1"></i>+${bonus} bonus credits to peer</span>` : ''}</section>` : ''}
    <div class="grid lg:grid-cols-2 gap-5">
      <section class="card p-5"><h2 class="font-semibold text-slate-900 mb-3"><i class="fa-regular fa-note-sticky mr-1.5 text-slate-400"></i>Session notes</h2><p class="text-sm text-slate-600 whitespace-pre-wrap">${esc(r.notes) || '<span class="text-slate-400">No notes were taken.</span>'}</p>
        <dl class="mt-4 grid grid-cols-2 gap-3 text-sm border-t border-slate-100 pt-4"><div><dt class="text-xs text-slate-400">Mentor</dt><dd><a class="text-indigo-600 hover:underline" href="#/u/${M.id}">${esc(M.name)}</a></dd></div><div><dt class="text-xs text-slate-400">Learner</dt><dd><a class="text-indigo-600 hover:underline" href="#/u/${L.id}">${esc(L.name)}</a></dd></div><div><dt class="text-xs text-slate-400">Topic</dt><dd>${esc(s.topic)} · ${esc(s.lang)}</dd></div><div><dt class="text-xs text-slate-400">Finished</dt><dd>${fmtDate(s.endedAt)}</dd></div></dl>
        ${s.problem ? `<div class="mt-4 border-t border-slate-100 pt-4"><div class="text-xs text-slate-400 mb-1">Original problem</div><p class="text-sm text-slate-600">${esc(s.problem)}</p></div>` : ''}</section>
      <section class="card p-5 min-w-0"><div class="flex items-center justify-between mb-3"><h2 class="font-semibold text-slate-900"><i class="fa-solid fa-code mr-1.5 text-slate-400"></i>Final code</h2>${r.code ? `<button id="copy-code" class="btn-ghost !py-1"><i class="fa-regular fa-copy"></i>Copy</button>` : ''}</div>${r.code ? `<pre class="code">${esc(r.code)}</pre>` : '<p class="text-sm text-slate-400">No code was saved.</p>'}</section>
    </div>
    ${r.board ? `<section class="card p-5 mt-5"><div class="flex items-center justify-between mb-3"><h2 class="font-semibold text-slate-900"><i class="fa-solid fa-pen-ruler mr-1.5 text-slate-400"></i>Final whiteboard</h2><a class="btn-ghost !py-1" href="${r.board}" download="whiteboard.jpg"><i class="fa-solid fa-download"></i>Download</a></div><img src="${r.board}" alt="Final whiteboard" class="rounded-lg ring-1 ring-slate-200 w-full max-w-3xl"></section>` : ''}
    <div class="mt-6 flex flex-wrap justify-center gap-3"><a href="#/peers" class="btn-primary"><i class="fa-solid fa-magnifying-glass"></i>Find another peer</a><a href="#/wallet" class="btn-outline"><i class="fa-solid fa-receipt"></i>View ledger</a><a href="#/sessions" class="btn-outline">My sessions</a></div>`, 'max-w-5xl');
    const cc = $('#copy-code', root); if (cc) cc.onclick = () => navigator.clipboard.writeText(r.code).then(() => toast('Code copied', 'ok'));
    const box = $('#rate-box', root);
    if (box) {
      const hints = ['Not helpful', 'Somewhat helpful', 'Helpful', 'Very helpful', 'Excellent!'];
      const paint = n => { $$('.star-btn', box).forEach(b => { b.classList.toggle('on', +b.dataset.star <= n); b.setAttribute('aria-checked', +b.dataset.star === pick); }); $('#star-hint', box).textContent = n ? hints[n - 1] + (S.bonusFor(n) ? ` · peer gets +${S.bonusFor(n)} bonus` : '') : ''; };
      $$('.star-btn', box).forEach(b => { b.onmouseenter = () => paint(+b.dataset.star); b.onclick = () => { pick = +b.dataset.star; paint(pick); $('#rate-send', box).disabled = false; }; });
      $('#stars', box).onmouseleave = () => paint(pick);
      $('#rate-send', box).onclick = async () => { const r2 = await S.rateSession(sid, pick, $('#rate-text', box).value); if (r2.ok) toast(r2.bonus ? `Thanks! ${M.name.split(' ')[0]} earned +${r2.bonus} bonus credits.` : 'Thanks for your feedback!', 'ok'); else toast(r2.error, 'err'); };
    }
  }
  render();
  return { refresh: () => { const sess = S.session(sid); Object.assign(s, sess); render(); } };
}
