// App shell: router, header, user switcher and live API updates
import * as S from './store.js';
import { $, $$, esc, avatar, levelBadge, toast, timeAgo, credits } from './ui.js';
import { mountDirectory } from './views_dir.js';
import { mountCommunity } from './views_community.js';
import { mountSessions, mountProfile, mountWallet, mountLeaderboard, mountRecap } from './views_main.js';
import { mountRoom } from './room.js';

let startup;
try { startup = await S.init(); } catch (error) { throw new Error(`Backend initialization failed: ${error?.message || 'Unable to load PeerLearn data'}`); }
const app = $('#app'), header = $('#app-header');

if (!startup?.authenticated) {
  header.innerHTML = ''; header.classList.add('hidden');
  let authMode = location.hash === '#/register' ? 'register' : 'login';
  let guestDisposer = null;
  function renderAuth() {
    if (guestDisposer) { try { guestDisposer(); } catch {} guestDisposer = null; }
    const register = authMode === 'register';
    app.innerHTML = `
      <section class="min-h-[calc(100vh-2rem)] flex items-center justify-center px-4 py-10 bg-gradient-to-br from-slate-50 via-white to-indigo-50">
        <div class="w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <div class="p-7 sm:p-8">
            <div class="flex items-center gap-2 font-bold text-slate-900 text-xl"><span class="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center"><i class="fa-solid fa-arrows-rotate"></i></span><span>Peer<span class="text-indigo-600">Learn</span></span></div>
            <h1 class="mt-7 text-2xl font-bold tracking-tight text-slate-900">${register ? 'Create your account' : 'Welcome back'}</h1>
            <p class="mt-2 text-sm leading-6 text-slate-500">${register ? 'Join the community, list your skills, and start learning with peers.' : 'Sign in to book live sessions and contribute to the community.'}</p>
            <div class="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button type="button" data-auth-mode="login" class="rounded-md px-3 py-2 text-sm font-semibold ${!register ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}">Sign in</button>
              <button type="button" data-auth-mode="register" class="rounded-md px-3 py-2 text-sm font-semibold ${register ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}">Create account</button>
            </div>
            <form id="peerlearn-auth-form" class="mt-5 space-y-3" novalidate>
              ${register ? `<label class="block text-sm font-medium text-slate-700">Full name<input id="auth-name" name="name" required minlength="2" maxlength="80" autocomplete="name" class="input mt-1 w-full" placeholder="Your name"></label><label class="block text-sm font-medium text-slate-700">Username<input id="auth-username" name="username" required minlength="3" maxlength="24" pattern="[a-zA-Z0-9_.]+" autocomplete="username" class="input mt-1 w-full" placeholder="choose_username"></label><label class="block text-sm font-medium text-slate-700">Skills you can help with<input id="auth-skills" name="skills" maxlength="500" class="input mt-1 w-full" placeholder="React, JavaScript, DSA (optional)"></label><label class="block text-sm font-medium text-slate-700">Programming languages<input id="auth-languages" name="languages" maxlength="300" class="input mt-1 w-full" placeholder="JavaScript, C++ (optional)"></label>` : ''}
              <label class="block text-sm font-medium text-slate-700">${register ? 'Email address' : 'Email or username'}<input id="auth-identity" name="identity" required ${register ? 'type="email" autocomplete="email"' : 'type="text" autocomplete="username"'} class="input mt-1 w-full" placeholder="${register ? 'you@example.com' : 'you@example.com or username'}"></label>
              <label class="block text-sm font-medium text-slate-700">Password<input id="auth-password" name="password" required minlength="8" maxlength="100" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" class="input mt-1 w-full" placeholder="At least 8 characters"></label>
              <p id="auth-error" class="hidden rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert"></p>
              <button id="auth-submit" class="btn-primary w-full justify-center !py-2.5" type="submit">${register ? 'Create account' : 'Sign in'}</button>
            </form>
            <div class="relative my-5"><div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-200"></div></div><div class="relative flex justify-center"><span class="bg-white px-3 text-xs text-slate-400">OR TRY THE DEMO</span></div></div>
            <button id="auth-demo" type="button" class="btn-outline w-full justify-center !py-2.5"><i class="fa-solid fa-play"></i> Explore as demo learner</button>
            <button id="auth-community" type="button" class="text-sm text-indigo-600 hover:text-indigo-800 w-full mt-4"><i class="fa-solid fa-arrow-left mr-1"></i>Back to public community questions</button>
          </div>
        </div>
      </section>`;
  }
  function renderGuestCommunity(questionId = '') {
    if (guestDisposer) { try { guestDisposer(); } catch {} guestDisposer = null; }
    header.classList.add('hidden');
    app.innerHTML = '<div id="guest-community-root"></div>';
    const guestRoot = $('#guest-community-root', app);
    const mounted = mountCommunity(guestRoot, { publicMode: true, questionId, onAuth: () => { location.hash = '#/signin'; } });
    guestDisposer = mounted?.dispose || null;
  }
  function renderGuestRoute() {
    const hash = location.hash || '#/';
    if (hash === '#/signin' || hash === '#/register') {
      authMode = hash === '#/register' ? 'register' : 'login';
      renderAuth();
    } else if (hash === '#/' || hash === '#/community') {
      renderGuestCommunity();
    } else if (hash.startsWith('#/community/')) {
      const questionId = decodeURIComponent(hash.slice('#/community/'.length));
      renderGuestCommunity(questionId);
    } else {
      location.hash = '#/';
    }
  }
  renderGuestRoute();
  addEventListener('hashchange', renderGuestRoute);
  app.addEventListener('click', async event => {
    const modeButton = event.target.closest('[data-auth-mode]');
    if (modeButton) { authMode = modeButton.dataset.authMode; renderAuth(); return; }
    if (event.target.closest('#auth-community')) { location.hash = '#/'; return; }
    if (event.target.closest('#auth-demo')) {
      const demoButton = $('#auth-demo', app); demoButton.disabled = true; demoButton.textContent = 'Signing in…';
      try { await S.loginAccount({ emailOrUsername: 'riya@peerlearn.demo', password: 'PeerLearn123!' }); location.hash = '#/'; location.reload(); }
      catch (error) { renderAuth(); const message = $('#auth-error', app); message.textContent = error.message; message.classList.remove('hidden'); }
    }
  });
  app.addEventListener('submit', async event => {
    if (event.target.id !== 'peerlearn-auth-form') return;
    event.preventDefault();
    const form = event.target, button = $('#auth-submit', app), errorEl = $('#auth-error', app);
    const value = id => $(id, form)?.value?.trim() || '';
    button.disabled = true; button.textContent = authMode === 'register' ? 'Creating account…' : 'Signing in…';
    errorEl.classList.add('hidden');
    try {
      if (authMode === 'register') {
        const split = value => value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 20);
        await S.registerAccount({ name: value('#auth-name'), username: value('#auth-username'), email: value('#auth-identity'), password: $('#auth-password', form).value, skills: split(value('#auth-skills')), languages: split(value('#auth-languages')) });
      } else await S.loginAccount({ emailOrUsername: value('#auth-identity'), password: $('#auth-password', form).value });
      location.hash = '#/'; location.reload();
    } catch (error) {
      errorEl.textContent = error?.message || 'Authentication failed. Please check the fields and try again.'; errorEl.classList.remove('hidden'); button.disabled = false; button.textContent = authMode === 'register' ? 'Create account' : 'Sign in';
    }
  });
} else {
  header.classList.remove('hidden');
  let current = null;          // { refresh?, dispose? }
let routeToken = 0;

const NAV = [['#/', 'Community', 'fa-comments', /^#\/(?:|community(?:\/.*)?)$/], ['#/peers', 'Find peers', 'fa-magnifying-glass', /^#\/peers/], ['#/sessions', 'Sessions', 'fa-calendar-check', /^#\/(sessions|room|recap)/], ['#/wallet', 'Ledger', 'fa-coins', /^#\/wallet/], ['#/leaderboard', 'Leaderboard', 'fa-ranking-star', /^#\/leaderboard/]];

function renderHeader() {
  const openUser = $('#user-menu') && !$('#user-menu').classList.contains('hidden');
  const openBell = $('#bell-menu') && !$('#bell-menu').classList.contains('hidden');
  const me = S.me(), u = S.user(me), hash = location.hash || '#/';
  const notifs = S.notifsOf(me), unread = notifs.filter(n => !n.read).length;
  const pend = S.sessions().filter(s => s.mentorId === me && s.status === 'requested').length;
  header.innerHTML = `<div class="h-full max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-3">
    <a href="#/" class="flex items-center gap-2 font-bold text-slate-900 text-lg shrink-0"><span class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center text-sm"><i class="fa-solid fa-arrows-rotate"></i></span><span class="hidden sm:inline">Peer<span class="text-indigo-600">Learn</span></span></a>
    <nav class="flex items-center gap-0.5 ml-1 sm:ml-4 overflow-x-auto" aria-label="Main">${NAV.map(([h, l, i, re]) => `<a href="${h}" class="relative flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${re.test(hash) ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}" ${re.test(hash) ? 'aria-current="page"' : ''}><i class="fa-solid ${i}"></i><span class="hidden md:inline">${l}</span>${h === '#/sessions' && pend ? `<span class="absolute -top-0.5 right-0 md:static md:ml-0.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center px-1">${pend}</span>` : ''}</a>`).join('')}</nav>
    <div class="ml-auto flex items-center gap-2 sm:gap-3">
      <a href="#/wallet" class="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-50 ring-1 ring-amber-200 px-3 py-1.5 text-sm" title="Your credit balance"><i class="fa-solid fa-coins text-amber-500"></i><b class="text-slate-900" id="hdr-balance">${S.balance(me)}</b></a>
      <div class="relative"><button id="bell" class="relative w-9 h-9 rounded-full hover:bg-slate-100 text-slate-600" aria-label="Notifications" aria-haspopup="true"><i class="fa-regular fa-bell"></i>${unread ? `<span class="absolute top-0.5 right-0.5 min-w-[1rem] h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center px-1">${unread}</span>` : ''}</button><div id="bell-menu" class="hidden absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-xl ring-1 ring-slate-200 overflow-hidden"></div></div>
      <div class="relative"><button id="user-btn" class="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-slate-100" aria-haspopup="true" aria-label="Switch user, signed in as ${esc(u.name)}">${avatar(u, 'w-8 h-8 text-xs')}<span class="hidden lg:block text-left leading-tight"><span class="block text-sm font-medium text-slate-900">${esc(u.name)}</span><span class="block text-[11px] text-slate-500">${u.loginEmail ? 'Demo user · switch' : 'PeerLearn member'}</span></span><i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i></button><div id="user-menu" class="hidden absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl ring-1 ring-slate-200 overflow-hidden"></div></div>
    </div></div>`;
  // keep open menus open across state updates
  if (openUser) { const m = $('#user-menu'); m.innerHTML = userMenu(); m.classList.remove('hidden'); }
  if (openBell) { const m = $('#bell-menu'); m.innerHTML = bellMenu(); m.classList.remove('hidden'); }
}

function userMenu() {
  const me = S.me();
  return `<div class="p-3 border-b border-slate-100 text-xs text-slate-500">Each browser tab has its own identity. Open a second tab as another user to test the live room with two real people.</div>
  <div class="max-h-72 overflow-y-auto scroll-thin py-1">${S.users().filter(u => u.loginEmail).map(u => `<button class="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left ${u.id === me ? 'bg-indigo-50/60' : ''}" data-switch="${u.id}">${avatar(u, 'w-8 h-8 text-xs')}<span class="min-w-0 flex-1"><span class="block text-sm font-medium text-slate-900 truncate">${esc(u.name)}</span><span class="block text-xs text-slate-500 truncate">${esc(u.title)}</span></span>${levelBadge(u.id, true)}${u.id === me ? '<i class="fa-solid fa-check text-indigo-600"></i>' : ''}</button>`).join('')}</div>
  <div class="border-t border-slate-100 p-3 space-y-2">
    <p class="text-xs text-slate-500">Sample accounts are stored in MongoDB. Open a second tab and switch to another peer to test live collaboration and calls.</p>
    <div class="flex gap-2"><a href="#/u/${me}" class="btn-outline flex-1 !py-1.5 text-xs">My profile</a><button id="reset-demo" class="btn-outline flex-1 !py-1.5 text-xs text-rose-600"><i class="fa-solid fa-right-from-bracket"></i>Sign out here</button></div>
  </div>`;
}
function bellMenu() {
  const n = S.notifsOf(S.me()).slice(0, 8);
  return `<div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between"><span class="font-semibold text-slate-900 text-sm">Notifications</span><button id="mark-read" class="text-xs text-indigo-600 hover:underline">Mark all read</button></div>
  <div class="max-h-80 overflow-y-auto scroll-thin">${n.length ? n.map(x => `<a href="${x.link || '#/'}" class="flex gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 ${x.read ? '' : 'bg-indigo-50/40'}"><span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${x.read ? 'bg-transparent' : 'bg-indigo-500'}"></span><span class="min-w-0"><span class="block text-sm text-slate-700">${esc(x.text)}</span><span class="block text-xs text-slate-400 mt-0.5">${timeAgo(x.ts)}</span></span></a>`).join('') : '<p class="p-6 text-center text-sm text-slate-500">You are all caught up.</p>'}</div>`;
}

header.addEventListener('click', e => {
  const ub = e.target.closest('#user-btn'), bl = e.target.closest('#bell');
  const um = $('#user-menu'), bm = $('#bell-menu');
  if (ub) { bm.classList.add('hidden'); um.innerHTML = userMenu(); um.classList.toggle('hidden'); return; }
  if (bl) { um.classList.add('hidden'); bm.innerHTML = bellMenu(); bm.classList.toggle('hidden'); return; }
  const sw = e.target.closest('[data-switch]');
  if (sw) { const target = sw.dataset.switch; um.classList.add('hidden'); S.setMe(target).then(() => { toast(`Now acting as ${S.user(target)?.name || 'selected peer'}`, 'info'); if (location.hash.startsWith('#/room/') || location.hash.startsWith('#/recap/')) location.hash = '#/sessions'; route(); }).catch(err => toast(err.message, 'err')); return; }
  if (e.target.closest('#mark-read')) { S.markRead(S.me()); bm.innerHTML = bellMenu(); return; }
  if (e.target.closest('#reset-demo')) { if (confirm('Sign out in this browser tab? Database records will not be deleted.')) S.resetDemo(); return; }
  if (e.target.closest('#bell-menu a')) bm.classList.add('hidden');
});

document.addEventListener('click', e => { if (!e.target.closest('#user-btn,#user-menu,#bell,#bell-menu')) { $('#user-menu')?.classList.add('hidden'); $('#bell-menu')?.classList.add('hidden'); } });

// ---------- routing ----------
// Each route mounts into a fresh container so delegated listeners never stack up.
async function route() {
  const token = ++routeToken;
  if (current && current.dispose) { try { current.dispose(); } catch (e) { console.error(e); } }
  current = null;
  const h = location.hash || '#/';
  const [, a, b] = h.split('/');
  renderHeader();
  app.innerHTML = '';
  const root = document.createElement('div');
  app.appendChild(root);
  window.scrollTo(0, 0);
  try {
    if (a === 'room' && b) {
      const d = await mountRoom(root, b);
      if (token !== routeToken) { d && d(); return; }
      current = { dispose: d };
      return;
    }
    let r;
    if (a === 'community') r = mountCommunity(root, { questionId: b || '' });
    else if (a === 'peers') r = mountDirectory(root);
    else if (!a) r = mountCommunity(root);
    else if (a === 'sessions') r = mountSessions(root);
    else if (a === 'wallet') r = mountWallet(root);
    else if (a === 'leaderboard') r = mountLeaderboard(root);
    else if (a === 'u' && b) r = mountProfile(root, b);
    else if (a === 'recap' && b) r = mountRecap(root, b);
    else r = mountDirectory(root);
    current = r || {};
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="max-w-md mx-auto py-24 px-6 text-center"><i class="fa-solid fa-triangle-exclamation text-4xl text-amber-400"></i><h1 class="mt-4 text-xl font-semibold">Something went wrong</h1><p class="mt-2 text-sm text-slate-500">${esc(err.message)}</p><a href="#/" class="btn-primary mt-6">Back home</a></div>`;
  }
}
addEventListener('hashchange', route);

// ---------- live updates from the store ----------
S.subscribe(src => {
  if (src === 'user') return;
  renderHeader();
  const isRoom = (location.hash || '').startsWith('#/room/');
  if (isRoom) return;
  if (current && current.refresh) {
    if ((location.hash || '').startsWith('#/recap/') && src === 'remote') return; // don't wipe a half-written review
    current.refresh();
  }
  // Notify about things that just happened to me
  if (src === 'local' || src === 'remote') notifyNew();
});
let seenN = new Set(S.notifsOf(S.me()).map(n => n.id));
function notifyNew() {
  S.notifsOf(S.me()).forEach(n => { if (!seenN.has(n.id)) { seenN.add(n.id); if (!n.read) toast(n.text, /accepted|earned|ended/.test(n.text) ? 'ok' : 'info'); } });
}
setInterval(renderHeader, 60000);
route();
}
