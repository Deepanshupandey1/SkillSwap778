import { Router } from 'express';
import Session from '../models/Session.js';
import Booking from '../models/Booking.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);

async function getParticipantSession(id, userId) {
  return Session.findOne({ _id: id, $or: [{ learner: userId }, { mentor: userId }] })
    .populate('learner', 'name username avatarUrl').populate('mentor', 'name username avatarUrl');
}

router.get('/:id', async (req, res, next) => {
  try {
    const session = await getParticipantSession(req.params.id, req.user._id);
    if (!session) return res.status(404).json({ message: 'Session not found or access denied.' });
    const messages = await Message.find({ session: session._id }).sort({ createdAt: 1 }).limit(250).lean();
    const booking = await Booking.findById(session.booking).select('status creditAmount completionConfirmations creditsSettled scheduledAt');
    res.json({ session, messages, booking });
  } catch (error) { next(error); }
});

router.patch('/:id/artifacts', async (req, res, next) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, status: 'in_progress', $or: [{ learner: req.user._id }, { mentor: req.user._id }] });
    if (!session) return res.status(409).json({ message: 'Final code can be saved only by a participant in an active session.' });
    if (typeof req.body.code !== 'string' || req.body.code.length > 100000) return res.status(400).json({ message: 'Code must be a string no longer than 100,000 characters.' });
    const allowedLanguages = ['javascript', 'typescript', 'python', 'cpp', 'java', 'sql', 'html', 'css', 'json', 'plaintext'];
    const language = String(req.body.language || session.language);
    if (!allowedLanguages.includes(language)) return res.status(400).json({ message: 'Choose a supported editor language.' });
    session.code = req.body.code;
    session.language = language;
    if (req.body.whiteboard !== undefined) {
      let serialized;
      try { serialized = JSON.stringify(req.body.whiteboard); } catch { return res.status(400).json({ message: 'Whiteboard snapshot is invalid.' }); }
      if (serialized.length > 250000) return res.status(400).json({ message: 'Whiteboard snapshot is too large.' });
      session.whiteboard = req.body.whiteboard;
    }
    await session.save();
    res.json({ saved: true, language: session.language, codeLength: session.code.length });
  } catch (error) { next(error); }
});

router.patch('/:id/notes', async (req, res, next) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, $or: [{ learner: req.user._id }, { mentor: req.user._id }] });
    if (!session) return res.status(404).json({ message: 'Session not found or access denied.' });
    const notes = String(req.body.notes || '').trim();
    const summary = String(req.body.summary || '').trim();
    if (notes.length > 12000 || summary.length > 3000) return res.status(400).json({ message: 'Notes are too long.' });
    session.notes = notes; session.summary = summary; await session.save();
    res.json({ session });
  } catch (error) { next(error); }
});

router.get('/:id/export', async (req, res, next) => {
  try {
    const session = await getParticipantSession(req.params.id, req.user._id);
    if (!session) return res.status(404).json({ message: 'Session not found or access denied.' });
    const content = `PeerLearn Session Notes\nTopic: ${session.topic}\nDifficulty: ${session.difficulty}\n\nSummary\n${session.summary || '(No summary saved)'}\n\nNotes\n${session.notes || '(No notes saved)'}\n\nCode (${session.language})\n${session.code}\n`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="peerlearn-session-${session._id}.txt"`);
    res.send(content);
  } catch (error) { next(error); }
});

export default router;
