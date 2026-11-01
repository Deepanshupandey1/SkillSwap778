import mongoose from 'mongoose';
const bookingSchema = new mongoose.Schema({
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null },
  topic: { type: String, required: true, trim: true, maxlength: 100 },
  title: { type: String, trim: true, maxlength: 180, default: '' },
  details: { type: String, trim: true, maxlength: 12000, default: '' },
  language: { type: String, trim: true, maxlength: 60, default: 'JavaScript' },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  creditAmount: { type: Number, required: true, min: 1 },
  scheduledAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled', 'in_progress', 'completed', 'no_show'], default: 'pending' },
  reserved: { type: Boolean, default: false },
  creditsSettled: { type: Boolean, default: false },
  completionConfirmations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  cancellationReason: { type: String, default: '' },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
bookingSchema.index({ learner: 1, createdAt: -1 });
bookingSchema.index({ mentor: 1, createdAt: -1 });
export default mongoose.model('Booking', bookingSchema);
