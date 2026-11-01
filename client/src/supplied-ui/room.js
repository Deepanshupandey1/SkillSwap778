// Live collaboration room: MongoDB-backed editor, whiteboard, chat, notes and WebRTC media via Socket.IO.
import * as S from './store.js';
import { $, $$, esc, avatar, toast, confirmDialog, mmss, levelBadge, credits, timeAgo } from './ui.js';

const CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
const MODES = ['javascript/javascript', 'python/python', 'sql/sql', 'clike/clike', 'css/css', 'xml/xml', 'htmlmixed/htmlmixed', 'go/go'];
const MODE_OF = { JavaScript: 'javascript', TypeScript: 'text/typescript', Python: 'python', SQL: 'text/x-sql', GLSL: 'x-shader/x-fragment', Rust: 'text/x-rustsrc', Go: 'go', Java: 'text/x-java', 'C++': 'text/x-c++src', Dart: 'dart', Swift: 'text/x-swift', Kotlin: 'text/x-kotlin', 'HTML/CSS': 'htmlmixed' };
const EXT = { JavaScript: 'js', TypeScript: 'ts', Python: 'py', SQL: 'sql', GLSL: 'glsl', Rust: 'rs', Go: 'go', Java: 'java', 'C++': 'cpp', Dart: 'dart', Swift: 'swift', Kotlin: 'kt', 'HTML/CSS': 'html' };
const COLORS = ['#0f172a', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
const W = 1600, H = 900;
let cmPromise = null;

const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Failed ' + src)); document.head.appendChild(s); });
function loadCM() {
  if (window.CodeMirror) return Promise.resolve();
  if (cmPromise) return cmPromise;
  [CM + 'codemirror.min.css', CM + 'theme/material-darker.min.css'].forEach(h => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = h; document.head.appendChild(l); });
  cmPromise = (async () => {
    await loadScript(CM + 'codemirror.min.js');
    await loadScript(CM + 'addon/mode/simple.min.js');
    await Promise.all(MODES.map(m => loadScript(`${CM}mode/${m}.min.js`)));
  })().catch(e => { cmPromise = null; throw e; });
  return cmPromise;
}

const commentHeader = (lang, title, problem) => {
  const lines = ['Session goal: ' + title, ...(problem ? problem.match(/.{1,70}(\s|$)/g).map(x => x.trim()) : [])];
  if (lang === 'Python') return lines.map(l => '# ' + l).join('\n') + '\n\n';
  if (lang === 'SQL') return lines.map(l => '-- ' + l).join('\n') + '\n\n';
  if (lang === 'HTML/CSS') return '<!-- ' + lines.join('\n     ') + ' -->\n\n';
  return lines.map(l => '// ' + l).join('\n') + '\n\n';
};
const STARTER = {
  GLSL: 'precision highp float;\nuniform vec2 u_resolution;\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  vec3 sky = mix(vec3(0.02, 0.03, 0.12), vec3(0.05, 0.08, 0.25), uv.y);\n  gl_FragColor = vec4(sky, 1.0);\n}\n',
  SQL: 'CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email TEXT UNIQUE NOT NULL\n);\n',
  'HTML/CSS': '<div class="card">\n  <h2>Hello</h2>\n</div>\n',
  JavaScript: 'function solve(input) {\n  // start here\n}\n', Python: 'def solve(data):\n    # start here\n    pass\n',
};


