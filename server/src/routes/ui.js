import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Rating from '../models/Rating.js';
import Follow from '../models/Follow.js';

const router = Router();
router.use(requireAuth);

const id = value => value ? String(value._id || value) : null;
const number = value => Number(value || 0);
const toTime = value => value ? new Date(value).getTime() : null;
const levelToYears = level => ({ Beginner: 1, Intermediate: 3, Advanced: 6 }[level] || 1);
const hueFor = value => { let h = 0; for (const c of String(value || 'peer')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

function topicsFor(user) {
  const all = [...(user.skills || []), ...(user.topics || [])];
  const tests = [
    ['Graphics & WebGL', /webgl|glsl|shader|three\.js|graphics/i],
    ['Frontend', /react|javascript|typescript|html|css|frontend|next\.js|vue|angular/i],
    ['Backend', /node|express|backend|api|rest|system design|go |rust|django|spring/i],
    ['Databases', /sql|database|mongo|postgres|mysql|dbms|index|query/i],
    ['Algorithms', /dsa|algorithm|graph|binary search|recursion|dynamic programming|complexity/i],
    ['Data & ML', /python|machine learning|data analysis|pytorch|pandas|ai|ml /i],
    ['Security', /security|jwt|owasp|auth|cryptography|threat/i],
    ['DevOps', /devops|docker|kubernetes|ci\/cd|linux|cloud/i],
    ['Systems', /operating systems|computer networks|networking|concurrency|systems/i],
    ['Design & UX', /design|figma|accessibility|ux|ui|animation/i],
    ['Mobile', /mobile|flutter|swift|kotlin|android|ios/i]
  ];
  const found = new Set();
  for (const value of all) {
    const text = String(value);
    if (tests.some(([topic]) => topic.toLowerCase() === text.toLowerCase())) found.add(text);
    for (const [topic, pattern] of tests) if (pattern.test(text)) found.add(topic);
  }
  return found.size ? [...found] : ['Frontend'];
}

function slotsFor(user) {
  if (Array.isArray(user.availableSlots) && user.availableSlots.length) return user.availableSlots;
  const result = [];
  const availability = user.availability || [];
  if (availability.some(x => /morning/i.test(x))) result.push('Mon 09:00', 'Thu 09:00');
  if (availability.some(x => /afternoon/i.test(x))) result.push('Tue 15:00', 'Sat 15:00');
  if (availability.some(x => /evening/i.test(x))) result.push('Mon 18:00', 'Wed 18:00', 'Fri 18:00');
  if (availability.some(x => /weekend/i.test(x))) result.push('Sat 12:00', 'Sun 15:00');
  return [...new Set(result)].slice(0, 8);
}

function mapUser(user, followingIds, reviewsByMentor, meId) {
  const isSelf = String(user._id) === String(meId);
  const experienceLevel = user.experienceLevel || 'Beginner';
  const email = String(user.email || '');
  const isDemoAccount = email.endsWith('@peerlearn.demo') && String(process.env.ENABLE_DEMO_AUTH).toLowerCase() !== 'false';
  return {
    id: id(user), username: user.username, name: user.name,
    // The legacy UI calls the role line "title". Keep it backed by the profile's real bio.
    title: user.bio || `${experienceLevel} peer mentor`, bio: user.bio || '',
    exp: levelToYears(experienceLevel), experienceLevel,
    topics: topicsFor(user), skills: user.skills || [], langs: user.languages || [],
    speaks: user.spokenLanguages?.length ? user.spokenLanguages : ['English'],
    slots: slotsFor(user), online: user.lastActiveAt ? Date.now() - new Date(user.lastActiveAt).getTime() < 5 * 60 * 1000 : false,
    earned: Math.max(0, number(user.credits?.lifetimeEarned) - (user.welcomeCreditsGranted === false ? 0 : 500)), helpedBase: number(user.sessionsHelped),
    helped: number(user.sessionsHelped), learned: Math.max(0, number(user.completedSessions) - number(user.sessionsHelped)),
    ratingSum: number(user.averageRating) * number(user.ratingCount), ratingCount: number(user.ratingCount),
    ratingAvg: number(user.averageRating),
    // Credit balances and spending are private; public lifetime earnings are used for badges/leaderboard.
    balance: isSelf ? number(user.credits?.available) + number(user.credits?.reserved) : 0,
    available: isSelf ? number(user.credits?.available) : 0,
    reserved: isSelf ? number(user.credits?.reserved) : 0,
    spent: isSelf ? number(user.credits?.lifetimeSpent) : 0,
    hue: hueFor(user.username), badges: user.badges || [],
    reviews: reviewsByMentor.get(String(user._id)) || [],
    isFollowing: followingIds.has(String(user._id)),
    ...(isDemoAccount ? { loginEmail: email } : {})
  };
}

function mapLedger(entry) {
  const rawType = entry.type;
  const type = ({
    welcome_bonus: 'grant', reservation: 'reserve', reservation_release: 'release',
    session_spent: 'spend', session_earned: 'earn', rating_bonus: 'bonus', refund: 'grant'
  })[rawType] || 'grant';
  const delta = rawType === 'reservation' || rawType === 'reservation_release' ? 0 : number(entry.amount);
  return {
    id: id(entry), uid: id(entry.user), delta, type, reason: entry.description,
    ts: toTime(entry.createdAt), sessionId: id(entry.booking), withId: null, bal: number(entry.balanceAfter)
  };
}

function mapBooking(booking, rating) {
  const learnerId = id(booking.learner), mentorId = id(booking.mentor);
  const session = booking.session || null;
  const status = ({ pending: 'requested', accepted: 'accepted', in_progress: 'live', completed: 'completed', rejected: 'declined', cancelled: 'cancelled', no_show: 'cancelled' })[booking.status] || 'requested';
  const duration = ({ Easy: 15, Medium: 30, Hard: 45 })[booking.difficulty] || 30;
  const slotDate = booking.scheduledAt ? new Date(booking.scheduledAt) : null;
  const dow = slotDate ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][slotDate.getDay()] : null;
  const slot = slotDate ? `${dow} ${String(slotDate.getHours()).padStart(2, '0')}:${String(slotDate.getMinutes()).padStart(2, '0')}` : 'As soon as possible';
  const sessionRating = rating ? { stars: rating.score, comment: rating.feedback || '', ts: toTime(rating.createdAt) } : null;
  const board = session?.whiteboard?.finalImage || null;
  return {
    id: id(booking), bookingId: id(booking), roomId: id(session), learnerId, mentorId,
    title: booking.title || booking.question?.title || booking.topic,
    problem: booking.details || booking.question?.description || '',
    topic: booking.topic, lang: booking.language || booking.question?.language || 'JavaScript',
    slot, duration, cost: number(booking.creditAmount), status,
    createdAt: toTime(booking.createdAt), acceptedAt: ['accepted', 'in_progress', 'completed'].includes(booking.status) ? toTime(booking.updatedAt || booking.createdAt) : null,
    startedAt: toTime(session?.startedAt), endedAt: toTime(booking.completedAt || session?.completedAt),
    endedBy: null, rating: sessionRating,
    recap: session ? { notes: session.notes || '', summary: session.summary || '', code: session.code || '', lang: session.language || 'javascript', board } : null,
    completionConfirmations: (booking.completionConfirmations || []).map(String)
  };
}

router.get('/bootstrap', async (req, res, next) => {
  try {
    const meId = String(req.user._id);
    const userFields = 'name username email welcomeCreditsGranted bio avatarUrl skills topics languages spokenLanguages experienceLevel availability availableSlots credits completedSessions sessionsHelped averageRating ratingCount badges lastActiveAt';
    const [otherUsers, currentUser, bookings, transactions, ratings, follows] = await Promise.all([
      User.find({ _id: { $ne: req.user._id } }).select(userFields).sort({ sessionsHelped: -1, averageRating: -1, name: 1 }).limit(99).lean(),
      User.findById(req.user._id).select(userFields).lean(),
      Booking.find({ $or: [{ learner: req.user._id }, { mentor: req.user._id }] })
        .populate('learner', 'name username').populate('mentor', 'name username').populate('question', 'title description topic language').populate('session')
        .sort({ createdAt: -1 }).limit(200).lean(),
      CreditTransaction.find({ user: req.user._id }).sort({ createdAt: 1 }).limit(500).lean(),
      Rating.find().populate('learner', 'name username').sort({ createdAt: -1 }).limit(300).lean(),
      Follow.find({ follower: req.user._id }).select('following').lean()
    ]);
    const followingIds = new Set(follows.map(f => String(f.following)));
    const reviewsByMentor = new Map();
    for (const rating of ratings) {
      const mid = String(rating.mentor);
      if (!reviewsByMentor.has(mid)) reviewsByMentor.set(mid, []);
      const rows = reviewsByMentor.get(mid);
      if (rows.length < 10) rows.push({ fromId: id(rating.learner), stars: rating.score, text: rating.feedback || '', ts: toTime(rating.createdAt), sessionTitle: '' });
    }
    const users = [currentUser, ...otherUsers].filter(Boolean).map(u => mapUser(u, followingIds, reviewsByMentor, meId));
    const ratingsByBooking = new Map(ratings.map(r => [String(r.booking), r]));
    const sessions = bookings.map(b => mapBooking(b, ratingsByBooking.get(String(b._id))));
    const ledger = transactions.map(mapLedger);
    res.json({ me: meId, users, sessions, ledger, notifs: [], seq: 1 });
  } catch (error) { next(error); }
});

export default router;
