// MERN-backed store adapter for the supplied SkillSwap UI.
// User/session/ledger state is read from Express + MongoDB; sessionStorage holds the auth token
// and localStorage is only used to clear old UI preferences on sign-out. Authoritative credit actions are always performed server-side.
import { LEVELS } from './data.js';

let state = { users: [], sessions: [], ledger: [], notifs: [], me: null, seq: 1 };
const subs = new Set();
let socketInstance = null;
let socketToken = null;
let refreshPromise = null;
const API = () => String(window.PEERLEARN_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const SOCKET_URL = () => String(window.PEERLEARN_SOCKET_URL || API().replace(/\/api$/, ''));
const token = () => sessionStorage.getItem('peerlearn_token') || '';
const emit = src => subs.forEach(fn => { try { fn(src); } catch (error) { console.error(error); } });

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API()}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {};
  try { data = await response.json(); } catch { /* non-JSON error response */ }
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data;
}

function connectSocket() {
  const authToken = token();
  if (!authToken || typeof window.io !== 'function') return null;
  if (socketInstance && socketToken === authToken) return socketInstance;
  if (socketInstance) { socketInstance.removeAllListeners(); socketInstance.disconnect(); }
  socketToken = authToken;
  socketInstance = window.io(SOCKET_URL(), { auth: { token: authToken }, reconnection: true, reconnectionAttempts: 8, timeout: 10000 });
  socketInstance.on('connect_error', error => console.warn('PeerLearn realtime connection:', error.message));
  socketInstance.on('booking:changed', () => refresh({ emitAs: 'remote' }).catch(console.warn));
  socketInstance.on('session:completion-confirmed', () => refresh({ emitAs: 'remote' }).catch(console.warn));
  socketInstance.on('session:completed', () => refresh({ emitAs: 'remote' }).catch(console.warn));
  return socketInstance;
}
export const getSocket = () => connectSocket();

export async function recommendPeers(preferences) {
  try { return await request('/ai/recommendations', { method: 'POST', body: preferences }); }
  catch (error) { throw new Error(error?.message || 'AI recommendations could not be loaded.'); }
}

export async function getRtcConfig() {
  try { return await request('/rtc/config'); }
  catch (error) { console.warn('Using public STUN fallback:', error?.message || 'RTC config unavailable'); return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }; }
}

export async function init() {
  // Use persisted authentication if valid; new visitors see the sign-in/create-account screen.
  if (token()) {
    try { await request('/auth/me'); }
    catch { sessionStorage.removeItem('peerlearn_token'); sessionStorage.removeItem('mm_user'); }
  }
  if (!token()) return { authenticated: false };
  await refresh({ emitAs: null });
  // Separate browser tabs may use separate seeded demo accounts; real accounts remain their own identity.
  const selectedId = sessionStorage.getItem('mm_user');
  if (selectedId && selectedId !== state.me && state.users.some(user => user.id === selectedId && user.loginEmail)) await setMe(selectedId);
  else sessionStorage.setItem('mm_user', state.me);
  connectSocket();
  return { authenticated: true };
}

export async function loginAccount(credentials) {
  const response = await request('/auth/login', { method: 'POST', auth: false, body: credentials });
  sessionStorage.setItem('peerlearn_token', response.token);
  sessionStorage.setItem('mm_user', String(response.user._id));
  socketInstance?.disconnect(); socketInstance = null; socketToken = null;
  await refresh({ emitAs: null }); connectSocket();
  return response.user;
}

export async function registerAccount(profile) {
  const response = await request('/auth/register', { method: 'POST', auth: false, body: profile });
  sessionStorage.setItem('peerlearn_token', response.token);
  sessionStorage.setItem('mm_user', String(response.user._id));
  socketInstance?.disconnect(); socketInstance = null; socketToken = null;
  await refresh({ emitAs: null }); connectSocket();
  return response.user;
}

