import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isAccepted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const questionSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, required: true, trim: true, maxlength: 12000 },
  topic: { type: String, required: true, trim: true, maxlength: 60 },
  language: { type: String, default: 'General', trim: true },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
  tags: { type: [String], default: [] },
  codeSnippet: { type: String, default: '', maxlength: 12000 },
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedAt: { type: Date, default: null },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  answers: { type: [answerSchema], default: [] },
  views: { type: Number, default: 0 }
}, { timestamps: true });

questionSchema.index({ createdAt: -1, status: 1 });
questionSchema.index({ title: 'text', description: 'text', topic: 'text', tags: 'text' });
export default mongoose.model('Question', questionSchema);
