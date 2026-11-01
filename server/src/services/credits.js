import mongoose from 'mongoose';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';

export const CREDIT_PRICES = Object.freeze({ Easy: 25, Medium: 50, Hard: 100 });

export async function addLedgerEntry({ userId, type, amount, balanceAfter, description, bookingId = null, referenceKey, session = null }) {
  // A unique referenceKey makes retries safe against duplicate ledger rows.
  try {
    const rows = await CreditTransaction.create([{ user: userId, type, amount, balanceAfter, description, booking: bookingId, referenceKey }], session ? { session } : {});
    return rows[0];
  } catch (error) {
    if (error?.code === 11000 && !session) return CreditTransaction.findOne({ referenceKey });
    throw error;
  }
}

export async function releaseReservation(booking, reason = 'Booking cancelled; reserved credits released') {
  if (!booking.reserved || booking.creditsSettled) return;
  const learner = await User.findByIdAndUpdate(booking.learner, {
    $inc: { 'credits.available': booking.creditAmount, 'credits.reserved': -booking.creditAmount }
  }, { new: true });
  if (learner) {
    await addLedgerEntry({
      userId: learner._id, type: 'reservation_release', amount: booking.creditAmount,
      balanceAfter: learner.credits.available, description: reason, bookingId: booking._id,
      referenceKey: `booking:${booking._id}:release`
    });
  }
  booking.reserved = false;
  booking.creditsSettled = true;
  await booking.save();
}

export async function settleBookingCredits(bookingId) {
  const session = await mongoose.startSession();
  let result = { settled: false, reason: 'Both participants must confirm completion.' };
  try {
    await session.withTransaction(async () => {
      const booking = await (await import('../models/Booking.js')).default.findOne({ _id: bookingId, status: 'in_progress', creditsSettled: false }).session(session);
      if (!booking || !booking.reserved) {
        result = { settled: false, reason: 'Credits are already settled or booking is not active.' };
        return;
      }
      const confirmations = new Set(booking.completionConfirmations.map(String));
      if (!confirmations.has(String(booking.learner)) || !confirmations.has(String(booking.mentor))) return;
      const now = new Date();
      booking.status = 'completed';
      booking.creditsSettled = true;
      booking.reserved = false;
      booking.completedAt = now;
      await booking.save({ session });
      const learner = await User.findByIdAndUpdate(booking.learner, {
        $inc: { 'credits.reserved': -booking.creditAmount, 'credits.lifetimeSpent': booking.creditAmount, completedSessions: 1 }
      }, { new: true, session });
      const mentor = await User.findByIdAndUpdate(booking.mentor, {
        $inc: { 'credits.available': booking.creditAmount, 'credits.lifetimeEarned': booking.creditAmount, sessionsHelped: 1, completedSessions: 1 }
      }, { new: true, session });
      if (!learner || !mentor) throw new Error('Could not find both session participants.');
      const earnedBadges = [];
      if (mentor.sessionsHelped >= 1) earnedBadges.push('First Step');
      if (mentor.sessionsHelped >= 10) earnedBadges.push('First 10 Sessions');
      if (earnedBadges.length) await User.updateOne({ _id: mentor._id }, { $addToSet: { badges: { $each: earnedBadges } } }, { session });
      const reservationEntry = await CreditTransaction.findOne({ referenceKey: `booking:${booking._id}:reservation` }).session(session);
      if (reservationEntry) {
        reservationEntry.type = 'session_spent';
        reservationEntry.description = `${booking.difficulty} mentorship completed: ${booking.topic}`;
        reservationEntry.booking = booking._id;
        reservationEntry.createdAt = now;
        await reservationEntry.save({ session });
      } else {
        await addLedgerEntry({
          userId: learner._id, type: 'session_spent', amount: -booking.creditAmount,
          balanceAfter: learner.credits.available, description: `${booking.difficulty} mentorship: ${booking.topic}`,
          bookingId: booking._id, referenceKey: `booking:${booking._id}:learner-spend`, session
        });
      }
      await addLedgerEntry({
        userId: mentor._id, type: 'session_earned', amount: booking.creditAmount,
        balanceAfter: mentor.credits.available, description: `Helped a learner: ${booking.topic}`,
        bookingId: booking._id, referenceKey: `booking:${booking._id}:mentor-earn`, session
      });
      const SessionModel = (await import('../models/Session.js')).default;
      await SessionModel.updateOne({ booking: booking._id }, { $set: { status: 'completed', endedAt: now, completedAt: now } }, { session });
      result = { settled: true, learnerBalance: learner.credits.available, mentorBalance: mentor.credits.available };
    });
    return result;
  } finally { await session.endSession(); }
}

export async function issueRatingBonus({ mentorId, bookingId, amount = 5, transactionSession = null }) {
  const ownedSession = transactionSession ? null : await mongoose.startSession();
  const session = transactionSession || ownedSession;
  let result = { granted: false, reason: 'Bonus already granted.' };
  const work = async () => {
    const key = `booking:${bookingId}:rating-bonus`;
    const already = await CreditTransaction.findOne({ referenceKey: key }).session(session);
    if (already) return;
    const mentor = await User.findByIdAndUpdate(mentorId, {
      $inc: { 'credits.available': amount, 'credits.lifetimeEarned': amount }
    }, { new: true, session });
    if (!mentor) throw new Error('Mentor account not found.');
    await addLedgerEntry({ userId: mentor._id, type: 'rating_bonus', amount, balanceAfter: mentor.credits.available, description: 'Helpful mentorship rating bonus', bookingId, referenceKey: key, session });
    result = { granted: true, amount };
  };
  try {
    if (transactionSession) await work();
    else await session.withTransaction(work);
    return result;
  } finally { if (ownedSession) await ownedSession.endSession(); }
}

export async function getMongoTransactionSupport() {
  // Informational helper for diagnostics; deployment guidance recommends Atlas or a replica set for strict multi-document ACID.
  return mongoose.connection.readyState === 1;
}