export async function refresh({ emitAs = 'remote' } = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = request('/ui/bootstrap').then(data => {
    const oldState = state;
    state = {
      users: Array.isArray(data.users) ? data.users : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
      ledger: Array.isArray(data.ledger) ? data.ledger : [],
      notifs: Array.isArray(data.notifs) ? data.notifs : [],
      me: String(data.me || ''), seq: 1
    };
    if (emitAs) emit(emitAs);
    return oldState;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

export async function setMe(userId) {
  const target = state.users.find(user => user.id === String(userId));
  if (!target) throw new Error('This peer could not be found. Refresh and try again.');
  if (target.id === state.me) { sessionStorage.setItem('mm_user', target.id); emit('user'); return target; }
  if (!target.loginEmail) throw new Error('Only seeded demo accounts can be switched from this demo-user menu. Use normal login for other accounts.');
  const response = await request('/auth/login', { method: 'POST', auth: false, body: { emailOrUsername: target.loginEmail, password: 'PeerLearn123!' } });
  sessionStorage.setItem('peerlearn_token', response.token);
  sessionStorage.setItem('mm_user', String(response.user._id));
  socketInstance?.disconnect(); socketInstance = null; socketToken = null;
  await refresh({ emitAs: null }); connectSocket(); emit('user');
  return user(state.me);
}

export function resetDemo() {
  // Sign out only this browser tab. Database records and sample users are never cleared.
  for (const key of Object.keys(localStorage)) if (key.startsWith('mm_')) localStorage.removeItem(key);
  sessionStorage.removeItem('peerlearn_token'); sessionStorage.removeItem('mm_user');
  socketInstance?.disconnect(); location.hash = '#/'; location.reload();
}

// ---------- selectors over the database-backed snapshot ----------
export const me = () => state.me;
export const users = () => state.users;
export const user = id => state.users.find(u => u.id === String(id));
export const sessions = () => state.sessions;
export const session = id => state.sessions.find(s => s.id === String(id));
export const sessionsOf = uid => state.sessions.filter(s => s.learnerId === String(uid) || s.mentorId === String(uid)).sort((a, b) => b.createdAt - a.createdAt);
export const ledgerOf = uid => state.ledger.filter(l => l.uid === String(uid));
export const balance = uid => Number(user(uid)?.balance || 0);
export const earned = uid => Number(user(uid)?.earned || 0);
export const spent = uid => Number(user(uid)?.spent || 0);
export const reserved = uid => Number(user(uid)?.reserved || 0);
export const available = uid => Number(user(uid)?.available ?? (balance(uid) - reserved(uid)));

function levelOfEarned(earnedValue) {
  let current = 1;
  LEVELS.forEach(level => { if (earnedValue >= level.min) current = level.n; });
  return current;
}
export const level = uid => levelOfEarned(earned(uid));
export function levelInfo(uid) {
  const e = earned(uid), n = levelOfEarned(e), cur = LEVELS[n - 1], next = LEVELS[n] || null;
  const pct = next ? Math.max(0, Math.min(100, Math.round(((e - cur.min) / (next.min - cur.min)) * 100))) : 100;
  return { ...cur, earned: e, next, pct, toNext: next ? Math.max(0, next.min - e) : 0 };
}
export const rate = _mentorId => 25;
export const price = (_mentorId, duration) => ({ 15: 25, 30: 50, 45: 100 }[Number(duration)] || 50);
export const notifsOf = uid => state.notifs.filter(n => n.uid === String(uid)).sort((a, b) => b.ts - a.ts);

export function stats(uid) {
  const u = user(uid);
  if (!u) return { helped: 0, learned: 0, ratingCount: 0, rating: 0, fiveStars: 0 };
  return { helped: Number(u.helped || 0), learned: Number(u.learned || 0), ratingCount: Number(u.ratingCount || 0), rating: Number(u.ratingAvg || 0), fiveStars: Math.round(Number(u.ratingCount || 0) * 0.7) };
}

export const BADGES = [
  { id: 'first', name: 'First Steps', desc: 'Help your first learner', icon: 'fa-shoe-prints', color: 'from-emerald-400 to-teal-500', goal: s => [s.helped, 1] },
  { id: 'five', name: 'Getting Warm', desc: 'Complete 5 sessions as a mentor', icon: 'fa-fire', color: 'from-orange-400 to-rose-500', goal: s => [s.helped, 5] },
  { id: 'ten', name: 'First 10 Sessions', desc: 'Complete 10 sessions as a mentor', icon: 'fa-medal', color: 'from-sky-400 to-indigo-500', goal: s => [s.helped, 10] },
  { id: 'fifty', name: 'Half Century', desc: 'Complete 50 sessions as a mentor', icon: 'fa-trophy', color: 'from-amber-400 to-yellow-500', goal: s => [s.helped, 50] },
  { id: 'loved', name: 'Crowd Favourite', desc: 'Keep a 4.7+ rating over 10+ reviews', icon: 'fa-heart', color: 'from-pink-400 to-rose-500', goal: s => [s.ratingCount >= 10 && s.rating >= 4.7 ? 1 : Math.min(s.ratingCount / 10, 0.99), 1] },
  { id: 'curious', name: 'Curious Mind', desc: 'Learn from 3 different sessions', icon: 'fa-lightbulb', color: 'from-violet-400 to-fuchsia-500', goal: s => [s.learned, 3] },
  { id: 'collector', name: 'Credit Collector', desc: 'Earn 250 credits in total', icon: 'fa-coins', color: 'from-yellow-400 to-amber-500', goal: (s, uid) => [earned(uid), 250] },
];
export function badgesOf(uid) {
  const s = stats(uid), u = user(uid);
  return BADGES.map(b => {
    const [value, goal] = b.goal(s, uid);
    const serverBadgeNames = (u?.badges || []).map(name => name.toLowerCase());
    const mappedBadge = b.id === 'first' ? serverBadgeNames.some(x => /first step|first steps/.test(x)) : b.id === 'ten' ? serverBadgeNames.some(x => /first 10 sessions/.test(x)) : false;
    const reached = value >= goal || mappedBadge;
    return { ...b, value: Math.min(value, goal), target: goal, unlocked: reached };
  });
}
export function reviewsOf(uid) { return (user(uid)?.reviews || []).slice().sort((a, b) => b.ts - a.ts); }

const rank = level => ({ Beginner: 0, Intermediate: 1, Advanced: 2 }[level] ?? 0);
export function canBook(learnerId, mentorId) {
  if (String(learnerId) === String(mentorId)) return { ok: false, reason: 'This is you' };
  const learner = user(learnerId), mentor = user(mentorId);
  if (!learner || !mentor) return { ok: false, reason: 'Profile not found' };
  // PeerLearn is peer-to-peer: any two different users may work on any topic.
  // The receiver explicitly accepts the booking before the room and credit reservation open.
  return { ok: true };
}

function upcomingIso(slot) {
  if (!slot || slot === 'As soon as possible') return undefined;
  const match = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{2}):(\d{2})$/.exec(slot);
  if (!match) return undefined;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const target = days.indexOf(match[1]), date = new Date();
  let diff = (target - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff); date.setHours(Number(match[2]), Number(match[3]), 0, 0);
  if (date.getTime() <= Date.now() + 60000) date.setDate(date.getDate() + 7);
  return date.toISOString();
}
const difficultyFromDuration = duration => ({ 15: 'Easy', 30: 'Medium', 45: 'Hard' }[Number(duration)] || 'Medium');
const actionResult = error => ({ ok: false, error: error?.message || 'The request failed. Please try again.' });

export async function requestSession(params) {
  try {
    if (String(params.learnerId) !== String(state.me)) throw new Error('Sign in as the learner who is making this request.');
    const eligibility = canBook(params.learnerId, params.mentorId);
    if (!eligibility.ok) throw new Error(eligibility.reason);
    const cost = price(params.mentorId, params.duration);
    if (available(params.learnerId) < cost) throw new Error(`Not enough credits: this session costs ${cost}, you have ${available(params.learnerId)} available.`);
    await request('/bookings', { method: 'POST', body: {
      mentorId: params.mentorId, topic: params.topic || params.title, title: params.title,
      details: params.problem || '', language: params.lang || 'JavaScript', questionId: params.questionId || undefined,
      difficulty: difficultyFromDuration(params.duration), scheduledAt: upcomingIso(params.slot)
    } });
    await refresh({ emitAs: 'local' });
    return { ok: true, session: state.sessions.find(s => s.learnerId === state.me && s.title === params.title) || null };
  } catch (error) { return actionResult(error); }
}

export async function acceptSession(id) {
  try { await request(`/bookings/${encodeURIComponent(id)}/accept`, { method: 'PATCH', body: {} }); await refresh({ emitAs: 'local' }); return { ok: true, session: session(id) }; }
  catch (error) { return actionResult(error); }
}
export async function declineSession(id) {
  try { await request(`/bookings/${encodeURIComponent(id)}/reject`, { method: 'PATCH', body: {} }); await refresh({ emitAs: 'local' }); return { ok: true }; }
  catch (error) { return actionResult(error); }
}
export async function cancelSession(id, _byId) {
  try { await request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'PATCH', body: { reason: 'Cancelled by participant' } }); await refresh({ emitAs: 'local' }); return { ok: true }; }
  catch (error) { return actionResult(error); }
}
export async function enterRoom(id) {
  try {
    const result = await request(`/bookings/${encodeURIComponent(id)}/start`, { method: 'POST', body: {} });
    await refresh({ emitAs: 'local' });
    return session(id) || { ...result.session, id: String(id), roomId: String(result.session?._id || '') };
  } catch (error) { throw error; }
}

