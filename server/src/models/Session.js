import mongoose from 'mongoose';
const sessionSchema = new mongoose.Schema({
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  learner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  topic: { type: String, required: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed'], default: 'scheduled' },
  participantsJoined: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  code: { type: String, default: '// PeerLearn shared editor\n\n', maxlength: 100000 },
  language: { type: String, default: 'javascript' },
  whiteboard: { type: mongoose.Schema.Types.Mixed, default: { strokes: [], shapes: [], texts: [] } },
  notes: { type: String, default: '', maxlength: 12000 },
  summary: { type: String, default: '', maxlength: 3000 },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }
}, { timestamps: true });
export default mongoose.model('Session', sessionSchema);
