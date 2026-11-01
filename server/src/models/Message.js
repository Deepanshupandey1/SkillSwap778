import mongoose from 'mongoose';
const messageSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, required: true },
  body: { type: String, required: true, maxlength: 3000 },
  kind: { type: String, enum: ['chat', 'system'], default: 'chat' }
}, { timestamps: true });
export default mongoose.model('Message', messageSchema);