const editorLanguage = value => ({ JavaScript: 'javascript', TypeScript: 'typescript', Python: 'python', SQL: 'sql', 'C++': 'cpp', Java: 'java', 'HTML/CSS': 'html', GLSL: 'plaintext', Rust: 'plaintext', Go: 'plaintext', Dart: 'plaintext', Swift: 'plaintext', Kotlin: 'plaintext' }[value] || 'plaintext');
export async function completeSession(id, _byId, snapshot = {}) {
  try {
    const current = session(id);
    if (!current?.roomId) throw new Error('The live room record is not available. Refresh and rejoin.');
    const image = typeof snapshot.board === 'string' && snapshot.board.length <= 100000 ? snapshot.board : null;
    const whiteboard = { strokes: Array.isArray(snapshot.strokes) ? snapshot.strokes.slice(-2000) : [], finalImage: image };
    while (JSON.stringify(whiteboard).length > 200000 && whiteboard.strokes.length) whiteboard.strokes.shift();
    if (JSON.stringify(whiteboard).length > 200000) whiteboard.finalImage = null;
    await request(`/sessions/${encodeURIComponent(current.roomId)}/artifacts`, { method: 'PATCH', body: { code: String(snapshot.code || ''), language: editorLanguage(snapshot.lang || current.lang), whiteboard } });
    await request(`/sessions/${encodeURIComponent(current.roomId)}/notes`, { method: 'PATCH', body: { notes: String(snapshot.notes || ''), summary: String(snapshot.summary || '') } });
    const result = await request(`/bookings/${encodeURIComponent(id)}/complete`, { method: 'POST', body: {} });
    await refresh({ emitAs: 'local' });
    return { ok: true, waiting: !result.settlement?.settled, settlement: result.settlement, session: session(id) };
  } catch (error) { return actionResult(error); }
}
export function bonusFor(stars) { return Number(stars) >= 4 ? 5 : 0; }
export async function rateSession(id, stars, comment) {
  try {
    const result = await request(`/bookings/${encodeURIComponent(id)}/rating`, { method: 'POST', body: { score: Number(stars), feedback: String(comment || '').slice(0, 1000) } });
    await refresh({ emitAs: 'local' }); return { ok: true, bonus: result.bonus?.amount || 0 };
  } catch (error) { return actionResult(error); }
}
export function markRead(_uid) { /* Notifications are added to the backend in a future iteration; no fake local records. */ }
export async function updateUser(userId, patch) {
  try {
    if (String(userId) !== String(state.me)) throw new Error('You can edit only your own profile.');
    await request('/users/me', { method: 'PATCH', body: patch }); await refresh({ emitAs: 'local' }); return { ok: true };
  } catch (error) { return actionResult(error); }
}


