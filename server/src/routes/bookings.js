import { Router } from 'express';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import Question from '../models/Question.js';
import CreditTransaction from '../models/CreditTransaction.js';
import Rating from '../models/Rating.js';
import { requireAuth } from '../middleware/auth.js';
import { CREDIT_PRICES, addLedgerEntry, settleBookingCredits, issueRatingBonus } from '../services/credits.js';

const router = Router();
router.use(requireAuth);
const participantsQuery = (id) => ({ $or: [{ learner: id }, { mentor: id }] });

router.post('/', async (req, res, next) => {
  try {
    const { mentorId, questionId, topic, title, details, language, difficulty, scheduledAt } = req.body;
    if (!mentorId || !topic || !CREDIT_PRICES[difficulty]) return res.status(400).json({ message: 'Choose a peer, topic, and valid difficulty.' });
    if (typeof title === 'string' && title.trim().length > 180) return res.status(400).json({ message: 'Session title must be 180 characters or fewer.' });
    if (typeof details === 'string' && details.length > 12000) return res.status(400).json({ message: 'Session details must be 12,000 characters or fewer.' });
    if (String(mentorId) === String(req.user._id)) return res.status(400).json({ message: 'You cannot book yourself.' });
    const mentor = await User.findById(mentorId).select('_id');
    if (!mentor) return res.status(404).json({ message: 'Mentor not found.' });
    // PeerLearn allows cross-level and cross-skill collaboration. A booking continues only
    // after the recipient explicitly accepts it; self-booking remains blocked above.
    let question = null;
    if (questionId) {
      question = await Question.findById(questionId).select('_id author title topic difficulty status');
      if (!question) return res.status(404).json({ message: 'Related question not found.' });
    }
    const date = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledAt && (!date || Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60000)) return res.status(400).json({ message: 'Choose a future session time.' });
    const booking = await Booking.create({ learner: req.user._id, mentor: mentorId, question: questionId || null, topic: String(topic).trim().slice(0, 100), title: String(title || '').trim().slice(0, 180), details: String(details || '').trim().slice(0, 12000), language: String(language || 'JavaScript').slice(0, 60), difficulty, creditAmount: CREDIT_PRICES[difficulty], scheduledAt: date, status: 'pending' });
    req.app.get('io')?.to(`user:${mentorId}`).emit('booking:changed', { bookingId: String(booking._id), action: 'requested' });
    req.app.get('io')?.to(`user:${req.user._id}`).emit('booking:changed', { bookingId: String(booking._id), action: 'requested' });
    const populated = await Booking.findById(booking._id).populate('learner', 'name username avatarUrl').populate('mentor', 'name username avatarUrl').populate('question', 'title topic difficulty');
    res.status(201).json({ booking: populated });
  } catch (error) { next(error); }
});

router.get('/', async (req, res, next) => {
  try {
    const bookings = await Booking.find(participantsQuery(req.user._id))
      .populate('learner', 'name username avatarUrl').populate('mentor', 'name username avatarUrl')
      .populate('question', 'title topic difficulty status').populate('session', 'status topic difficulty')
      .sort({ createdAt: -1 }).limit(100).lean();
    const ratings = bookings.length ? await Rating.find({ learner: req.user._id, booking: { $in: bookings.map(b => b._id) } }).select('booking').lean() : [];
    const rated = new Set(ratings.map(r => String(r.booking)));
    res.json({ bookings: bookings.map(b => ({ ...b, ratedByMe: rated.has(String(b._id)) })) });
  } catch (error) { next(error); }
});

