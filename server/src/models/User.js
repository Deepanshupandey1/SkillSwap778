import mongoose from 'mongoose';

const creditSchema = new mongoose.Schema({
  available: { type: Number, default: 500, min: 0 },
  reserved: { type: Number, default: 0, min: 0 },
  lifetimeEarned: { type: Number, default: 0, min: 0 },
  lifetimeSpent: { type: Number, default: 0, min: 0 }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 3, maxlength: 24, match: /^[a-z0-9_.]+$/ },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  bio: { type: String, default: 'Learning in public. Happy to help.' , maxlength: 300 },
  avatarUrl: { type: String, default: '' },
  skills: { type: [String], default: [] },
  languages: { type: [String], default: ['JavaScript'] },
  spokenLanguages: { type: [String], default: ['English'] },
  topics: { type: [String], default: [] },
  availableSlots: { type: [String], default: [] },
  experienceLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
  availability: { type: [String], default: ['Evenings'] },
  credits: { type: creditSchema, default: () => ({ available: 500, reserved: 0, lifetimeEarned: 0, lifetimeSpent: 0 }) },
  welcomeCreditsGranted: { type: Boolean, default: true },
  completedSessions: { type: Number, default: 0 },
  sessionsHelped: { type: Number, default: 0 },
  questionsAsked: { type: Number, default: 0 },
  questionsResolved: { type: Number, default: 0 },
  answersPosted: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  badges: { type: [String], default: [] },
  lastActiveAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Keep array-backed fields in separate indexes; do not compound-index topics + skills.
userSchema.index({ skills: 1, experienceLevel: 1 });
userSchema.index({ topics: 1 });
userSchema.index({ name: 'text', username: 'text', skills: 'text', bio: 'text' });
export default mongoose.model('User', userSchema);