// Public community API. Reading is allowed without an account; mutations are protected by JWT on the server.
export async function listQuestions(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, String(value));
  return request(`/questions${params.size ? `?${params.toString()}` : ''}`);
}
export async function getQuestion(questionId) { return request(`/questions/${encodeURIComponent(questionId)}`); }
export async function createQuestion(payload) { return request('/questions', { method: 'POST', body: payload }); }
export async function addAnswer(questionId, body) { return request(`/questions/${encodeURIComponent(questionId)}/answers`, { method: 'POST', body: { body } }); }
export async function likeQuestion(questionId) { return request(`/questions/${encodeURIComponent(questionId)}/like`, { method: 'POST', body: {} }); }
export async function markAnswerHelpful(questionId, answerId) { return request(`/questions/${encodeURIComponent(questionId)}/answers/${encodeURIComponent(answerId)}/helpful`, { method: 'POST', body: {} }); }
export async function acceptQuestionAnswer(questionId, answerId) { return request(`/questions/${encodeURIComponent(questionId)}/answers/${encodeURIComponent(answerId)}/accept`, { method: 'PATCH', body: {} }); }
export async function resolveQuestion(questionId) { return request(`/questions/${encodeURIComponent(questionId)}/resolve`, { method: 'PATCH', body: {} }); }
