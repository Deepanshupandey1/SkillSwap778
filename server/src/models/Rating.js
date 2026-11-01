import mongoose from 'mongoose';
const ratingSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, default: '', maxlength: 1000 },
  bonusGranted: { type: Boolean, default: false }
}, { timestamps: true });
export default mongoose.model('Rating', ratingSchema);