export async function mountRoom(root, sid) {
  const meId = S.me();
  let sess = S.session(sid);
  const bail = (icon, title, text, link = '#/sessions', label = 'Back to sessions') => {
    root.innerHTML = `<div class="max-w-md mx-auto py-24 px-6 text-center"><i class="fa-solid ${icon} text-4xl text-slate-300"></i><h1 class="mt-4 text-xl font-semibold text-slate-900">${title}</h1><p class="mt-2 text-slate-500 text-sm">${text}</p><a href="${link}" class="btn-primary mt-6">${label}</a></div>`;
    return () => { };
  };
  if (!sess) return bail('fa-circle-question', 'Session not found', 'This room does not exist.');
  if (sess.learnerId !== meId && sess.mentorId !== meId) return bail('fa-lock', 'Not your session', `You are signed in as ${esc(S.user(meId).name)}, who is not part of this session. Use the user switcher in the header to join as a participant.`);
  if (sess.status === 'completed') { location.hash = '#/recap/' + sid; return () => { }; }
  if (sess.status === 'requested') return bail('fa-hourglass-half', 'Waiting for the peer', 'The room opens as soon as the peer accepts your request.');
  if (['declined', 'cancelled'].includes(sess.status)) return bail('fa-ban', 'Session ' + sess.status, 'No credits were charged.');
  if (sess.status === 'accepted') {
    try { await S.enterRoom(sid); sess = S.session(sid); }
    catch (error) { return bail('fa-triangle-exclamation', 'Could not start the room', esc(error.message || 'The accepted session could not be started.')); }
  }

  const isLearner = sess.learnerId === meId, otherId = isLearner ? sess.mentorId : sess.learnerId;
  const meU = S.user(meId), other = S.user(otherId);
  const lang0 = sess.lang && MODE_OF[sess.lang] ? sess.lang : 'JavaScript';
  const roomId = sess.roomId;
  if (!roomId) return bail('fa-triangle-exclamation', 'Live room unavailable', 'The backend has not created a session room for this booking yet. Refresh your sessions and try again.');
  const socket = S.getSocket();
  if (!socket) return bail('fa-plug', 'Realtime connection unavailable', 'The authenticated Socket.IO connection could not be created. Check your backend URL and sign in again.');
  const roomAck = await new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timeout); socket.off('connect', join); resolve(value); };
    const join = () => socket.emit('room:join', { sessionId: roomId }, finish);
    const timeout = setTimeout(() => finish({ ok: false, message: 'Timed out connecting to the live room. Reload and try again.' }), 12000);
    if (socket.connected) join(); else socket.once('connect', join);
    socket.once('connect_error', error => finish({ ok: false, message: error?.message || 'Socket.IO connection failed.' }));
  });
  if (!roomAck?.ok) return bail('fa-plug', 'Could not join live room', esc(roomAck?.message || 'The server rejected this room join.'));
  const backendToUiLanguage = value => ({ javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', sql: 'SQL', cpp: 'C++', java: 'Java', html: 'HTML/CSS', css: 'HTML/CSS', plaintext: 'GLSL' }[String(value || '').toLowerCase()] || (MODE_OF[value] ? value : 'JavaScript'));
  const uiToBackendLanguage = value => ({ JavaScript: 'javascript', TypeScript: 'typescript', Python: 'python', SQL: 'sql', 'C++': 'cpp', Java: 'java', 'HTML/CSS': 'html', GLSL: 'plaintext', Rust: 'plaintext', Go: 'plaintext', Dart: 'plaintext', Swift: 'plaintext', Kotlin: 'plaintext' }[value] || 'plaintext');
  const workspace = roomAck.workspace || {};
  let doc = {
    code: typeof workspace.code === 'string' && workspace.code ? workspace.code : commentHeader(lang0, sess.title, sess.problem) + (STARTER[lang0] || ''),
    lang: backendToUiLanguage(workspace.language || lang0), notes: workspace.notes || '', summary: workspace.summary || '',
    strokes: Array.isArray(workspace.whiteboard?.strokes) ? workspace.whiteboard.strokes : [],
    clearedAt: Number(workspace.whiteboard?.clearedAt || 0),
    chat: (roomAck.messages || []).map(m => ({ id: String(m._id), uid: String(m.sender?._id || m.sender), text: m.body || '', ts: new Date(m.createdAt || Date.now()).getTime() }))
  };
  if (!doc.chat.length) doc.chat.push({ id: 'sys0', uid: 'sys', text: 'Room opened. Share the problem, then work through it together.', ts: Date.now() });

  root.innerHTML = `
  <div class="room flex flex-col" style="height:calc(100vh - 4rem)">
    <div class="shrink-0 bg-white border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 text-xs text-slate-500"><span class="live-dot"></span><span class="font-medium text-emerald-700">Live session</span><span>·</span><span>You are the <b>${isLearner ? 'learner' : 'mentor'}</b></span></div>
        <h1 class="font-semibold text-slate-900 truncate" title="${esc(sess.title)}">${esc(sess.title)}</h1>
      </div>
      <div class="flex items-center gap-4 text-sm">
        <div class="text-right"><div class="text-[11px] uppercase tracking-wide text-slate-400">Elapsed</div><div id="r-timer" class="font-mono font-semibold text-slate-900">00:00</div><div class="text-[11px] text-slate-400">of ${sess.duration} min</div></div>
        <div class="text-right"><div class="text-[11px] uppercase tracking-wide text-slate-400">At stake</div>${credits(sess.cost, 'text-slate-900')}<div class="text-[11px] text-slate-400">${isLearner ? 'you pay' : 'you earn'}</div></div>
      </div>
      <div class="flex items-center gap-2">
        <div class="seg" role="tablist" aria-label="Workspace view">
          <button class="seg-btn" data-view="code"><i class="fa-solid fa-code"></i><span class="hidden sm:inline">Code</span></button>
          <button class="seg-btn" data-view="board"><i class="fa-solid fa-pen-ruler"></i><span class="hidden sm:inline">Whiteboard</span></button>
          <button class="seg-btn hidden lg:inline-flex" data-view="split"><i class="fa-solid fa-table-columns"></i><span>Split</span></button>
        </div>
        <a href="#/sessions" class="btn-ghost" title="Leave without ending (the session stays open)"><i class="fa-solid fa-arrow-right-from-bracket"></i><span class="hidden md:inline">Leave</span></a>
        <button id="r-end" class="btn-primary bg-emerald-600 hover:bg-emerald-700"><i class="fa-solid fa-flag-checkered"></i>End &amp; settle</button>
      </div>
    </div>
    <div class="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-1">
      <div id="r-work" class="min-h-0 min-w-0 grid gap-0 bg-slate-100">
        <section id="pane-code" class="min-h-0 min-w-0 flex flex-col bg-[#212121]">
          <div class="shrink-0 flex items-center gap-2 px-3 py-2 bg-[#2a2a2a] text-slate-300 text-xs">
            <i class="fa-solid fa-file-code"></i><span id="r-fname" class="font-mono"></span>
            <select id="r-lang" class="ml-auto bg-[#3a3a3a] text-slate-200 rounded px-2 py-1 text-xs border-0" aria-label="Language">${Object.keys(MODE_OF).map(l => `<option ${l === doc.lang ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <button id="r-copy" class="px-2 py-1 rounded hover:bg-white/10" title="Copy code"><i class="fa-regular fa-copy"></i></button>
          </div>
          <div id="r-editor" class="flex-1 min-h-0 relative"><div class="p-6 text-slate-400 text-sm"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading editor…</div></div>
        </section>
        <section id="pane-board" class="min-h-0 min-w-0 flex flex-col bg-white">
          <div class="shrink-0 flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-slate-200 bg-white">
            <div class="flex gap-0.5" id="b-tools">
              <button class="tool" data-tool="pen" title="Pen"><i class="fa-solid fa-pen"></i></button>
              <button class="tool" data-tool="line" title="Line"><i class="fa-solid fa-slash"></i></button>
              <button class="tool" data-tool="rect" title="Rectangle"><i class="fa-regular fa-square"></i></button>
              <button class="tool" data-tool="ellipse" title="Ellipse"><i class="fa-regular fa-circle"></i></button>
              <button class="tool" data-tool="eraser" title="Eraser"><i class="fa-solid fa-eraser"></i></button>
            </div>
            <span class="w-px h-5 bg-slate-200 mx-1"></span>
            <div class="flex gap-1" id="b-colors">${COLORS.map((c, i) => `<button class="swatch" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
            <span class="w-px h-5 bg-slate-200 mx-1"></span>
            <input id="b-size" type="range" min="2" max="24" value="4" class="w-20 accent-indigo-600" aria-label="Brush size">
            <span class="ml-auto flex gap-1">
              <button id="b-undo" class="tool" title="Undo my last stroke"><i class="fa-solid fa-rotate-left"></i></button>
              <button id="b-clear" class="tool" title="Clear board for everyone"><i class="fa-regular fa-trash-can"></i></button>
              <button id="b-save" class="tool" title="Download PNG"><i class="fa-solid fa-download"></i></button>
            </span>
          </div>
          <div id="b-wrap" class="relative flex-1 min-h-0 flex items-center justify-center p-3 bg-slate-100 overflow-hidden">
            <canvas id="b-canvas" width="${W}" height="${H}" class="board-canvas shadow ring-1 ring-slate-200 rounded" style="max-width:100%;max-height:100%;touch-action:none"></canvas>
            <div id="b-ptrs" class="pointer-events-none absolute inset-0"></div>
          </div>
        </section>
      </div>
      <aside class="min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-200 bg-white" style="max-height:100%">
        <section id="rtc-panel" class="shrink-0 p-3 border-b border-slate-100">
          <div class="flex items-center justify-between gap-2 mb-2"><div class="text-[11px] uppercase tracking-wide text-slate-400">Live audio / video</div><span id="rtc-status" class="text-[10px] text-slate-500">Not connected</span></div>
          <div class="grid grid-cols-2 gap-2">
            <div class="relative min-w-0 rounded-lg overflow-hidden bg-slate-900 aspect-video"><video id="rtc-remote" class="rtc-video" autoplay playsinline></video><span class="rtc-video-label">${esc(other.name.split(' ')[0])}</span></div>
            <div class="relative min-w-0 rounded-lg overflow-hidden bg-slate-900 aspect-video"><video id="rtc-local" class="rtc-video" autoplay playsinline muted></video><span class="rtc-video-label">You</span></div>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 mt-2">
            <button id="rtc-call" class="btn-primary !py-1.5 !px-2 text-xs"><i class="fa-solid fa-video"></i>Start call</button>
            <button id="rtc-mic" class="btn-outline !py-1.5 !px-2 text-xs" disabled title="Enable your microphone"><i class="fa-solid fa-microphone"></i></button>
            <button id="rtc-camera" class="btn-outline !py-1.5 !px-2 text-xs" disabled title="Enable your camera"><i class="fa-solid fa-camera"></i></button>
            <button id="rtc-hangup" class="btn-outline !py-1.5 !px-2 text-xs text-rose-600" disabled><i class="fa-solid fa-phone-slash"></i></button>
          </div>
        </section>
        <div class="shrink-0 p-3 border-b border-slate-100"><div class="text-[11px] uppercase tracking-wide text-slate-400 mb-2">In this room</div><div id="r-people" class="space-y-2"></div></div>
        <div class="shrink-0 flex border-b border-slate-100 text-sm">
          <button class="side-tab" data-side="chat"><i class="fa-regular fa-comments"></i> Chat <span id="chat-badge" class="hidden ml-1 text-[10px] rounded-full bg-indigo-600 text-white px-1.5"></span></button>
          <button class="side-tab" data-side="notes"><i class="fa-regular fa-note-sticky"></i> Notes</button>
          <button class="side-tab" data-side="brief"><i class="fa-regular fa-circle-question"></i> Problem</button>
        </div>
        <div id="side-chat" class="flex-1 min-h-0 flex flex-col">
          <div id="chat-list" class="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 text-sm" style="min-height:120px"></div>
          <form id="chat-form" class="shrink-0 p-2 border-t border-slate-100 flex gap-2"><input id="chat-input" autocomplete="off" maxlength="400" placeholder="Message ${esc(other.name.split(' ')[0])}…" class="input flex-1"><button class="btn-primary px-3" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button></form>
        </div>
        <div id="side-notes" class="hidden flex-1 min-h-0 flex flex-col p-3"><label class="text-xs text-slate-500 mb-1">Shared session notes (saved to the recap)</label><textarea id="notes-input" class="input flex-1 resize-none" placeholder="Key takeaways, links, next steps…"></textarea></div>
        <div id="side-brief" class="hidden flex-1 min-h-0 overflow-y-auto p-4 text-sm text-slate-700 space-y-3">
          <div><div class="text-xs text-slate-400 mb-1">Topic</div>${esc(sess.topic)} · ${esc(sess.lang)}</div>
          <div><div class="text-xs text-slate-400 mb-1">Problem</div><p class="whitespace-pre-wrap">${esc(sess.problem || 'No description provided.')}</p></div>
          <div class="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3 text-amber-900 text-xs"><i class="fa-solid fa-shield-halved mr-1"></i>Credits move only when the session is ended. Leaving the room keeps credits untouched.</div>
        </div>
      </aside>
    </div>
  </div>`;

  // ---------- Socket.IO transport + MongoDB persistence ----------
  const peers = {};
  let disposed = false;
  const realPeerOnline = () => Boolean(peers[otherId] && Date.now() - peers[otherId] < 12000);
  let saveT = null, boardSaveT = null, previewT = null, lastPreviewAt = 0;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (disposed) return;
      const code = typeof getCode === 'function' ? getCode() : doc.code;
      socket.emit('editor:update', { sessionId: roomId, code: String(code || '').slice(0, 100000), language: uiToBackendLanguage(doc.lang) }, result => { if (result && !result.ok) toast(result.message || 'Code could not be saved', 'err'); });
      socket.emit('session:notes', { sessionId: roomId, notes: String(doc.notes || '').slice(0, 12000), summary: String(doc.summary || '').slice(0, 3000) });
      saveWhiteboard();
    }, 350);
  };
  const boardSnapshot = () => ({ strokes: doc.strokes || [], clearedAt: Number(doc.clearedAt || 0) });
  function saveWhiteboard() {
    clearTimeout(boardSaveT);
    boardSaveT = setTimeout(() => socket.emit('whiteboard:update', { sessionId: roomId, whiteboard: boardSnapshot() }, result => {
      if (result && !result.ok && !disposed) toast(result.message || 'Whiteboard could not be saved', 'err');
    }), 250);
  }
  const send = m => {
    if (!m || disposed) return;
    switch (m.t) {
      case 'code': case 'fullcode': doc.code = m.code || (typeof getCode === 'function' ? getCode() : doc.code); persist(); break;
      case 'lang': doc.lang = m.lang; socket.emit('editor:language', { sessionId: roomId, language: uiToBackendLanguage(m.lang) }, ack => { if (ack && !ack.ok) toast(ack.message, 'err'); }); persist(); break;
      case 'notes': doc.notes = m.v || ''; persist(); break;
      case 'chat': socket.emit('chat:message', { sessionId: roomId, body: m.m?.text || '' }, ack => { if (!ack?.ok) toast(ack?.message || 'Chat message could not be sent', 'err'); }); break;
      case 'cursor': socket.volatile.emit('editor:cursor', { sessionId: roomId, pos: m.pos }); break;
      case 'ptr': socket.volatile.emit('whiteboard:pointer', { sessionId: roomId, x: Number(m.x), y: Number(m.y) }); break;
      case 'ss': case 'sp': case 'se': case 'undo': case 'clear':
        socket.emit('room:event', { sessionId: roomId, event: { ...m, uid: meId } });
        if (m.t === 'sp') {
          const now = Date.now();
          if (now - lastPreviewAt > 45) { lastPreviewAt = now; socket.volatile.emit('whiteboard:preview', { sessionId: roomId, whiteboard: boardSnapshot() }); }
        }
        if (m.t === 'clear') doc.clearedAt = Number(m.at || Date.now());
        doc.strokes = strokes;
        saveWhiteboard();
        break;
      default: break;
    }
  };

  // ---------- people ----------
  const peopleEl = $('#r-people', root);
  function renderPeople() {
    const online = realPeerOnline();
    const row = (u, role, on, you, note) => `<div class="flex items-center gap-2.5">${avatar(u, 'w-8 h-8 text-xs')}<div class="min-w-0 flex-1"><div class="text-sm font-medium text-slate-900 truncate">${esc(u.name)}${you ? ' <span class="text-slate-400 font-normal">(you)</span>' : ''}</div><div class="text-xs text-slate-500">${role}${note ? ' · ' + note : ''}</div></div><span class="inline-flex items-center gap-1 text-xs ${on ? 'text-emerald-600' : 'text-slate-400'}"><span class="w-2 h-2 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-300'}"></span>${on ? 'In room' : 'Not here yet'}</span></div>`;
    peopleEl.innerHTML = row(meU, isLearner ? 'Learner' : 'Mentor', true, true) + row(other, isLearner ? 'Mentor' : 'Learner', online, false);
  }
  const hb = setInterval(() => {
    socket.emit('room:ping', { sessionId: roomId });
    renderPeople(); tick();
  }, 3000);

  // ---------- chat ----------
  const chatList = $('#chat-list', root);
  let unread = 0, sideTab = 'chat';
  const seenChat = new Set();
  function chatHTML(m) {
    if (m.uid === 'sys') return `<div class="text-center text-xs text-slate-400 py-1">${esc(m.text)}</div>`;
    const mine = m.uid === meId, u = S.user(m.uid) || { name: '?' };
    return `<div class="flex ${mine ? 'justify-end' : 'justify-start'}"><div class="max-w-[85%]"><div class="text-[10px] text-slate-400 ${mine ? 'text-right' : ''} mb-0.5">${mine ? 'You' : esc(u.name.split(' ')[0])} · ${timeAgo(m.ts)}</div><div class="rounded-2xl px-3 py-2 ${mine ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'} break-words">${esc(m.text)}</div></div></div>`;
  }
  function addChat(m, fromRemote) {
    if (seenChat.has(m.id)) return; seenChat.add(m.id);
    if (!doc.chat.find(x => x.id === m.id)) doc.chat.push(m);
    chatList.insertAdjacentHTML('beforeend', chatHTML(m));
    chatList.scrollTop = chatList.scrollHeight;
    if (fromRemote && sideTab !== 'chat') { unread++; const b = $('#chat-badge', root); b.textContent = unread; b.classList.remove('hidden'); }
    persist();
  }
  doc.chat.forEach(m => { seenChat.add(m.id); chatList.insertAdjacentHTML('beforeend', chatHTML(m)); });
  chatList.scrollTop = chatList.scrollHeight;
  $('#chat-form', root).addEventListener('submit', e => {
    e.preventDefault(); const inp = $('#chat-input', root); const text = inp.value.trim(); if (!text) return; inp.value = '';
    const m = { id: 'c' + Date.now() + Math.random().toString(36).slice(2, 5), uid: meId, text, ts: Date.now() };
    send({ t: 'chat', m });
  });
  const sideTabs = $$('.side-tab', root);
  function showSide(n) {
    sideTab = n; sideTabs.forEach(b => b.classList.toggle('on', b.dataset.side === n));
    ['chat', 'notes', 'brief'].forEach(k => $('#side-' + k, root).classList.toggle('hidden', k !== n));
    if (n === 'chat') { unread = 0; $('#chat-badge', root).classList.add('hidden'); chatList.scrollTop = chatList.scrollHeight; }
  }
  sideTabs.forEach(b => b.addEventListener('click', () => showSide(b.dataset.side)));
  showSide('chat');

  // ---------- notes ----------
  const notesEl = $('#notes-input', root); notesEl.value = doc.notes || '';
  notesEl.addEventListener('input', () => { doc.notes = notesEl.value; send({ t: 'notes', v: notesEl.value }); persist(); });

  // ---------- code editor ----------
  let cm = null, ta = null, lastLocalEdit = 0, mismatch = 0;
  const getCode = () => cm ? cm.getValue() : ta ? ta.value : doc.code;
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  const fname = () => $('#r-fname', root).textContent = 'session.' + (EXT[doc.lang] || 'txt');
  fname();
  const remoteCursors = {};
  function showRemoteCursor(uid, pos) {
    if (!cm) return; const u = S.user(uid); if (!u) return;
    if (remoteCursors[uid]) remoteCursors[uid].clear();
    const el = document.createElement('span'); el.className = 'rcursor'; el.style.borderColor = `hsl(${u.hue} 80% 60%)`;
    el.innerHTML = `<span class="rlabel" style="background:hsl(${u.hue} 70% 45%)">${esc(u.name.split(' ')[0])}</span>`;
    try { remoteCursors[uid] = cm.setBookmark(pos, { widget: el, insertLeft: true }); } catch (e) { }
  }
  function applyRemoteOps(ops, uid) {
    cm.operation(() => ops.forEach(o => { const to = o.to; cm.replaceRange(o.text.join('\n'), o.from, to, 'remote'); }));
    doc.code = cm.getValue(); persist();
  }
  loadCM().then(() => {
    if (disposed) return;
    const ed = $('#r-editor', root); ed.innerHTML = '';
    cm = window.CodeMirror(ed, { value: doc.code, mode: MODE_OF[doc.lang], theme: 'material-darker', lineNumbers: true, indentUnit: 2, tabSize: 2, lineWrapping: false, autofocus: true, viewportMargin: Infinity });
    cm.setSize('100%', '100%');
    cm.on('changes', (inst, changes) => {
      if (changes.every(c => c.origin === 'remote' || c.origin === 'setValue')) return;
      lastLocalEdit = Date.now(); doc.code = cm.getValue(); persist();
      send({ t: 'code', ops: changes.map(c => ({ from: c.from, to: c.to, text: c.text })) });
    });
    let curT = 0;
    cm.on('cursorActivity', () => { const n = Date.now(); if (n - curT > 120) { curT = n; send({ t: 'cursor', pos: cm.getCursor() }); } });
    applyView();
    setTimeout(() => cm.refresh(), 50);
  }).catch(() => {
    const ed = $('#r-editor', root); ed.innerHTML = '';
    ta = document.createElement('textarea'); ta.className = 'w-full h-full bg-[#212121] text-slate-100 font-mono text-sm p-3 outline-none resize-none'; ta.value = doc.code; ed.appendChild(ta);
    ta.addEventListener('input', () => { lastLocalEdit = Date.now(); doc.code = ta.value; persist(); send({ t: 'fullcode', code: ta.value }); });
    toast('Editor library could not load (offline?). Using a plain text editor.', 'info');
  });
  function setFull(code, remote = false) {
    if (cm) { const cur = cm.getCursor(), sc = cm.getScrollInfo(); cm.operation(() => { cm.setValue(code); cm.setCursor(cur); }); cm.scrollTo(sc.left, sc.top); }
    else if (ta) ta.value = code;
    doc.code = code; if (!remote) persist();
  }
  $('#r-lang', root).addEventListener('change', e => {
    doc.lang = e.target.value; setLang(doc.lang); send({ t: 'lang', lang: doc.lang }); persist();
  });
  function setLang(l) { doc.lang = l; $('#r-lang', root).value = l; if (cm) cm.setOption('mode', MODE_OF[l]); fname(); }
  $('#r-copy', root).addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(getCode()).then(() => toast('Code copied', 'ok')); });

  // ---------- whiteboard ----------
  const cv = $('#b-canvas', root), ctx = cv.getContext('2d');
  const strokes = doc.strokes; const strokeIdx = new Map(strokes.map(s => [s.id, s]));
  let tool = 'pen', color = COLORS[0], size = 4, drawing = null;
  doc.strokes = strokes;
  function drawStroke(s) {
    const p = s.pts; if (!p || !p.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = s.tool === 'eraser' ? s.size * 4 : s.size * 1.4; ctx.strokeStyle = s.color; ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.beginPath();
    if (s.tool === 'rect' && p.length > 1) { ctx.rect(p[0][0], p[0][1], p[p.length - 1][0] - p[0][0], p[p.length - 1][1] - p[0][1]); }
    else if (s.tool === 'ellipse' && p.length > 1) { const a = p[0], b = p[p.length - 1]; ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 1, Math.abs(b[1] - a[1]) / 2 || 1, 0, 0, Math.PI * 2); }
    else if (s.tool === 'line' && p.length > 1) { ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); }
    else if (p.length === 1) { ctx.arc(p[0][0], p[0][1], ctx.lineWidth / 2, 0, 7); ctx.fillStyle = s.color; ctx.fill(); }
    else { ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) { const m = [(p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2]; ctx.quadraticCurveTo(p[i - 1][0], p[i - 1][1], m[0], m[1]); } ctx.lineTo(p[p.length - 1][0], p[p.length - 1][1]); }
    if (p.length > 1) ctx.stroke(); ctx.restore();
  }
  const redraw = () => { ctx.clearRect(0, 0, W, H); strokes.forEach(drawStroke); };
  function applyBoard(whiteboard) {
    const next = Array.isArray(whiteboard?.strokes) ? whiteboard.strokes : [];
    strokes.splice(0, strokes.length, ...next); strokeIdx.clear(); strokes.forEach(stroke => strokeIdx.set(stroke.id, stroke));
    doc.strokes = strokes; doc.clearedAt = Number(whiteboard?.clearedAt || 0); redraw();
  }
  redraw();
  const pt = e => { const r = cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)]; };
  const isShape = t => t === 'line' || t === 'rect' || t === 'ellipse';
  let lastPtr = 0;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    drawing = { id: 'st' + Date.now() + Math.random().toString(36).slice(2, 5), uid: meId, tool, color, size, pts: [pt(e)], ts: Date.now() };
    strokes.push(drawing); strokeIdx.set(drawing.id, drawing);
    send({ t: 'ss', s: drawing }); redraw();
  });
  cv.addEventListener('pointermove', e => {
    const p = pt(e), n = Date.now();
    if (n - lastPtr > 40) { lastPtr = n; send({ t: 'ptr', x: p[0], y: p[1] }); }
    if (!drawing) return;
    if (isShape(drawing.tool)) { drawing.pts = [drawing.pts[0], p]; send({ t: 'sp', id: drawing.id, replace: true, pts: drawing.pts }); }
    else { drawing.pts.push(p); send({ t: 'sp', id: drawing.id, pts: [p] }); }
    redraw();
  });
  const endDraw = () => { if (!drawing) return; send({ t: 'se', id: drawing.id }); drawing = null; doc.strokes = strokes; persist(); };
  cv.addEventListener('pointerup', endDraw); cv.addEventListener('pointercancel', endDraw);
  cv.addEventListener('pointerleave', () => send({ t: 'ptr', x: -1, y: -1 }));
  const ptrs = $('#b-ptrs', root);
  function showPtr(uid, x, y) {
    let el = ptrs.querySelector(`[data-u="${uid}"]`);
    if (x < 0) { el && el.remove(); return; }
    const u = S.user(uid); if (!u) return;
    if (!el) { el = document.createElement('div'); el.dataset.u = uid; el.className = 'absolute rptr'; el.innerHTML = `<i class="fa-solid fa-arrow-pointer" style="color:hsl(${u.hue} 70% 45%)"></i><span style="background:hsl(${u.hue} 70% 45%)">${esc(u.name.split(' ')[0])}</span>`; ptrs.appendChild(el); }
    const r = cv.getBoundingClientRect(), w = ptrs.getBoundingClientRect();
    el.style.left = (r.left - w.left + x / W * r.width) + 'px'; el.style.top = (r.top - w.top + y / H * r.height) + 'px';
    clearTimeout(el._t); el._t = setTimeout(() => el.remove(), 4000);
  }
  $$('#b-tools .tool', root).forEach(b => b.addEventListener('click', () => { tool = b.dataset.tool; syncTools(); }));
  $$('#b-colors .swatch', root).forEach(b => b.addEventListener('click', () => { color = b.dataset.color; if (tool === 'eraser') tool = 'pen'; syncTools(); }));
  $('#b-size', root).addEventListener('input', e => size = +e.target.value);
  function syncTools() {
    $$('#b-tools .tool', root).forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    $$('#b-colors .swatch', root).forEach(b => b.classList.toggle('on', b.dataset.color === color && tool !== 'eraser'));
    cv.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }
  syncTools();
  $('#b-undo', root).addEventListener('click', () => {
    for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].uid === meId) { const [s] = strokes.splice(i, 1); strokeIdx.delete(s.id); send({ t: 'undo', id: s.id }); break; }
    redraw(); persist();
  });
  $('#b-clear', root).addEventListener('click', async () => {
    if (!strokes.length) return;
    if (!await confirmDialog({ title: 'Clear the whiteboard?', body: 'This clears the board for everyone in the room.', confirm: 'Clear board', danger: true, icon: 'fa-trash-can' })) return;
    strokes.length = 0; strokeIdx.clear(); doc.clearedAt = Date.now(); send({ t: 'clear', at: doc.clearedAt }); redraw(); persist();
  });
  function boardPNG(maxW = 1000, q = 0.7) {
    const c = document.createElement('canvas'); c.width = maxW; c.height = maxW * H / W; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
  }
  $('#b-save', root).addEventListener('click', () => { const a = document.createElement('a'); a.href = boardPNG(1600, 0.92); a.download = 'whiteboard.jpg'; a.click(); });

  // ---------- views ----------
  let view = localStorage.getItem('mm_view') || (innerWidth >= 1024 ? 'split' : 'code');
  if (view === 'split' && innerWidth < 1024) view = 'code';
  const work = $('#r-work', root), paneC = $('#pane-code', root), paneB = $('#pane-board', root);
  function applyView() {
    $$('.seg-btn', root).forEach(b => b.classList.toggle('on', b.dataset.view === view));
    work.style.gridTemplateColumns = view === 'split' ? '1fr 1fr' : '1fr';
    paneC.classList.toggle('hidden', view === 'board'); paneB.classList.toggle('hidden', view === 'code');
    localStorage.setItem('mm_view', view);
    requestAnimationFrame(() => { cm && cm.refresh(); });
  }
  $$('.seg-btn', root).forEach(b => b.addEventListener('click', () => { view = b.dataset.view; applyView(); }));
  applyView();
  const onResize = () => { if (innerWidth < 1024 && view === 'split') { view = 'code'; applyView(); } cm && cm.refresh(); };
  addEventListener('resize', onResize);

  // ---------- timer ----------
  const timerEl = $('#r-timer', root);
  function tick() {
    const s = S.session(sid); if (!s) return; const el = Date.now() - (s.startedAt || Date.now());
    timerEl.textContent = mmss(el); const over = el > s.duration * 60000;
    timerEl.classList.toggle('text-amber-600', over); timerEl.classList.toggle('text-slate-900', !over);
    if (over && !tick.warned) { tick.warned = true; toast('Planned time is up. Wrap up or keep going: credits are settled when you end the session.', 'info'); }
  }
  const tt = setInterval(tick, 1000); tick();

  // ---------- Socket.IO incoming events ----------
  function onRoomEvent(event = {}) {
    const m = event;
    if (!m || String(m.uid) === String(meId)) return;
    peers[String(m.uid)] = Date.now();
    if (String(m.uid) === String(otherId)) renderPeople();
    switch (m.t) {
      case 'ss': if (m.s?.id && !strokeIdx.has(m.s.id)) { strokes.push(m.s); strokeIdx.set(m.s.id, m.s); redraw(); } break;
      case 'sp': { const stroke = strokeIdx.get(m.id); if (stroke && Array.isArray(m.pts)) { stroke.pts = m.replace ? m.pts : stroke.pts.concat(m.pts); redraw(); } break; }
      case 'se': saveWhiteboard(); break;
      case 'undo': { const i = strokes.findIndex(stroke => stroke.id === m.id); if (i >= 0) { strokes.splice(i, 1); strokeIdx.delete(m.id); redraw(); } break; }
      case 'clear': strokes.length = 0; strokeIdx.clear(); doc.clearedAt = Number(m.at || Date.now()); redraw(); break;
      default: break;
    }
  }
  const onPresence = info => {
    if (!info?.id || String(info.id) === String(meId)) return;
    peers[String(info.id)] = Date.now();
    if (String(info.id) === String(otherId)) toast(`${info.name || other.name} joined the room`, 'info');
    renderPeople();
  };
  const onEditorUpdate = update => {
    if (!update || update.updatedBy === meU.name) return;
    if (typeof update.code === 'string' && getCode() !== update.code) setFull(update.code, true);
    if (update.language) setLang(backendToUiLanguage(update.language));
  };
  const onLanguage = update => { if (update?.language) setLang(backendToUiLanguage(update.language)); };
  const onNotes = update => {
    if (!update || String(update.updatedBy) === String(meId)) return;
    doc.notes = String(update.notes || ''); doc.summary = String(update.summary || '');
    if (notesEl.value !== doc.notes) notesEl.value = doc.notes;
  };
  const onChat = payload => {
    if (!payload?._id) return;
    addChat({ id: String(payload._id), uid: String(payload.sender?._id || payload.sender), text: payload.body || '', ts: new Date(payload.createdAt || Date.now()).getTime() }, true);
  };
  const onBoard = payload => { if (payload?.whiteboard) applyBoard(payload.whiteboard); };
  const onRemotePointer = payload => { if (payload?.userId) showPtr(String(payload.userId), Number(payload.x), Number(payload.y)); };
  const onRemoteCursor = payload => { if (payload?.userId) showRemoteCursor(String(payload.userId), payload.pos); };
  socket.on('presence:joined', onPresence);
  socket.on('presence:ping', onPresence);
  // Socket.IO rooms are not retained across reconnects. Rejoin and refresh the persisted
  // workspace after network recovery so collaboration and WebRTC signaling resume.
  const onReconnect = () => {
    if (disposed) return;
    socket.emit('room:join', { sessionId: roomId }, ack => {
      if (disposed || !ack?.ok) return;
      const latest = ack.workspace || {};
      if (typeof latest.code === 'string') setFull(latest.code, true);
      if (latest.language) setLang(backendToUiLanguage(latest.language));
      if (typeof latest.notes === 'string') { doc.notes = latest.notes; if (notesEl.value !== latest.notes) notesEl.value = latest.notes; }
      if (typeof latest.summary === 'string') doc.summary = latest.summary;
      if (latest.whiteboard) applyBoard(latest.whiteboard);
      socket.emit('rtc:ready', { sessionId: roomId });
      renderPeople();
    });
  };
  socket.on('connect', onReconnect);
  socket.on('room:event', onRoomEvent);
  socket.on('editor:update', onEditorUpdate);
  socket.on('editor:language', onLanguage);
  socket.on('session:notes', onNotes);
  socket.on('chat:message', onChat);
  socket.on('whiteboard:update', onBoard);
  socket.on('whiteboard:preview', onBoard);
  socket.on('whiteboard:pointer', onRemotePointer);
  socket.on('editor:cursor', onRemoteCursor);
  renderPeople();

  // ---------- WebRTC audio/video ----------
  const localVideo = $('#rtc-local', root), remoteVideo = $('#rtc-remote', root);
  const rtcStatus = $('#rtc-status', root), rtcCallBtn = $('#rtc-call', root), rtcMicBtn = $('#rtc-mic', root), rtcCameraBtn = $('#rtc-camera', root), rtcHangupBtn = $('#rtc-hangup', root);
  let localStream = null, peerConnection = null, pendingIce = [], rtcBusy = false;
  let rtcIceServers = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  let rtcConfigPromise = null;
  async function loadRtcConfig() {
    if (!rtcConfigPromise) rtcConfigPromise = S.getRtcConfig().then(config => { if (Array.isArray(config?.iceServers) && config.iceServers.length) rtcIceServers = config.iceServers; return rtcIceServers; });
    return rtcConfigPromise;
  }
  const setRtcStatus = text => { if (rtcStatus) rtcStatus.textContent = text; };
  function syncRtcButtons() {
    const hasStream = Boolean(localStream);
    rtcMicBtn.disabled = !hasStream; rtcCameraBtn.disabled = !hasStream; rtcHangupBtn.disabled = !hasStream && !peerConnection;
    if (rtcCallBtn) { rtcCallBtn.disabled = rtcBusy || Boolean(peerConnection); rtcCallBtn.innerHTML = rtcBusy ? '<i class="fa-solid fa-spinner fa-spin"></i>Connecting' : '<i class="fa-solid fa-video"></i>Start call'; }
    rtcMicBtn.innerHTML = `<i class="fa-solid fa-microphone${localStream?.getAudioTracks()[0]?.enabled === false ? '-slash' : ''}"></i>`;
    rtcCameraBtn.innerHTML = `<i class="fa-solid fa-camera${localStream?.getVideoTracks()[0]?.enabled === false ? '-slash' : ''}"></i>`;
  }
  async function ensureLocalMedia() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera/microphone access needs HTTPS or localhost in a supported browser.');
    try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); }
    catch (videoError) {
      try { localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); toast('Camera unavailable; continuing with audio only.', 'info'); }
      catch { throw videoError; }
    }
    localVideo.srcObject = localStream;
    localVideo.play?.().catch(() => {});
    syncRtcButtons();
    socket.emit('rtc:ready', { sessionId: roomId });
    return localStream;
  }
  function getPeerConnection() {
    if (peerConnection) return peerConnection;
    const pc = new RTCPeerConnection({ iceServers: rtcIceServers });
    peerConnection = pc;
    (localStream?.getTracks() || []).forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('rtc:signal', { sessionId: roomId, toUserId: otherId, signal: { type: 'candidate', candidate: event.candidate } });
    };
    pc.ontrack = event => {
      const stream = event.streams?.[0];
      if (stream) { remoteVideo.srcObject = stream; remoteVideo.play?.().catch(() => {}); setRtcStatus('Connected'); }
    };
    pc.onconnectionstatechange = () => {
      const status = pc.connectionState;
      if (status === 'connected') setRtcStatus('Connected');
      else if (status === 'connecting') setRtcStatus('Connecting…');
      else if (status === 'failed') setRtcStatus('Connection failed');
      else if (status === 'disconnected') setRtcStatus('Reconnecting…');
      else if (status === 'closed') setRtcStatus('Call ended');
      syncRtcButtons();
    };
    syncRtcButtons();
    return pc;
  }
  async function applyPendingIce(pc) {
    for (const candidate of pendingIce.splice(0)) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (error) { console.warn('Ignoring stale ICE candidate', error); }
    }
  }
  async function handleRtcSignal(payload) {
    if (!payload || String(payload.sessionId) !== String(roomId) || String(payload.fromUserId) !== String(otherId)) return;
    const signal = payload.signal || {};
    try {
      if (signal.type === 'hangup') { stopMedia(false); setRtcStatus('Peer ended the call'); return; }
      if (signal.type === 'candidate') {
        if (!peerConnection || !peerConnection.remoteDescription) pendingIce.push(signal.candidate);
        else if (signal.candidate) await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        return;
      }
      if (signal.type === 'offer') {
        await ensureLocalMedia();
        await loadRtcConfig();
        const pc = getPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(signal.description));
        await applyPendingIce(pc);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        socket.emit('rtc:signal', { sessionId: roomId, toUserId: otherId, signal: { type: 'answer', description: pc.localDescription } });
        rtcBusy = false; setRtcStatus('Answering call…'); syncRtcButtons();
      } else if (signal.type === 'answer' && peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.description));
        await applyPendingIce(peerConnection); setRtcStatus('Connecting…');
      }
    } catch (error) { console.error('WebRTC signaling failed:', error); toast(error.message || 'Could not establish the video connection.', 'err'); setRtcStatus('Call error'); rtcBusy = false; syncRtcButtons(); }
  }
  async function startVideoCall() {
    if (rtcBusy || peerConnection) return;
    rtcBusy = true; syncRtcButtons(); setRtcStatus('Requesting camera…');
    try {
      await ensureLocalMedia();
      await loadRtcConfig();
      const pc = getPeerConnection();
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      socket.emit('rtc:signal', { sessionId: roomId, toUserId: otherId, signal: { type: 'offer', description: pc.localDescription } });
      socket.emit('rtc:ready', { sessionId: roomId });
      setRtcStatus('Calling peer…');
    } catch (error) {
      console.error('Could not start call:', error); toast(error.message || 'Camera/microphone permission was not granted.', 'err');
      stopMedia(false); setRtcStatus('Call not started');
    } finally { rtcBusy = false; syncRtcButtons(); }
  }
  function stopMedia(notifyPeer = true) {
    if (notifyPeer && (peerConnection || localStream)) socket.emit('rtc:signal', { sessionId: roomId, toUserId: otherId, signal: { type: 'hangup' } });
    if (peerConnection) { peerConnection.ontrack = null; peerConnection.onicecandidate = null; peerConnection.close(); }
    peerConnection = null; pendingIce = [];
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    rtcBusy = false; setRtcStatus('Not connected'); syncRtcButtons();
  }
  rtcCallBtn.addEventListener('click', startVideoCall);
  rtcMicBtn.addEventListener('click', () => { const track = localStream?.getAudioTracks()[0]; if (!track) return; track.enabled = !track.enabled; syncRtcButtons(); });
  rtcCameraBtn.addEventListener('click', () => { const track = localStream?.getVideoTracks()[0]; if (!track) { toast('This call is audio-only because no camera is available.', 'info'); return; } track.enabled = !track.enabled; syncRtcButtons(); });
  rtcHangupBtn.addEventListener('click', () => stopMedia(true));
  const onRtcPeerReady = event => { if (String(event?.sessionId) === String(roomId) && String(event?.userId) === String(otherId)) { peers[otherId] = Date.now(); renderPeople(); } };
  socket.on('rtc:signal', handleRtcSignal);
  socket.on('rtc:peer-ready', onRtcPeerReady);
  syncRtcButtons();

  // ---------- store sync (other side ends / cancels) ----------
  let endedByMe = false;
  const unsub = S.subscribe(src => {
    if (src === 'local' && endedByMe) return;
    const s = S.session(sid); if (!s) return;
    if (s.status === 'completed' && !endedByMe) { toast(`${S.user(s.endedBy || otherId).name} ended the session. Credits have been settled.`, 'coin'); location.hash = '#/recap/' + sid; }
    else if (s.status === 'cancelled') { toast('The session was cancelled. No credits were charged.', 'info'); location.hash = '#/sessions'; }
  });

  // ---------- end session ----------
  $('#r-end', root).addEventListener('click', async () => {
    const L = S.user(sess.learnerId), M = S.user(sess.mentorId);
    const ok = await confirmDialog({ title: 'End session and settle credits?', icon: 'fa-flag-checkered', confirm: `Settle ${sess.cost} credits`,
      body: `<div class="mt-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 p-3 flex items-center justify-between gap-3"><div class="text-center">${avatar(L, 'w-9 h-9 text-xs')}<div class="text-xs mt-1">${esc(L.name.split(' ')[0])}</div><div class="text-xs text-rose-600 font-semibold">−${sess.cost}</div></div><i class="fa-solid fa-arrow-right-long text-slate-300"></i><div class="flex items-center gap-1 font-semibold">${credits(sess.cost)}</div><i class="fa-solid fa-arrow-right-long text-slate-300"></i><div class="text-center">${avatar(M, 'w-9 h-9 text-xs')}<div class="text-xs mt-1">${esc(M.name.split(' ')[0])}</div><div class="text-xs text-emerald-600 font-semibold">+${sess.cost}</div></div></div><p class="mt-3">The code, whiteboard and notes will be saved to the session recap.</p>` });
    if (!ok) return;
    const snap = { code: getCode(), lang: doc.lang, notes: doc.notes || '', summary: doc.summary || '', strokes: [...strokes], board: strokes.length ? boardPNG() : null };
    endedByMe = true;
    const r = await S.completeSession(sid, meId, snap);
    if (!r?.ok) { endedByMe = false; toast(r?.error || 'Could not end session', 'err'); return; }
    if (r.waiting) {
      endedByMe = false;
      $('#r-end', root).disabled = true;
      $('#r-end', root).innerHTML = '<i class="fa-solid fa-hourglass-half"></i>Waiting for peer';
      toast('Your completion is saved. Credits transfer after the other participant confirms too.', 'info');
      return;
    }
    stopMedia(true);
    toast(isLearner ? `Session complete: ${sess.cost} credits sent to ${M.name}` : `Session complete: you earned ${sess.cost} credits`, 'coin');
    location.hash = '#/recap/' + sid;
  });

  // ---------- teardown ----------
  return () => {
    // Stop UI timers/listeners immediately, then wait briefly for persistence acknowledgements
    // before leaving the room. A socket disconnect still falls back to the saved last snapshot.
    doc.code = getCode(); doc.strokes = strokes;
    disposed = true; clearTimeout(saveT); clearTimeout(boardSaveT); clearTimeout(previewT); clearInterval(hb); clearInterval(tt);
    stopMedia(true);
    unsub(); removeEventListener('resize', onResize);
    socket.off('connect', onReconnect);
    socket.off('presence:joined', onPresence); socket.off('presence:ping', onPresence); socket.off('room:event', onRoomEvent);
    socket.off('editor:update', onEditorUpdate); socket.off('editor:language', onLanguage); socket.off('session:notes', onNotes);
    socket.off('chat:message', onChat); socket.off('whiteboard:update', onBoard); socket.off('whiteboard:preview', onBoard);
    socket.off('whiteboard:pointer', onRemotePointer); socket.off('editor:cursor', onRemoteCursor);
    socket.off('rtc:signal', handleRtcSignal); socket.off('rtc:peer-ready', onRtcPeerReady);
    const emitAck = (event, payload) => new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 2200);
      try { socket.emit(event, payload, result => { clearTimeout(timer); resolve(result || null); }); }
      catch { clearTimeout(timer); resolve(null); }
    });
    void Promise.all([
      emitAck('editor:update', { sessionId: roomId, code: String(doc.code || '').slice(0, 100000), language: uiToBackendLanguage(doc.lang) }),
      emitAck('session:notes', { sessionId: roomId, notes: String(doc.notes || '').slice(0, 12000), summary: String(doc.summary || '').slice(0, 3000) }),
      emitAck('whiteboard:update', { sessionId: roomId, whiteboard: boardSnapshot() })
    ]).finally(() => socket.emit('room:leave', { sessionId: roomId }));
  };
}
