// Public community feed: anyone may read questions; signing in is required to post, answer, react, or request live help.
import * as S from './store.js';
import { $, esc, avatar, toast, timeAgo, credits } from './ui.js';

const wrap = content => `<div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 fade-in">${content}</div>`;
const idOf = value => String(value?._id || value?.id || value || '');
const TOPICS = ['DSA', 'React', 'Web Development', 'JavaScript', 'Python', 'C++', 'DBMS', 'Databases', 'Backend', 'Operating Systems', 'Computer Networks', 'Cybersecurity', 'Cloud', 'AI / ML', 'Other'];

function authorAvatar(author) {
  const existing = S.user(idOf(author));
  if (existing) return avatar(existing, 'w-10 h-10 text-xs', true);
  const name = author?.name || 'Peer';
  const initials = name.split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  let hue = 0; for (const char of idOf(author) || name) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return `<span class="w-10 h-10 rounded-full inline-flex items-center justify-center text-xs font-semibold text-white" style="background:hsl(${hue} 65% 48%)">${esc(initials)}</span>`;
}
function authorName(author) { return esc(author?.name || author?.username || 'PeerLearn member'); }

export function mountCommunity(root, { publicMode = false, questionId = '', onAuth = () => { location.hash = '#/signin'; } } = {}) {
  let questions = [];
  let detail = null;
  let loading = true;
  let loadError = '';
  let showComposer = false;
  let searchText = '';
  let topicFilter = '';
  // Public home feed shows every question by default, including resolved discussions.
  let statusFilter = '';
  let sort = 'recent';
  const signedIn = () => Boolean(S.me()) && !publicMode;

  function communityHeader() {
    return `<section class="rounded-2xl overflow-hidden bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-700 text-white p-6 sm:p-8 mb-6">
      <div class="flex flex-wrap gap-4 items-center justify-between"><div><p class="text-xs uppercase tracking-[0.18em] text-indigo-100">PeerLearn Community</p><h1 class="text-2xl sm:text-3xl font-bold mt-1">Ask a doubt. Share what you know.</h1><p class="text-sm text-indigo-100 mt-2 max-w-2xl">Public questions anyone can read and answer—skills and experience level do not matter. Live sessions happen only after the other peer accepts your request.</p></div>
      <div class="flex flex-wrap gap-2"><a href="#/peers" class="btn-outline !bg-white/10 !text-white !border-white/30 hover:!bg-white/20"><i class="fa-solid fa-users mr-1"></i>Find peers</a>${signedIn() ? `<button type="button" class="btn-primary !bg-white !text-indigo-700 hover:!bg-indigo-50" data-action="new-question"><i class="fa-solid fa-plus mr-1"></i>Ask a question</button><a href="#/wallet" class="btn-outline !bg-white/10 !text-white !border-white/30">${credits(S.balance(S.me()))}</a>` : `<button type="button" class="btn-primary !bg-white !text-indigo-700 hover:!bg-indigo-50" data-action="signin"><i class="fa-solid fa-right-to-bracket mr-1"></i>Sign in to participate</button>`}</div></div>
    </section>`;
  }

  function questionCard(question) {
    const authorId = idOf(question.author);
    const isLiked = Boolean(question.isLikedByMe);
    const answerCount = (question.answers || []).length;
    const tags = (question.tags || []).slice(0, 5).map(tag => `<span class="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">${esc(tag)}</span>`).join('');
    return `<article class="card p-4 sm:p-5"><div class="flex items-start gap-3">${authorAvatar(question.author)}<div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2"><span class="text-xs font-medium text-slate-500">${authorName(question.author)}${question.author?.username ? ` · @${esc(question.author.username)}` : ''}</span><span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${question.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}">${question.status === 'resolved' ? 'Resolved' : 'Open'}</span><span class="text-xs text-slate-400">${timeAgo(new Date(question.createdAt).getTime())}</span></div>
      <button type="button" class="mt-2 text-left text-lg font-semibold leading-snug text-slate-900 hover:text-indigo-700" data-action="open-question" data-id="${esc(question._id)}">${esc(question.title)}</button>
      <p class="mt-2 text-sm text-slate-600 whitespace-pre-line line-clamp-3">${esc(question.description)}</p>
      ${question.codeSnippet ? `<pre class="mt-3 max-h-28 overflow-hidden rounded-lg bg-slate-950 p-3 text-xs text-slate-100"><code>${esc(question.codeSnippet)}</code></pre>` : ''}
      <div class="mt-3 flex flex-wrap items-center gap-2"><span class="rounded-md bg-violet-50 text-violet-700 px-2 py-1 text-xs">${esc(question.topic)}</span>${question.language && question.language !== 'General' ? `<span class="rounded-md bg-sky-50 text-sky-700 px-2 py-1 text-xs">${esc(question.language)}</span>` : ''}<span class="rounded-md bg-amber-50 text-amber-700 px-2 py-1 text-xs">${esc(question.difficulty || 'Easy')}</span>${tags}</div>
      <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3"><button type="button" class="text-sm ${isLiked ? 'text-indigo-700' : 'text-slate-500 hover:text-indigo-700'}" data-action="like-question" data-id="${esc(question._id)}"><i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart mr-1"></i>${Number(question.likesCount || 0)} likes</button><button type="button" class="text-sm text-slate-500 hover:text-indigo-700" data-action="open-question" data-id="${esc(question._id)}"><i class="fa-regular fa-comments mr-1"></i>${answerCount} answer${answerCount === 1 ? '' : 's'}</button><button type="button" class="ml-auto text-sm font-semibold text-indigo-600 hover:text-indigo-800" data-action="open-question" data-id="${esc(question._id)}">View discussion <i class="fa-solid fa-arrow-right ml-1"></i></button></div>
      </div></div></article>`;
  }

  function composeForm() {
    if (!showComposer || !signedIn()) return '';
    return `<section class="card p-5 mb-5"><div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold text-slate-900">Ask the community</h2><p class="text-sm text-slate-500">Write the doubt clearly so any peer can help.</p></div><button type="button" class="btn-ghost" data-action="close-composer" aria-label="Close form"><i class="fa-solid fa-xmark"></i></button></div>
      <form data-form="question" class="mt-4 space-y-3"><label class="block text-sm font-medium text-slate-700">Question title<input class="input mt-1 w-full" name="title" required minlength="8" maxlength="180" placeholder="What exactly are you stuck on?"></label>
      <label class="block text-sm font-medium text-slate-700">Details<textarea class="input mt-1 w-full" name="description" required minlength="15" maxlength="12000" rows="4" placeholder="Share what you tried, expected output, and the error or concept you don't understand."></textarea></label>
      <div class="grid sm:grid-cols-3 gap-3"><label class="block text-sm font-medium text-slate-700">Topic<select name="topic" class="input mt-1 w-full" required>${TOPICS.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select></label>
      <label class="block text-sm font-medium text-slate-700">Language<input name="language" class="input mt-1 w-full" maxlength="60" placeholder="C++, Python, General"></label>
      <label class="block text-sm font-medium text-slate-700">Difficulty<select name="difficulty" class="input mt-1 w-full"><option>Easy</option><option>Medium</option><option>Hard</option></select></label></div>
      <label class="block text-sm font-medium text-slate-700">Tags <span class="font-normal text-slate-400">(optional, comma-separated)</span><input class="input mt-1 w-full" name="tags" maxlength="400" placeholder="arrays, recursion, runtime-error"></label>
      <label class="block text-sm font-medium text-slate-700">Code snippet <span class="font-normal text-slate-400">(optional)</span><textarea class="input mt-1 w-full font-mono text-sm" name="codeSnippet" rows="3" maxlength="12000" placeholder="Paste a small, relevant snippet"></textarea></label>
      <div class="flex justify-end gap-2"><button type="button" class="btn-outline" data-action="close-composer">Cancel</button><button class="btn-primary" type="submit"><i class="fa-solid fa-paper-plane mr-1"></i>Publish question</button></div></form></section>`;
  }

  function answerCard(question, answer) {
    const authorId = idOf(answer.author);
    const isOwner = signedIn() && String(S.me()) === idOf(question.author);
    const isAuthor = signedIn() && String(S.me()) === authorId;
    return `<article class="rounded-xl border ${answer.isAccepted ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'} p-4"><div class="flex items-start gap-3">${authorAvatar(answer.author)}<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><span class="font-semibold text-sm text-slate-900">${authorName(answer.author)}</span>${answer.author?.username ? `<span class="text-xs text-slate-400">@${esc(answer.author.username)}</span>` : ''}${answer.isAccepted ? '<span class="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[11px] font-semibold"><i class="fa-solid fa-check mr-1"></i>Accepted answer</span>' : ''}<span class="text-xs text-slate-400">${timeAgo(new Date(answer.createdAt).getTime())}</span></div>
      <p class="mt-2 text-sm text-slate-700 whitespace-pre-wrap break-words">${esc(answer.body)}</p>
      <div class="mt-3 flex flex-wrap items-center gap-2"><button type="button" class="text-xs ${answer.isHelpfulByMe ? 'text-indigo-700' : 'text-slate-500 hover:text-indigo-700'}" data-action="helpful" data-id="${esc(question._id)}" data-answer="${esc(answer._id)}"><i class="fa-solid fa-thumbs-up mr-1"></i>Helpful (${Number(answer.helpfulCount || 0)})</button>
      ${isOwner && question.status === 'open' && !answer.isAccepted ? `<button type="button" class="btn-outline !py-1 !px-2 text-xs" data-action="accept-answer" data-id="${esc(question._id)}" data-answer="${esc(answer._id)}">Accept answer</button>` : ''}
      ${signedIn() && !isAuthor ? `<button type="button" class="btn-primary !py-1 !px-2 text-xs ml-auto" data-action="live-help" data-id="${esc(question._id)}" data-answerer="${esc(authorId)}" data-answer-body="${esc(answer.body)}"><i class="fa-solid fa-video mr-1"></i>Request live session</button>` : !publicMode && !signedIn() ? '' : ''}
      </div></div></div></article>`;
  }

  function detailHtml(question) {
    const isOwner = signedIn() && idOf(question.author) === String(S.me());
    const answers = (question.answers || []).slice().sort((a, b) => Number(Boolean(b.isAccepted)) - Number(Boolean(a.isAccepted)) || new Date(a.createdAt) - new Date(b.createdAt));
    return `<div class="mb-4"><button type="button" data-action="back-feed" class="text-sm font-medium text-indigo-600 hover:text-indigo-800"><i class="fa-solid fa-arrow-left mr-1"></i>All community questions</button></div>
      <article class="card p-5 sm:p-7"><div class="flex items-start gap-3">${authorAvatar(question.author)}<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><span class="font-semibold text-slate-900">${authorName(question.author)}</span><span class="text-xs text-slate-400">${timeAgo(new Date(question.createdAt).getTime())}</span><span class="rounded-full px-2 py-0.5 text-[11px] font-semibold ${question.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}">${question.status === 'resolved' ? 'Resolved' : 'Open for answers'}</span></div>
      <h1 class="mt-3 text-2xl font-bold text-slate-900">${esc(question.title)}</h1><p class="mt-3 text-sm leading-6 text-slate-700 whitespace-pre-wrap">${esc(question.description)}</p>
      ${question.codeSnippet ? `<pre class="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100"><code>${esc(question.codeSnippet)}</code></pre>` : ''}<div class="mt-4 flex flex-wrap gap-2"><span class="rounded-md bg-violet-50 text-violet-700 px-2 py-1 text-xs">${esc(question.topic)}</span><span class="rounded-md bg-amber-50 text-amber-700 px-2 py-1 text-xs">${esc(question.difficulty || 'Easy')}</span>${question.language && question.language !== 'General' ? `<span class="rounded-md bg-sky-50 text-sky-700 px-2 py-1 text-xs">${esc(question.language)}</span>` : ''}${(question.tags || []).map(t => `<span class="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">${esc(t)}</span>`).join('')}</div>
      <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3"><button type="button" class="text-sm ${question.isLikedByMe ? 'text-indigo-700' : 'text-slate-500 hover:text-indigo-700'}" data-action="like-question" data-id="${esc(question._id)}"><i class="fa-${question.isLikedByMe ? 'solid' : 'regular'} fa-heart mr-1"></i>${Number(question.likesCount || 0)} likes</button><span class="text-sm text-slate-500"><i class="fa-regular fa-eye mr-1"></i>${Number(question.views || 0)} views</span>${isOwner && question.status === 'open' ? `<button type="button" data-action="resolve-question" data-id="${esc(question._id)}" class="btn-outline !py-1 !px-2 text-xs ml-auto">Mark resolved without selecting</button>` : ''}</div></div></div></article>
      <section class="mt-6"><div class="flex items-end justify-between gap-3 mb-3"><div><h2 class="text-xl font-bold text-slate-900">Community answers</h2><p class="text-sm text-slate-500">Every peer can contribute, whatever their level or listed skill.</p></div><span class="text-sm text-slate-500">${answers.length} answer${answers.length === 1 ? '' : 's'}</span></div>
      ${answers.length ? `<div class="grid gap-3">${answers.map(answer => answerCard(question, answer)).join('')}</div>` : `<div class="card p-8 text-center"><i class="fa-regular fa-comments text-3xl text-slate-300"></i><h3 class="mt-2 font-semibold text-slate-800">No answers yet</h3><p class="text-sm text-slate-500 mt-1">Be the first peer to help solve this doubt.</p></div>`}
      ${question.status === 'open' ? signedIn() ? `<form class="card p-4 mt-4" data-form="answer"><label class="block font-semibold text-slate-900 text-sm">Your answer</label><textarea name="body" class="input mt-2 w-full" rows="4" required minlength="3" maxlength="5000" placeholder="Explain the approach, steps, or solution…"></textarea><div class="mt-3 flex justify-end"><button class="btn-primary" type="submit"><i class="fa-solid fa-reply mr-1"></i>Post answer</button></div></form>` : `<div class="card p-5 mt-4"><p class="text-sm text-slate-600">Sign in to write an answer or request a live session with a peer.</p><button type="button" class="btn-primary mt-3" data-action="signin">Sign in to help</button></div>` : ''}</section>`;
  }

  function render() {
    if (questionId) {
      root.innerHTML = wrap(`${communityHeader()}${loading ? '<div class="card p-8 text-center text-slate-500">Loading discussion…</div>' : loadError ? `<div class="card p-8 text-center"><p class="text-rose-600">${esc(loadError)}</p><button type="button" data-action="back-feed" class="btn-primary mt-4">Back to community</button></div>` : detail ? detailHtml(detail) : '<div class="card p-8">Question not found.</div>'}`);
      return;
    }
    const visible = questions;
    root.innerHTML = wrap(`${communityHeader()}${composeForm()}
      <div class="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start"><section>
      <div class="card p-3 mb-4"><div class="grid sm:grid-cols-[minmax(0,1fr)_180px_150px] gap-2"><input class="input" id="community-search" type="search" value="${esc(searchText)}" placeholder="Search public questions…" aria-label="Search community questions"><select class="input" id="community-topic"><option value="">All topics</option>${TOPICS.map(t => `<option value="${esc(t)}" ${topicFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select><select class="input" id="community-status"><option value="" ${statusFilter === '' ? 'selected' : ''}>All questions</option><option value="open" ${statusFilter === 'open' ? 'selected' : ''}>Open questions</option><option value="resolved" ${statusFilter === 'resolved' ? 'selected' : ''}>Resolved</option></select></div></div>
      ${loading ? '<div class="card p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading community…</div>' : loadError ? `<div class="card p-8 text-center"><p class="text-rose-600">${esc(loadError)}</p><button type="button" data-action="reload" class="btn-primary mt-3">Try again</button></div>` : visible.length ? `<div class="grid gap-3">${visible.map(questionCard).join('')}</div>` : `<div class="card p-10 text-center"><i class="fa-regular fa-comments text-4xl text-slate-300"></i><h2 class="mt-3 font-semibold text-slate-900">No questions found</h2><p class="text-sm text-slate-500 mt-1">Try a different search or be the first to ask.</p>${signedIn() ? '<button type="button" class="btn-primary mt-4" data-action="new-question">Ask a question</button>' : '<button type="button" class="btn-primary mt-4" data-action="signin">Sign in to ask</button>'}</div>`}
      </section><aside class="card p-5"><h2 class="font-semibold text-slate-900"><i class="fa-solid fa-earth-asia text-indigo-600 mr-2"></i>Open community</h2><p class="text-sm text-slate-600 mt-2">Questions are public. Anyone can share a solution, ask follow-up questions, or mark a helpful answer. You do not need to match the asker’s skill or level.</p><div class="mt-4 grid grid-cols-2 gap-2"><div class="rounded-lg bg-indigo-50 p-3"><div class="text-2xl font-bold text-indigo-700">${questions.length}</div><div class="text-xs text-indigo-700">loaded questions</div></div><div class="rounded-lg bg-emerald-50 p-3"><div class="text-2xl font-bold text-emerald-700">${questions.filter(q => q.status === 'resolved').length}</div><div class="text-xs text-emerald-700">resolved</div></div></div><a href="#/peers" class="btn-outline w-full justify-center mt-4"><i class="fa-solid fa-users mr-1"></i>Browse all peers</a>${signedIn() ? `<a href="#/wallet" class="btn-outline w-full justify-center mt-2"><i class="fa-solid fa-coins mr-1"></i>My credit ledger</a>` : `<button type="button" class="btn-outline w-full justify-center mt-2" data-action="signin">Sign in / Create account</button>`}</aside></div>`);
    const search = $('#community-search', root); if (search) { search.focus({ preventScroll: true }); search.setSelectionRange(search.value.length, search.value.length); }
  }

  async function load() {
    loading = true; loadError = ''; render();
    try {
      if (questionId) {
        const result = await S.getQuestion(questionId); detail = result.question || null;
      } else {
        const result = await S.listQuestions({ q: searchText, topic: topicFilter, status: statusFilter, sort, limit: 60 });
        questions = Array.isArray(result.questions) ? result.questions : [];
      }
    } catch (error) { loadError = error?.message || 'Could not load community questions.'; }
    finally { loading = false; render(); }
  }

  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    const action = button.dataset.action, id = button.dataset.id;
    if (action === 'signin') { onAuth(); return; }
    if (action === 'new-question') { if (!signedIn()) return onAuth(); showComposer = true; render(); return; }
    if (action === 'close-composer') { showComposer = false; render(); return; }
    if (action === 'open-question') { location.hash = `#/community/${encodeURIComponent(id)}`; return; }
    if (action === 'back-feed') { location.hash = '#/'; return; }
    if (action === 'reload') { await load(); return; }
    if (action === 'like-question') {
      if (!signedIn()) return onAuth();
      try { await S.likeQuestion(id); await load(); } catch (error) { toast(error.message, 'err'); }
      return;
    }
    if (action === 'helpful') {
      if (!signedIn()) return onAuth();
      try { await S.markAnswerHelpful(id, button.dataset.answer); await load(); } catch (error) { toast(error.message, 'err'); }
      return;
    }
    if (action === 'accept-answer') {
      if (!signedIn()) return onAuth();
      try { await S.acceptQuestionAnswer(id, button.dataset.answer); toast('Answer accepted; question is now resolved.', 'ok'); await load(); } catch (error) { toast(error.message, 'err'); }
      return;
    }
    if (action === 'resolve-question') {
      if (!signedIn()) return onAuth();
      try { await S.resolveQuestion(id); toast('Question marked resolved.', 'ok'); await load(); } catch (error) { toast(error.message, 'err'); }
      return;
    }
    if (action === 'live-help') {
      if (!signedIn()) return onAuth();
      const authorId = button.dataset.answerer;
      const answerBody = button.dataset.answerBody || '';
      if (!authorId || authorId === String(S.me())) { toast('Choose another peer to request live help.', 'err'); return; }
      if (!detail) { toast('Reload the discussion and try again.', 'err'); return; }
      const result = await S.requestSession({ learnerId: S.me(), mentorId: authorId, title: `Live help: ${detail.title}`.slice(0, 90), problem: `${detail.description}\n\nSuggested answer from the peer:\n${answerBody}`.slice(0, 12000), topic: detail.topic || 'General', lang: detail.language || 'JavaScript', duration: 15, questionId: detail._id });
      if (!result.ok) toast(result.error, 'err'); else { toast('Request sent. The peer must accept before the live room opens.', 'ok'); location.hash = '#/sessions'; }
    }
  });

  root.addEventListener('change', event => {
    if (event.target.id === 'community-topic') { topicFilter = event.target.value; load(); }
    if (event.target.id === 'community-status') { statusFilter = event.target.value; load(); }
  });
  let searchTimer = null;
  root.addEventListener('input', event => {
    if (event.target.id !== 'community-search') return;
    searchText = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => load(), 220);
  });
  root.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-form="question"],[data-form="answer"]')) return;
    event.preventDefault();
    if (!signedIn()) return onAuth();
    const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
    try {
      const formData = new FormData(form);
      if (form.dataset.form === 'question') {
        const result = await S.createQuestion({
          title: String(formData.get('title') || '').trim(),
          description: String(formData.get('description') || '').trim(),
          topic: String(formData.get('topic') || 'Other'),
          language: String(formData.get('language') || 'General').trim() || 'General',
          difficulty: String(formData.get('difficulty') || 'Easy'),
          tags: String(formData.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 10),
          codeSnippet: String(formData.get('codeSnippet') || '').trim()
        });
        showComposer = false;
        toast('Your question is now public.', 'ok');
        const createdId = idOf(result.question);
        if (createdId) { location.hash = `#/community/${encodeURIComponent(createdId)}`; return; }
        await load();
      } else {
        await S.addAnswer(questionId, String(formData.get('body') || '').trim());
        toast('Your answer was posted.', 'ok');
        await load();
      }
    } catch (error) { toast(error.message || 'Could not save your contribution.', 'err'); }
    finally { if (button?.isConnected) button.disabled = false; }
  });

  load();
  return { refresh: load, dispose: () => clearTimeout(searchTimer) };
}