router.patch('/:id/accept', async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const booking = await Booking.findOne({ _id: req.params.id, mentor: req.user._id, status: 'pending' }).session(mongoSession);
      if (!booking) { result = { error: 'Pending booking not found, or you are not the mentor.' }; return; }
      const learner = await User.findOneAndUpdate({ _id: booking.learner, 'credits.available': { $gte: booking.creditAmount } }, {
        $inc: { 'credits.available': -booking.creditAmount, 'credits.reserved': booking.creditAmount }
      }, { new: true, session: mongoSession });
      if (!learner) { result = { error: 'The learner does not have enough available credits.' }; return; }
      booking.status = 'accepted'; booking.reserved = true;
      const room = await Session.create([{ booking: booking._id, learner: booking.learner, mentor: booking.mentor, topic: booking.topic, difficulty: booking.difficulty, status: 'scheduled' }], { session: mongoSession });
      booking.session = room[0]._id;
      await booking.save({ session: mongoSession });
      await addLedgerEntry({ userId: learner._id, type: 'reservation', amount: -booking.creditAmount, balanceAfter: learner.credits.available, description: `Reserved for ${booking.difficulty} mentorship: ${booking.topic}`, bookingId: booking._id, referenceKey: `booking:${booking._id}:reservation`, session: mongoSession });
      result = { bookingId: booking._id };
    });
    if (result?.error) return res.status(400).json({ message: result.error });
    const booking = await Booking.findById(result.bookingId).populate('learner', 'name username avatarUrl').populate('mentor', 'name username avatarUrl').populate('session', 'status topic difficulty');
    req.app.get('io')?.to(`user:${booking.learner._id}`).emit('booking:changed', { bookingId: String(booking._id), action: 'accepted' });
    req.app.get('io')?.to(`user:${booking.mentor._id}`).emit('booking:changed', { bookingId: String(booking._id), action: 'accepted' });
    res.json({ booking });
  } catch (error) { next(error); }
  finally { await mongoSession.endSession(); }
});

router.patch('/:id/reject', async (req, res, next) => {
  try {
    const booking = await Booking.findOneAndUpdate({ _id: req.params.id, mentor: req.user._id, status: 'pending' }, { $set: { status: 'rejected' } }, { new: true });
    if (!booking) return res.status(404).json({ message: 'Pending booking not found, or you are not the mentor.' });
    req.app.get('io')?.to(`user:${booking.learner}`).emit('booking:changed', { bookingId: String(booking._id), action: 'rejected' });
    req.app.get('io')?.to(`user:${booking.mentor}`).emit('booking:changed', { bookingId: String(booking._id), action: 'rejected' });
    res.json({ booking });
  } catch (error) { next(error); }
});

router.patch('/:id/cancel', async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const booking = await Booking.findOne({ _id: req.params.id, status: { $in: ['pending', 'accepted'] }, $or: [{ learner: req.user._id }, { mentor: req.user._id }] }).session(mongoSession);
      if (!booking) { result = { error: 'This booking cannot be cancelled.' }; return; }
      if (booking.reserved && !booking.creditsSettled) {
        const learner = await User.findByIdAndUpdate(booking.learner, { $inc: { 'credits.available': booking.creditAmount, 'credits.reserved': -booking.creditAmount } }, { new: true, session: mongoSession });
        if (learner) await addLedgerEntry({ userId: learner._id, type: 'reservation_release', amount: booking.creditAmount, balanceAfter: learner.credits.available, description: 'Booking cancelled; reserved credits released', bookingId: booking._id, referenceKey: `booking:${booking._id}:release`, session: mongoSession });
        booking.reserved = false; booking.creditsSettled = true;
      }
      booking.status = 'cancelled'; booking.cancellationReason = String(req.body.reason || '').slice(0, 240);
      if (booking.session) {
        await Session.deleteOne({ _id: booking.session, status: 'scheduled' }, { session: mongoSession });
        booking.session = null;
      }
      await booking.save({ session: mongoSession });
      result = { bookingId: booking._id };
    });
    if (result?.error) return res.status(400).json({ message: result.error });
    const cancelledBooking = await Booking.findById(result.bookingId);
    if (cancelledBooking) { req.app.get('io')?.to(`user:${cancelledBooking.learner}`).emit('booking:changed', { bookingId: String(cancelledBooking._id), action: 'cancelled' }); req.app.get('io')?.to(`user:${cancelledBooking.mentor}`).emit('booking:changed', { bookingId: String(cancelledBooking._id), action: 'cancelled' }); }
    res.json({ booking: cancelledBooking });
  } catch (error) { next(error); }
  finally { await mongoSession.endSession(); }
});

router.post('/:id/start', async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    let result;
    await mongoSession.withTransaction(async () => {
      const booking = await Booking.findOne({ _id: req.params.id, status: { $in: ['accepted', 'in_progress'] }, $or: [{ learner: req.user._id }, { mentor: req.user._id }] }).session(mongoSession);
      if (!booking || !booking.session) { result = { error: 'Active booking not found.' }; return; }
      if (booking.status === 'accepted') {
        booking.status = 'in_progress';
        await booking.save({ session: mongoSession });
        await Session.updateOne({ _id: booking.session, status: 'scheduled' }, { $set: { status: 'in_progress', startedAt: new Date() } }, { session: mongoSession });
      }
      result = { sessionId: booking.session };
    });
    if (result?.error) return res.status(404).json({ message: result.error });
    const session = await Session.findById(result.sessionId).populate('learner', 'name username avatarUrl').populate('mentor', 'name username avatarUrl');
    if (!session) return res.status(404).json({ message: 'Session room is no longer available.' });
    res.json({ session });
  } catch (error) { next(error); }
  finally { await mongoSession.endSession(); }
});

