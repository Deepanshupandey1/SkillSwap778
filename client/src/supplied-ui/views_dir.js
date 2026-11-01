// Smart Matching Dashboard (peer directory) + booking modal
import * as S from './store.js';
import { TOPICS, LANGS, SPOKEN, DAYS, PERIODS, LEVELS, DURATIONS } from './data.js';
import { $, $$, esc, avatar, levelBadge, stars, chip, credits, toast, openModal, closeModal, relSlot, nextOccurrence } from './ui.js';

const F = { q: '', topics: new Set(), langs: new Set(), spoken: '', days: new Set(), periods: new Set(), minLevel: 0, online: false, bookable: false, sort: 'match' };
const hasFilters = () => F.q || F.topics.size || F.langs.size || F.spoken || F.days.size || F.periods.size || F.minLevel || F.online || F.bookable;
const slotDay = s => s.split(' ')[0];
const slotHour = s => +s.split(' ')[1].slice(0, 2);
const slotMatches = s => (!F.days.size || F.days.has(slotDay(s))) && (!F.periods.size || PERIODS.some(p => F.periods.has(p.id) && p.test(slotHour(s))));
const availFilter = () => F.days.size || F.periods.size;
const tokens = () => F.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
function hl(text) {
  const t = tokens(); const e = esc(text);
  if (!t.length) return e;
  const re = new RegExp('(' + t.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  return e.replace(re, '<mark class="hl">$1</mark>');
}

let fuse = null, fuseSig = '';
function search(list) {
  const q = F.q.trim();
  if (!q) return list.map(u => ({ u, score: 0 }));
  if (window.Fuse) {
    const sig = list.map(u => u.id + u.skills.join()).join('|');
    if (!fuse || fuseSig !== sig) {
      fuse = new window.Fuse(list, { keys: [{ name: 'name', weight: 2 }, { name: 'skills', weight: 3 }, { name: 'topics', weight: 2.5 }, { name: 'langs', weight: 2 }, { name: 'title', weight: 1.2 }, { name: 'bio', weight: 0.6 }], threshold: 0.34, ignoreLocation: true, includeScore: true, minMatchCharLength: 2 });
      fuseSig = sig;
    }
    return fuse.search(q).map(r => ({ u: r.item, score: r.score }));
  }
  const t = tokens();
  return list.filter(u => { const hay = [u.name, u.title, u.bio, ...u.skills, ...u.topics, ...u.langs].join(' ').toLowerCase(); return t.every(x => hay.includes(x)); }).map(u => ({ u, score: 0 }));
}

function results() {
  const me = S.me();
  let list = S.users().filter(u => u.id !== me);
  list = list.filter(u => {
    if (F.topics.size && !u.topics.some(t => F.topics.has(t))) return false;
    if (F.langs.size && !u.langs.some(l => F.langs.has(l))) return false;
    if (F.spoken && !u.speaks.includes(F.spoken)) return false;
    if (availFilter() && !u.slots.some(slotMatches)) return false;
    if (F.minLevel && S.level(u.id) < F.minLevel) return false;
    if (F.online && !u.online) return false;
    if (F.bookable && !S.canBook(me, u.id).ok) return false;
    return true;
  });
  let r = search(list);
  const by = {
    match: (a, b) => (a.score - b.score) || (b.u.online - a.u.online) || (S.stats(b.u.id).rating - S.stats(a.u.id).rating),
    rating: (a, b) => S.stats(b.u.id).rating - S.stats(a.u.id).rating,
    sessions: (a, b) => S.stats(b.u.id).helped - S.stats(a.u.id).helped,
    price: (a, b) => S.rate(a.u.id) - S.rate(b.u.id) || S.stats(b.u.id).rating - S.stats(a.u.id).rating,
    level: (a, b) => S.level(b.u.id) - S.level(a.u.id),
    soon: (a, b) => nextOccurrence(a.u.slots.slice().sort((x, y) => nextOccurrence(x) - nextOccurrence(y))[0]) - nextOccurrence(b.u.slots.slice().sort((x, y) => nextOccurrence(x) - nextOccurrence(y))[0]),
  };
  const sortKey = F.q.trim() || F.sort !== 'match' ? F.sort : 'match';
  r.sort(by[sortKey] || by.match);
  return r;
}

function card({ u }) {
  const me = S.me(), st = S.stats(u.id), li = S.levelInfo(u.id), can = S.canBook(me, u.id);
  const slots = u.slots.slice().sort((a, b) => nextOccurrence(a) - nextOccurrence(b));
  const shown = slots.slice(0, 4), more = slots.length - shown.length;
  const first = slots[0];
  const skillMatch = s => tokens().some(t => s.toLowerCase().includes(t));
  const skills = u.skills.slice().sort((a, b) => skillMatch(b) - skillMatch(a)).slice(0, 4);
  const price = S.rate(u.id);
  return `<article class="card mentor-card p-5 flex flex-col fade-in" data-uid="${u.id}">
    <div class="flex items-start gap-3">
      <a href="#/u/${u.id}" aria-label="Profile of ${esc(u.name)}">${avatar(u, 'w-12 h-12 text-base', true)}</a>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap"><a href="#/u/${u.id}" class="font-semibold text-slate-900 hover:text-indigo-600 truncate">${hl(u.name)}</a>${levelBadge(u.id, true)}</div>
        <p class="text-sm text-slate-500 truncate">${hl(u.title)}</p>
        <div class="mt-1 flex items-center gap-3 text-xs text-slate-500">${stars(st.rating, st.ratingCount)}<span><i class="fa-solid fa-handshake-angle mr-1 text-slate-400"></i>${st.helped} helped</span><span class="${u.online ? 'text-emerald-600' : 'text-slate-400'}"><i class="fa-solid fa-circle text-[7px] mr-1 align-middle"></i>${u.online ? 'Online' : 'Offline'}</span></div>
      </div>
      <div class="text-right shrink-0"><div class="text-lg leading-none">${credits(price)}</div><div class="text-[11px] text-slate-400 mt-1">per 15 min</div></div>
    </div>
    <p class="mt-3 text-sm text-slate-600 line-clamp-2">${hl(u.bio)}</p>
    <div class="mt-3 flex flex-wrap gap-1.5">${skills.map(s => `<span class="rounded-md px-2 py-0.5 text-xs ${skillMatch(s) ? 'bg-yellow-100 text-yellow-900 ring-1 ring-yellow-300' : 'bg-indigo-50 text-indigo-700'}">${hl(s)}</span>`).join('')}${u.skills.length > 4 ? `<span class="text-xs text-slate-400 self-center">+${u.skills.length - 4}</span>` : ''}</div>
    <div class="mt-3 flex flex-wrap items-center gap-1.5 text-xs"><i class="fa-solid fa-code text-slate-400 w-4"></i>${u.langs.map(l => chip(l, F.langs.has(l) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600')).join('')}</div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs"><i class="fa-solid fa-language text-slate-400 w-4"></i><span class="text-slate-500">${u.speaks.map(l => `<span class="${F.spoken === l ? 'font-semibold text-indigo-700' : ''}">${esc(l)}</span>`).join(', ')}</span></div>
    <div class="mt-3 pt-3 border-t border-slate-100">
      <div class="flex items-center justify-between text-xs text-slate-500 mb-1.5"><span><i class="fa-regular fa-clock mr-1"></i>Free slots</span>${first ? `<span class="text-emerald-600 font-medium">next ${relSlot(first)}</span>` : ''}</div>
      <div class="flex flex-wrap gap-1.5">${shown.map(s => `<span class="rounded-md px-2 py-0.5 text-xs ring-1 ${availFilter() && slotMatches(s) ? 'bg-emerald-50 text-emerald-800 ring-emerald-300 font-semibold' : 'bg-white text-slate-600 ring-slate-200'}">${esc(s)}</span>`).join('')}${more > 0 ? `<span class="text-xs text-slate-400 self-center">+${more} more</span>` : ''}</div>
    </div>
    <div class="mt-4 flex items-center gap-2">
      <a href="#/u/${u.id}" class="btn-outline flex-1">View profile</a>
      ${can.ok ? `<button class="btn-primary flex-1" data-book="${u.id}"><i class="fa-solid fa-calendar-plus"></i>Book</button>` : `<button class="btn-outline flex-1 opacity-60 cursor-not-allowed" disabled title="${esc(can.reason)}"><i class="fa-solid fa-lock text-xs"></i>This is your profile</button>`}
    </div>
    ${!can.ok ? `<p class="mt-1.5 text-[11px] text-slate-400 text-center">${esc(can.reason)}.</p>` : ''}
  </article>`;
}

function chips(items, set, attr) { return items.map(x => `<button type="button" class="fchip ${set.has(x) ? 'on' : ''}" ${attr}="${esc(x)}" aria-pressed="${set.has(x)}">${esc(x)}</button>`).join(''); }

function sidebar() {
  const me = S.me(), u = S.user(me), li = S.levelInfo(me), res = S.reserved(me);
  const pend = S.sessions().filter(s => s.mentorId === me && s.status === 'requested').length;
  const ready = S.sessions().filter(s => (s.learnerId === me || s.mentorId === me) && ['accepted', 'live'].includes(s.status)).length;
  return `
  <div class="card p-4 mb-4">
    <div class="flex items-center justify-between"><span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Your wallet</span><a href="#/wallet" class="text-xs text-indigo-600 hover:underline">Ledger</a></div>
    <div class="mt-1 flex items-end justify-between"><div class="text-3xl font-bold text-slate-900 flex items-center gap-2"><i class="fa-solid fa-coins text-amber-500 text-2xl"></i>${S.balance(me)}</div>${levelBadge(me)}</div>
    ${res ? `<p class="text-xs text-slate-500 mt-1">${S.available(me)} available · ${res} reserved for accepted sessions</p>` : `<p class="text-xs text-slate-500 mt-1">credits available to spend</p>`}
    <div class="mt-3"><div class="flex justify-between text-[11px] text-slate-500 mb-1"><span>${li.name}</span><span>${li.next ? `${li.toNext} credits to ${li.next.name}` : 'Max level'}</span></div><div class="progress"><i style="width:${li.pct}%"></i></div></div>
    ${(pend || ready) ? `<div class="mt-3 space-y-1.5">${pend ? `<a href="#/sessions" class="flex items-center justify-between rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900"><span><i class="fa-solid fa-bell mr-1.5"></i>${pend} request${pend > 1 ? 's' : ''} waiting for you</span><i class="fa-solid fa-chevron-right"></i></a>` : ''}${ready ? `<a href="#/sessions" class="flex items-center justify-between rounded-lg bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-xs text-emerald-900"><span><i class="fa-solid fa-video mr-1.5"></i>${ready} session${ready > 1 ? 's' : ''} ready to join</span><i class="fa-solid fa-chevron-right"></i></a>` : ''}</div>` : ''}
  </div>
  <div class="card p-4 space-y-5" id="filters">
    <div class="flex items-center justify-between"><h2 class="font-semibold text-slate-900"><i class="fa-solid fa-sliders mr-2 text-slate-400"></i>Filters</h2><button id="f-clear" class="text-xs text-indigo-600 hover:underline ${hasFilters() ? '' : 'invisible'}">Clear all</button></div>
    <fieldset><legend class="label">Topic</legend><div class="flex flex-wrap gap-1.5">${chips(TOPICS, F.topics, 'data-topic')}</div></fieldset>
    <fieldset><legend class="label">Programming language</legend><div class="flex flex-wrap gap-1.5">${chips(LANGS, F.langs, 'data-lang')}</div></fieldset>
    <div><label class="label" for="f-spoken">Spoken language</label><select id="f-spoken" class="input"><option value="">Any</option>${SPOKEN.map(l => `<option ${F.spoken === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <fieldset><legend class="label">Availability</legend>
      <div class="flex flex-wrap gap-1.5">${chips(DAYS, F.days, 'data-day')}</div>
      <div class="flex flex-wrap gap-1.5 mt-2">${PERIODS.map(p => `<button type="button" class="fchip ${F.periods.has(p.id) ? 'on' : ''}" data-period="${p.id}" aria-pressed="${F.periods.has(p.id)}"><i class="fa-solid ${p.icon} text-[11px]"></i>${p.label}</button>`).join('')}</div>
    </fieldset>
    <div><label class="label" for="f-level">Minimum level</label><select id="f-level" class="input"><option value="0">Any level</option>${LEVELS.slice(1).map(l => `<option value="${l.n}" ${F.minLevel === l.n ? 'selected' : ''}>L${l.n} ${l.name}+</option>`).join('')}</select></div>
    <div class="space-y-2">
      <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" id="f-online" class="accent-indigo-600 w-4 h-4" ${F.online ? 'checked' : ''}> Online now</label>
      <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="checkbox" id="f-bookable" class="accent-indigo-600 w-4 h-4" ${F.bookable ? 'checked' : ''}> Hide my own profile</label>
    </div>
  </div>`;
}

export function mountDirectory(root) {
  const meId = S.me();
  root.innerHTML = `
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
    <section id="dir-hero" class="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 text-white p-6 sm:p-8 mb-6 relative overflow-hidden">
      <div class="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10"></div><div class="absolute right-24 -bottom-16 w-44 h-44 rounded-full bg-white/5"></div>
      <div class="relative max-w-2xl"><h1 class="text-2xl sm:text-3xl font-bold tracking-tight">Stuck on one specific thing? Get 15 focused minutes.</h1>
      <p class="mt-2 text-indigo-100 text-sm sm:text-base">Find any peer who can help with your question. Skill and experience level do not restrict requests—the other peer decides whether to accept.</p></div>
      <ol class="relative mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        ${[['fa-magnifying-glass', 'Search'], ['fa-paper-plane', 'Request'], ['fa-circle-check', 'Peer accepts'], ['fa-video', 'Live room'], ['fa-coins', 'Credits settle']].map(([ic, t], i) => `<li class="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2"><span class="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0"><i class="fa-solid ${ic} text-[11px]"></i></span><span><span class="opacity-70 mr-1">${i + 1}.</span>${t}</span></li>`).join('')}
      </ol>
    </section>
    <section id="ai-match-panel" class="card p-4 sm:p-5 mb-6 border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50">
      <div class="flex flex-wrap items-start gap-3 justify-between">
        <div class="flex items-start gap-3"><span class="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div><h2 class="font-semibold text-slate-900">AI session recommendations</h2><p class="text-sm text-slate-500 mt-0.5">Tell us what you want to learn. PeerLearn ranks real profiles, then uses the AI assistant to explain the best fit.</p></div></div>
        <span class="rounded-full bg-indigo-100 text-indigo-700 px-2.5 py-1 text-[11px] font-semibold">Skill + language + availability · all levels</span>
      </div>
      <form id="ai-match-form" class="mt-4 grid sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto] gap-2.5">
        <div><label class="label" for="ai-skill">Preferred skill / topic</label><input id="ai-skill" class="input" maxlength="80" required minlength="2" placeholder="e.g. React hooks, DSA, Python ML" value="${esc(F.q)}"></div>
        <div><label class="label" for="ai-language">Programming language</label><select id="ai-language" class="input"><option value="">Any language</option>${[...new Set(LANGS)].map(lang => `<option value="${esc(lang)}">${esc(lang)}</option>`).join('')}</select></div>
        <div><label class="label" for="ai-availability">When are you free?</label><select id="ai-availability" class="input"><option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="weekend">Weekend</option></select></div>
        <div class="flex items-end"><button id="ai-match-submit" class="btn-primary w-full !py-2.5" type="submit"><i class="fa-solid fa-sparkles mr-1"></i>Recommend peers</button></div>
      </form>
      <p id="ai-match-status" class="mt-3 text-sm text-slate-500" role="status" aria-live="polite">Recommendations use live peer profiles. Personalized AI guidance runs securely on the server when configured; no API key is exposed in this page.</p>
      <div id="ai-match-results" class="mt-3 grid md:grid-cols-2 xl:grid-cols-3 gap-3"></div>
    </section>
    <div class="relative mb-5">
      <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
      <input id="dir-q" type="search" autocomplete="off" value="${esc(F.q)}" placeholder="Search a topic, skill or language: “shader banding”, “postgres schema”, “react hooks”…" class="input !pl-11 !py-3.5 !text-base !rounded-xl shadow-sm" aria-label="Search peers">
    </div>
    <div class="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
      <aside id="dir-side" class="hidden lg:block lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scroll-thin pr-1"></aside>
      <section aria-live="polite">
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <button id="f-toggle" class="btn-outline lg:hidden"><i class="fa-solid fa-sliders"></i>Filters <span id="f-count" class="ml-1 text-xs rounded-full bg-indigo-600 text-white px-1.5 hidden"></span></button>
          <p id="dir-count" class="text-sm text-slate-600 font-medium"></p>
          <div class="ml-auto flex items-center gap-2 text-sm"><label for="dir-sort" class="text-slate-500">Sort</label>
            <select id="dir-sort" class="input !w-auto !py-1.5"><option value="match">Best match</option><option value="rating">Highest rated</option><option value="sessions">Most sessions</option><option value="soon">Free soonest</option><option value="price">Lowest price</option><option value="level">Highest level</option></select></div>
        </div>
        <div id="dir-active" class="flex flex-wrap gap-2 mb-4"></div>
        <div id="dir-results" class="grid md:grid-cols-2 2xl:grid-cols-3 gap-4"></div>
      </section>
    </div>
  </div>`;
  const side = $('#dir-side', root), resEl = $('#dir-results', root), q = $('#dir-q', root);
  $('#dir-sort', root).value = F.sort;

  const aiForm = $('#ai-match-form', root);
  const renderAiMatches = (matches, resultsEl) => {
    if (!matches.length) {
      resultsEl.innerHTML = '<div class="md:col-span-2 xl:col-span-3 rounded-xl bg-white border border-slate-200 p-4 text-sm text-slate-600">No peers are available in the directory yet. Try again after more members join.</div>';
      return;
    }
    resultsEl.innerHTML = matches.map(match => `<article class="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm"><div class="flex items-start justify-between gap-2"><div><h3 class="font-semibold text-slate-900">${esc(match.name)}</h3><p class="text-xs text-slate-500 mt-0.5">${esc(match.experienceLevel || 'Peer')} peer · @${esc(match.username || 'member')}</p></div><span class="rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[11px] font-semibold">${Math.round(match.score || 0)} match</span></div><p class="text-sm text-slate-600 mt-2 line-clamp-2">${esc(match.bio || 'PeerLearn community member')}</p><div class="flex flex-wrap gap-1 mt-2">${(match.skills || []).slice(0, 4).map(skill => `<span class="rounded-md bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">${esc(skill)}</span>`).join('')}</div><p class="mt-2 text-xs text-slate-500">${(match.reasons || []).map(reason => esc(reason)).join(' · ')}</p><div class="mt-3 flex items-center justify-between gap-2"><span class="text-xs text-amber-600"><i class="fa-solid fa-star mr-1"></i>${Number(match.rating || 0).toFixed(1)} · ${Number(match.sessionsHelped || 0)} helped</span><button type="button" class="btn-primary !py-1.5 !px-3 text-xs" data-book="${esc(match.id)}"><i class="fa-solid fa-calendar-plus mr-1"></i>Request session</button></div></article>`).join('');
  };
  const fallbackProfileMatches = (preferredSkill, language, availability) => {
    const lower = value => String(value || '').toLowerCase().trim();
    const targetWords = lower(preferredSkill).split(/[^a-z0-9+#.]+/).filter(word => word.length > 2);
    return S.users().filter(user => user.id !== meId).map(user => {
      const skills = [...(user.skills || []), ...(user.topics || [])];
      const haystack = skills.map(lower);
      const exact = haystack.some(skill => skill === lower(preferredSkill));
      const partial = haystack.some(skill => skill.includes(lower(preferredSkill)) || lower(preferredSkill).includes(skill));
      const overlap = targetWords.filter(word => haystack.some(skill => skill.includes(word))).length;
      const languageMatch = !language || (user.langs || []).some(item => lower(item) === lower(language));
      const slotText = (user.slots || []).join(' ').toLowerCase();
      const availabilityMatch = availability === 'any' || (availability === 'weekend' ? /sat|sun/.test(slotText) : availability === 'morning' ? /0[5-9]:|10:|11:/.test(slotText) : availability === 'afternoon' ? /12:|13:|14:|15:|16:/.test(slotText) : /17:|18:|19:|20:|21:/.test(slotText));
      const score = (exact ? 60 : partial ? 42 : Math.min(25, overlap * 10)) + (languageMatch ? 15 : 0) + (availabilityMatch ? 12 : -10) + Math.min(8, Number(user.ratingAvg || 0) * 1.5) + Math.min(5, Number(user.helped || 0) / 4);
      const reasons = [];
      const relatedSkill = skills.find(item => lower(item).includes(lower(preferredSkill)) || targetWords.some(word => lower(item).includes(word)));
      if (exact || partial || overlap) reasons.push(`Related skill: ${relatedSkill || skills[0] || 'general peer support'}`);
      else reasons.push('Broad peer match; they can accept or decline your request');
      if (languageMatch && language) reasons.push(`Uses ${language}`);
      if (availabilityMatch) reasons.push(`Matches ${availability} availability`);
      return { id: user.id, name: user.name, username: user.username, bio: user.bio || user.title || '', experienceLevel: user.experienceLevel, skills: user.skills || [], rating: Number(user.ratingAvg || 0), sessionsHelped: Number(user.helped || 0), score, reasons };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
  };
  aiForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#ai-match-submit', root), status = $('#ai-match-status', root), resultsEl = $('#ai-match-results', root);
    const preferredSkill = $('#ai-skill', root).value.trim();
    if (preferredSkill.length < 2) { status.textContent = 'Enter a skill or topic with at least 2 characters.'; $('#ai-skill', root).focus(); return; }
    button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Finding matches';
    status.textContent = 'Matching your preferences against peer profiles…'; resultsEl.innerHTML = '';
    try {
      const data = await S.recommendPeers({ preferredSkill, language: $('#ai-language', root).value, availability: $('#ai-availability', root).value });
      status.textContent = data.assistantText || (data.aiEnabled ? 'Your recommended peers are below.' : 'Matches are ready.');
      const matches = Array.isArray(data.candidates) ? data.candidates : [];
      if (!matches.length) {
        const fallback = fallbackProfileMatches(preferredSkill, $('#ai-language', root).value, $('#ai-availability', root).value);
        if (fallback.length) status.textContent += ' Showing broader profile matches because no profiles met every preference.';
        renderAiMatches(fallback, resultsEl);
        return;
      }
      renderAiMatches(matches, resultsEl);
    } catch (error) {
      const fallback = fallbackProfileMatches(preferredSkill, $('#ai-language', root).value, $('#ai-availability', root).value);
      status.textContent = `The AI endpoint did not respond (${error.message || 'temporary error'}). Showing profile-based matches from the live directory instead.`;
      renderAiMatches(fallback, resultsEl);
    } finally {
      button.disabled = false; button.innerHTML = '<i class="fa-solid fa-sparkles mr-1"></i>Recommend peers';
    }
  });

  function renderSide() { side.innerHTML = sidebar(); }
  function renderResults() {
    const r = results();
    $('#dir-count', root).innerHTML = `<b class="text-slate-900">${r.length}</b> peer${r.length === 1 ? '' : 's'} ${hasFilters() ? 'match' : 'available'}`;
    const n = F.topics.size + F.langs.size + F.days.size + F.periods.size + (F.spoken ? 1 : 0) + (F.minLevel ? 1 : 0) + (F.online ? 1 : 0) + (F.bookable ? 1 : 0);
    const fc = $('#f-count', root); fc.textContent = n; fc.classList.toggle('hidden', !n);
    const act = [];
    F.topics.forEach(t => act.push(['topic', t, t])); F.langs.forEach(t => act.push(['lang', t, t])); F.days.forEach(t => act.push(['day', t, t]));
    F.periods.forEach(t => act.push(['period', t, PERIODS.find(p => p.id === t).label]));
    if (F.spoken) act.push(['spoken', '', F.spoken]); if (F.minLevel) act.push(['level', '', 'L' + F.minLevel + '+']); if (F.online) act.push(['online', '', 'Online now']); if (F.bookable) act.push(['bookable', '', 'Bookable by me']);
    $('#dir-active', root).innerHTML = act.map(([k, v, l]) => `<button class="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs px-3 py-1 ring-1 ring-indigo-200 hover:bg-indigo-100" data-rm="${k}" data-v="${esc(v)}">${esc(l)} <i class="fa-solid fa-xmark"></i></button>`).join('');
    if (!r.length) {
      resEl.innerHTML = `<div class="md:col-span-2 2xl:col-span-3 card p-10 text-center"><i class="fa-regular fa-face-frown-open text-4xl text-slate-300"></i><h3 class="mt-3 font-semibold text-slate-900">No peers match these filters</h3><p class="text-sm text-slate-500 mt-1">Try a broader search, remove a filter, or look at a different time of day.</p><button class="btn-primary mt-4" id="empty-clear">Clear all filters</button></div>`;
      return;
    }
    resEl.innerHTML = r.map(card).join('');
  }
  function renderAll() { renderSide(); renderResults(); }
  renderAll();

  q.addEventListener('input', () => { F.q = q.value; renderResults(); renderSide(); });
  const toggle = (set, v) => set.has(v) ? set.delete(v) : set.add(v);
  side.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.topic) toggle(F.topics, b.dataset.topic);
    else if (b.dataset.lang) toggle(F.langs, b.dataset.lang);
    else if (b.dataset.day) toggle(F.days, b.dataset.day);
    else if (b.dataset.period) toggle(F.periods, b.dataset.period);
    else if (b.id === 'f-clear') clearAll();
    else return;
    const sc = side.scrollTop; renderAll(); side.scrollTop = sc;
  });
  side.addEventListener('change', e => {
    if (e.target.id === 'f-spoken') F.spoken = e.target.value;
    else if (e.target.id === 'f-level') F.minLevel = +e.target.value;
    else if (e.target.id === 'f-online') F.online = e.target.checked;
    else if (e.target.id === 'f-bookable') F.bookable = e.target.checked;
    else return;
    const sc = side.scrollTop; renderAll(); side.scrollTop = sc;
  });
  function clearAll() { F.q = ''; q.value = ''; F.topics.clear(); F.langs.clear(); F.days.clear(); F.periods.clear(); F.spoken = ''; F.minLevel = 0; F.online = false; F.bookable = false; }
  root.addEventListener('click', e => {
    const bk = e.target.closest('[data-book]'); if (bk) { openBooking(bk.dataset.book); return; }
    if (e.target.closest('#empty-clear')) { clearAll(); renderAll(); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { const k = rm.dataset.rm, v = rm.dataset.v; ({ topic: () => F.topics.delete(v), lang: () => F.langs.delete(v), day: () => F.days.delete(v), period: () => F.periods.delete(v), spoken: () => F.spoken = '', level: () => F.minLevel = 0, online: () => F.online = false, bookable: () => F.bookable = false })[k](); renderAll(); }
    if (e.target.closest('#f-toggle')) side.classList.toggle('hidden');
  });
  $('#dir-sort', root).addEventListener('change', e => { F.sort = e.target.value; renderResults(); });
  return { refresh: () => { const sc = side.scrollTop; renderAll(); side.scrollTop = sc; } };
}

// ---------- booking ----------
export function openBooking(mentorId, preset = {}) {
  const me = S.me(), m = S.user(mentorId), c = S.canBook(me, mentorId);
  if (!c.ok) { toast(c.reason, 'err'); return; }
  const slots = m.slots.slice().sort((a, b) => nextOccurrence(a) - nextOccurrence(b));
  const defSlot = (availFilter() && slots.find(slotMatches)) || slots[0];
  const topic = preset.topic || [...F.topics].find(t => m.topics.includes(t)) || m.topics[0];
  const lang = preset.lang || [...F.langs].find(l => m.langs.includes(l)) || m.langs[0];
  openModal(`
  <form id="book-form" novalidate>
    <div class="p-5 border-b border-slate-100 flex items-start gap-3">${avatar(m, 'w-12 h-12', true)}<div class="min-w-0 flex-1"><h2 class="text-lg font-semibold text-slate-900">Request a session with ${esc(m.name)}</h2><p class="text-sm text-slate-500">${esc(m.title)} · ${levelBadge(mentorId, true)}</p></div><button type="button" class="btn-ghost !px-2" data-modal-close aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="p-5 space-y-4">
      <div><label class="label" for="b-title">What do you need help with? <span class="text-rose-500">*</span></label><input id="b-title" class="input" maxlength="90" placeholder="e.g. Banding in my fragment shader gradient" autofocus><p id="b-title-err" class="text-xs text-rose-600 mt-1 hidden">Give your request a short title (at least 5 characters).</p></div>
      <div><label class="label" for="b-problem">Details <span class="font-normal text-slate-400">(optional)</span></label><textarea id="b-problem" class="input" rows="3" maxlength="400" placeholder="What have you tried? What did you expect to happen?"></textarea></div>
      <div class="grid sm:grid-cols-2 gap-3">
        <div><label class="label" for="b-topic">Topic</label><select id="b-topic" class="input">${m.topics.map(t => `<option ${t === topic ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        <div><label class="label" for="b-lang">Language</label><select id="b-lang" class="input">${m.langs.map(t => `<option ${t === lang ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
      </div>
      <div><label class="label" for="b-slot">Preferred time</label><select id="b-slot" class="input">${slots.map(s => `<option value="${esc(s)}" ${s === defSlot ? 'selected' : ''}>${esc(s)} (${relSlot(s)})</option>`).join('')}<option value="As soon as possible">As soon as possible</option></select></div>
      <fieldset><legend class="label">Length</legend><div class="grid grid-cols-3 gap-2">${DURATIONS.map((d, i) => `<label class="cursor-pointer"><input type="radio" name="b-dur" value="${d}" class="peer sr-only" ${i === 1 ? 'checked' : ''}><span class="block text-center rounded-lg border border-slate-200 py-2 text-sm peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-700 peer-checked:font-semibold peer-focus-visible:ring-2 ring-indigo-500"><b>${d}</b> min<br><span class="text-xs">${credits(S.price(mentorId, d))}</span></span></label>`).join('')}</div></fieldset>
      <div id="b-summary" class="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-sm"></div>
      <p class="text-xs text-slate-500"><i class="fa-solid fa-shield-halved mr-1 text-emerald-600"></i>Nothing is charged now. Credits move only after the session is completed.</p>
    </div>
    <div class="p-5 border-t border-slate-100 flex justify-end gap-2"><button type="button" class="btn-ghost" data-modal-close>Cancel</button><button type="submit" id="b-submit" class="btn-primary"><i class="fa-solid fa-paper-plane"></i>Send request</button></div>
  </form>`, {});
  const f = $('#book-form');
  const dur = () => +$('input[name=b-dur]:checked', f).value;
  function sum() {
    const cost = S.price(mentorId, dur()), av = S.available(me), after = av - cost, ok = after >= 0;
    $('#b-summary', f).innerHTML = `<div class="flex items-center justify-between"><span class="text-slate-600">Session cost</span>${credits(cost, 'text-slate-900')}</div><div class="flex items-center justify-between mt-1"><span class="text-slate-600">Your available credits</span>${credits(av)}</div><div class="flex items-center justify-between mt-1 pt-1 border-t border-slate-200"><span class="text-slate-600">After session</span><span class="font-semibold ${ok ? 'text-slate-900' : 'text-rose-600'}">${ok ? after : 'Not enough'}</span></div>${ok ? '' : `<p class="mt-2 text-xs text-rose-600"><i class="fa-solid fa-circle-exclamation mr-1"></i>You are ${-after} credit${-after === 1 ? '' : 's'} short. Pick a shorter session, or <a href="#/sessions" class="underline" data-modal-close>help someone first</a> to earn more.</p>`}`;
    $('#b-submit', f).disabled = !ok;
  }
  f.addEventListener('change', sum); sum();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const title = $('#b-title', f).value.trim();
    if (title.length < 5) { $('#b-title-err', f).classList.remove('hidden'); $('#b-title', f).focus(); return; }
    const r = await S.requestSession({ learnerId: me, mentorId, title, problem: $('#b-problem', f).value.trim(), topic: $('#b-topic', f).value, lang: $('#b-lang', f).value, slot: $('#b-slot', f).value, duration: dur() });
    if (!r.ok) { toast(r.error, 'err'); sum(); return; }
    closeModal();
    toast(`Request sent to ${m.name}. Credits are only charged after the session.`, 'ok');
    location.hash = '#/sessions';
  });
}
