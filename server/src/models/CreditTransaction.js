import mongoose from 'mongoose';
const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['welcome_bonus', 'session_spent', 'session_earned', 'rating_bonus', 'reservation', 'reservation_release', 'refund'], required: true },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true, min: 0 },
  description: { type: String, required: true, maxlength: 240 },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  referenceKey: { type: String, required: true, unique: true }
}, { timestamps: true });
transactionSchema.index({ user: 1, createdAt: -1 });
export default mongoose.model('CreditTransaction', transactionSchema);
