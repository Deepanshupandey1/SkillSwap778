import { Router } from 'express';
import User from '../models/User.js';
import Follow from '../models/Follow.js';
import Question from '../models/Question.js';
import Booking from '../models/Booking.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Rating from '../models/Rating.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { topic = '', language = '', level = '', availability = '', minRating = '' } = req.query;
    const q = String(req.query.q || '').trim().slice(0, 80);
    const filter = {};
    if (q) {
      const safeQuery = escapeRegex(q);
      filter.$or = [
        { name: { $regex: safeQuery, $options: 'i' } }, { username: { $regex: safeQuery, $options: 'i' } },
        { skills: { $elemMatch: { $regex: safeQuery, $options: 'i' } } }, { bio: { $regex: safeQuery, $options: 'i' } }
      ];
    }
    if (topic) filter.skills = { $in: [new RegExp(escapeRegex(topic), 'i')] };
    if (language) filter.languages = { $in: [new RegExp(escapeRegex(language), 'i')] };
    if (level && ['Beginner', 'Intermediate', 'Advanced'].includes(level)) filter.experienceLevel = level;
    if (availability) filter.availability = { $in: [new RegExp(escapeRegex(availability), 'i')] };
    if (minRating) filter.averageRating = { $gte: Math.min(5, Math.max(0, Number(minRating) || 0)) };
    if (req.user) filter._id = { $ne: req.user._id };
    const users = await User.find(filter).select('name username bio avatarUrl skills languages experienceLevel availability credits.lifetimeEarned completedSessions sessionsHelped averageRating ratingCount badges').sort({ averageRating: -1, 'credits.lifetimeEarned': -1 }).limit(60).lean();
    let followed = new Set();
    if (req.user && users.length) {
      const follows = await Follow.find({ follower: req.user._id, following: { $in: users.map(u => u._id) } }).select('following').lean();
      followed = new Set(follows.map(f => String(f.following)));
    }
    res.json({ users: users.map(u => ({ ...u, isFollowing: followed.has(String(u._id)) })) });
  } catch (error) { next(error); }
});

router.get('/leaderboard', async (req, res, next) => {
  try {
    const users = await User.find().select('name username avatarUrl skills experienceLevel credits.lifetimeEarned completedSessions sessionsHelped averageRating ratingCount badges').sort({ sessionsHelped: -1, averageRating: -1, 'credits.lifetimeEarned': -1 }).limit(20).lean();
    res.json({ users });
  } catch (error) { next(error); }
});

router.get('/:username/activity', async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('_id');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const since = new Date(); since.setDate(since.getDate() - 119); since.setHours(0, 0, 0, 0);
    const [questions, sessions, answers] = await Promise.all([
      Question.find({ author: user._id, status: 'resolved', resolvedAt: { $gte: since } }).select('resolvedAt').lean(),
      Booking.find({ $or: [{ learner: user._id }, { mentor: user._id }], status: 'completed', completedAt: { $gte: since } }).select('completedAt').lean(),
      Question.find({ 'answers.author': user._id, 'answers.createdAt': { $gte: since } }).select('answers.author answers.createdAt').lean()
    ]);
    const counts = {};
    const inc = (date) => { if (!date) return; const key = new Date(date).toISOString().slice(0, 10); counts[key] = (counts[key] || 0) + 1; };
    questions.forEach(q => inc(q.resolvedAt)); sessions.forEach(s => inc(s.completedAt));
    answers.forEach(q => q.answers.filter(a => String(a.author) === String(user._id) && a.createdAt >= since).forEach(a => inc(a.createdAt)));
    res.json({ activity: counts });
  } catch (error) { next(error); }
});

router.get('/:username', optionalAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() }).select('-email');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    const publicUser = user.toObject();
    if (!req.user || String(req.user._id) !== String(user._id)) {
      // Keep lifetime earnings public for leaderboard/badges; never disclose spendable or reserved credit balances.
      publicUser.credits = { lifetimeEarned: Number(user.credits?.lifetimeEarned || 0) };
    }
    const [followers, following, recentQuestions, ratings, isFollowing] = await Promise.all([
      Follow.countDocuments({ following: user._id }), Follow.countDocuments({ follower: user._id }),
      Question.find({ author: user._id }).select('title topic difficulty status createdAt').sort({ createdAt: -1 }).limit(8).lean(),
      Rating.find({ mentor: user._id }).populate('learner', 'name username avatarUrl').sort({ createdAt: -1 }).limit(6).lean(),
      req.user ? Follow.exists({ follower: req.user._id, following: user._id }) : null
    ]);
    res.json({ user: { ...publicUser, followers, following, isFollowing: Boolean(isFollowing) }, recentQuestions, ratings });
  } catch (error) { next(error); }
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const allowed = ['name', 'bio', 'avatarUrl', 'skills', 'languages', 'spokenLanguages', 'topics', 'availableSlots', 'experienceLevel', 'availability'];
    const updates = {};
    for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
    if (updates.name && (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.length > 80)) return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
    if (updates.bio && updates.bio.length > 300) return res.status(400).json({ message: 'Bio must be 300 characters or fewer.' });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true }).select('-passwordHash');
    res.json({ user });
  } catch (error) { next(error); }
});

router.post('/:id/follow', requireAuth, async (req, res, next) => {
  try {
    if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot follow yourself.' });
    if (!(await User.exists({ _id: req.params.id }))) return res.status(404).json({ message: 'Peer not found.' });
    await Follow.updateOne({ follower: req.user._id, following: req.params.id }, { $setOnInsert: { follower: req.user._id, following: req.params.id } }, { upsert: true });
    res.json({ following: true });
  } catch (error) { next(error); }
});
router.delete('/:id/follow', requireAuth, async (req, res, next) => {
  try { await Follow.deleteOne({ follower: req.user._id, following: req.params.id }); res.json({ following: false }); } catch (error) { next(error); }
});

export default router;
