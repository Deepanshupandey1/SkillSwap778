// Small UI helpers shared by all views
import * as S from './store.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const initials = n => n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase();

export function avatar(u, size = 'w-10 h-10 text-sm', dot = false) {
  const online = dot ? `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white ${u.online ? 'bg-emerald-500' : 'bg-slate-300'}" title="${u.online ? 'Online now' : 'Offline'}"></span>` : '';
  return `<span class="relative inline-flex shrink-0"><span class="${size} rounded-full inline-flex items-center justify-center font-semibold text-white select-none" style="background:linear-gradient(135deg,hsl(${u.hue} 70% 55%),hsl(${(u.hue + 40) % 360} 70% 42%))">${esc(initials(u.name))}</span>${online}</span>`;
}
export function levelBadge(uid, compact = false) {
  const li = S.levelInfo(uid);
  return `<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${li.cls}" title="Level ${li.n}: ${li.name}"><i class="fa-solid ${li.icon} text-[10px]"></i>${compact ? 'L' + li.n : `L${li.n} ${li.name}`}</span>`;
}
export function stars(avg, count) {
  if (!count) return `<span class="text-xs text-slate-400">No ratings yet</span>`;
  return `<span class="inline-flex items-center gap-1 text-sm"><i class="fa-solid fa-star text-amber-400 text-xs"></i><b class="font-semibold text-slate-800">${avg.toFixed(1)}</b><span class="text-slate-400 text-xs">(${count})</span></span>`;
}
export const starRow = (n) => Array.from({ length: 5 }, (_, i) => `<i class="fa-solid fa-star text-xs ${i < n ? 'text-amber-400' : 'text-slate-200'}"></i>`).join('');
export const chip = (t, cls = 'bg-slate-100 text-slate-600') => `<span class="inline-block rounded-md px-2 py-0.5 text-xs ${cls}">${esc(t)}</span>`;
export const credits = (n, cls = '') => `<span class="inline-flex items-center gap-1 font-semibold ${cls}"><i class="fa-solid fa-coins text-amber-500 text-[0.85em]"></i>${n}</span>`;

export function timeAgo(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const dd = Math.floor(h / 24); if (dd < 30) return dd + 'd ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const fmtDate = ts => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

// next calendar occurrence of "Wed 18:00"
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function nextOccurrence(slot) {
  const [d, t] = slot.split(' '); const [hh, mm] = t.split(':').map(Number);
  const now = new Date(); const target = new Date(now);
  let diff = (DOW.indexOf(d) - now.getDay() + 7) % 7;
  target.setDate(now.getDate() + diff); target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 7);
  return target;
}
export function relSlot(slot) {
  const t = nextOccurrence(slot), ms = t - Date.now(), h = Math.round(ms / 3600000);
  if (h < 1) return 'starting soon'; if (h < 24) return `in ${h}h`;
  const d = Math.round(h / 24); return `in ${d}d`;
}

// ---------- toasts ----------
export function toast(msg, kind = 'info') {
  const c = $('#toasts'); if (!c) return;
  const map = { info: ['fa-circle-info', 'bg-slate-900'], ok: ['fa-circle-check', 'bg-emerald-600'], err: ['fa-circle-exclamation', 'bg-rose-600'], coin: ['fa-coins', 'bg-amber-500'] };
  const [ic, bg] = map[kind] || map.info;
  const el = document.createElement('div');
  el.className = `toast pointer-events-auto flex items-start gap-2 text-white text-sm rounded-xl px-4 py-3 shadow-lg ${bg}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<i class="fa-solid ${ic} mt-0.5"></i><span>${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 300); }, 4200);
}

// ---------- modal ----------
export function openModal(html, { wide = false, onClose } = {}) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" id="modal-wrap">
    <div class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" data-modal-close></div>
    <div role="dialog" aria-modal="true" class="modal-card relative bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl">${html}</div></div>`;
  root._onClose = onClose;
  document.body.classList.add('overflow-hidden');
  const f = root.querySelector('[autofocus]') || root.querySelector('input,textarea,select,button'); f && f.focus();
  return root;
}
export function closeModal() {
  const root = $('#modal-root'); if (!root || !root.innerHTML) return;
  root.innerHTML = ''; document.body.classList.remove('overflow-hidden');
  if (root._onClose) { const f = root._onClose; root._onClose = null; f(); }
}
document.addEventListener('click', e => { if (e.target.closest('[data-modal-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

export function confirmDialog({ title, body, confirm = 'Confirm', danger = false, icon = 'fa-circle-question' }) {
  return new Promise(res => {
    let done = false;
    openModal(`<div class="p-6"><div class="flex gap-4"><span class="w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${danger ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}"><i class="fa-solid ${icon}"></i></span>
      <div><h3 class="text-lg font-semibold text-slate-900">${esc(title)}</h3><div class="mt-1 text-sm text-slate-600">${body}</div></div></div>
      <div class="mt-6 flex justify-end gap-2"><button class="btn-ghost" data-act="no">Cancel</button><button class="${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes" autofocus>${esc(confirm)}</button></div></div>`, { onClose: () => { if (!done) { done = true; res(false); } } });
    $('#modal-root').addEventListener('click', function h(e) {
      const b = e.target.closest('[data-act]'); if (!b) return;
      done = true; $('#modal-root').removeEventListener('click', h); res(b.dataset.act === 'yes'); closeModal();
    });
  });
}