router.post('/:id/complete', async (req, res, next) => {
  try {
    const candidate = await Booking.findOne({ _id: req.params.id, status: 'in_progress', $or: [{ learner: req.user._id }, { mentor: req.user._id }] }).select('learner mentor session');
    if (!candidate || !candidate.session) return res.status(404).json({ message: 'In-progress booking not found.' });
    const liveSession = await Session.findById(candidate.session).select('participantsJoined status');
    if (!liveSession || liveSession.status !== 'in_progress' || ![String(candidate.learner), String(candidate.mentor)].every(userId => (liveSession.participantsJoined || []).some(joinedId => String(joinedId) === userId))) {
      return res.status(400).json({ message: 'Both learner and mentor must join the live room before confirming completion.' });
    }
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, status: 'in_progress', $or: [{ learner: req.user._id }, { mentor: req.user._id }] },
      { $addToSet: { completionConfirmations: req.user._id } }, { new: true }
    );
    if (!booking) return res.status(404).json({ message: 'In-progress booking not found.' });
    const result = booking.completionConfirmations.length >= 2 ? await settleBookingCredits(booking._id) : { settled: false, reason: 'Waiting for the other participant to confirm completion.' };
    const finalBooking = await Booking.findById(booking._id).populate('learner', 'name username avatarUrl').populate('mentor', 'name username avatarUrl');
    const isSettled = finalBooking.status === 'completed' && finalBooking.creditsSettled;
    if (isSettled) req.app.get('io')?.to(`session:${booking.session}`).emit('session:completed', { bookingId: String(booking._id), sessionId: String(booking.session) });
    else req.app.get('io')?.to(`session:${booking.session}`).emit('session:completion-confirmed', { userId: String(req.user._id), confirmations: finalBooking.completionConfirmations.length });
    res.json({ booking: finalBooking, settlement: isSettled ? { ...result, settled: true } : result });
  } catch (error) { next(error); }
});

router.post('/:id/rating', async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const score = Number(req.body.score);
    const feedback = String(req.body.feedback || '').trim().slice(0, 1000);
    if (!Number.isInteger(score) || score < 1 || score > 5) return res.status(400).json({ message: 'Rating must be from 1 to 5.' });
    let result;
    await mongoSession.withTransaction(async () => {
      const booking = await Booking.findOne({ _id: req.params.id, learner: req.user._id, status: 'completed', creditsSettled: true }).session(mongoSession);
      if (!booking) { result = { error: 'You can rate only a completed session you booked.' }; return; }
      const already = await Rating.findOne({ booking: booking._id }).session(mongoSession);
      if (already) { result = { conflict: 'You have already rated this session.' }; return; }
      const [rating] = await Rating.create([{
        booking: booking._id, learner: req.user._id, mentor: booking.mentor, score, feedback, bonusGranted: score >= 4
      }], { session: mongoSession });
      const stats = await Rating.aggregate([
        { $match: { mentor: booking.mentor } },
        { $group: { _id: '$mentor', average: { $avg: '$score' }, count: { $sum: 1 } } }
      ]).session(mongoSession);
      if (stats[0]) {
        const updates = { $set: { averageRating: Math.round(stats[0].average * 10) / 10, ratingCount: stats[0].count } };
        if (stats[0].count >= 5 && stats[0].average >= 4.5) updates.$addToSet = { badges: 'Helpful Peer' };
        await User.updateOne({ _id: booking.mentor }, updates, { session: mongoSession });
      }
      const bonus = score >= 4 ? await issueRatingBonus({ mentorId: booking.mentor, bookingId: booking._id, amount: 5, transactionSession: mongoSession }) : null;
      result = { rating, bonus, highScore: score >= 4 };
    });
    if (result?.error) return res.status(400).json({ message: result.error });
    if (result?.conflict) return res.status(409).json({ message: result.conflict });
    res.status(201).json({ rating: result.rating, bonus: result.bonus, message: result.highScore ? 'Thanks for sharing feedback. The mentor earned a 5-credit helpfulness bonus.' : 'Thanks for your feedback.' });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'You have already rated this session.' });
    next(error);
  } finally { await mongoSession.endSession(); }
});

export default router;
