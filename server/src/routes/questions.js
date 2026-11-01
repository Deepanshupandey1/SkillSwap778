import { Router } from 'express';
import { z } from 'zod';
import Question from '../models/Question.js';
import User from '../models/User.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
const router = Router();
const difficulties = ['Easy', 'Medium', 'Hard'];
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { topic = '', difficulty = '', status = '', sort = 'recent', limit = '30' } = req.query;
    const q = String(req.query.q || '').trim().slice(0, 100);
    const filter = {};
    if (q) {
      const safeQuery = escapeRegex(q);
      filter.$or = [{ title: { $regex: safeQuery, $options: 'i' } }, { description: { $regex: safeQuery, $options: 'i' } }, { tags: { $in: [new RegExp(safeQuery, 'i')] } }];
    }
    if (topic) filter.topic = { $regex: escapeRegex(topic), $options: 'i' };
    if (difficulties.includes(difficulty)) filter.difficulty = difficulty;
    if (['open', 'resolved'].includes(status)) filter.status = status;
    const sortBy = sort === 'popular' ? { views: -1, createdAt: -1 } : { createdAt: -1 };
    const docs = await Question.find(filter)
      .populate('author', 'name username avatarUrl experienceLevel')
      .populate('answers.author', 'name username avatarUrl experienceLevel')
      .sort(sortBy).limit(Math.min(60, Math.max(1, Number(limit) || 30))).lean();
    const viewerId = req.user ? String(req.user._id) : '';
    const questions = docs.map(question => {
      const { likedBy = [], ...safe } = question;
      safe.likesCount = likedBy.length;
      safe.isLikedByMe = Boolean(viewerId && likedBy.some(id => String(id) === viewerId));
      safe.answers = (safe.answers || []).map(answer => {
        const { helpfulBy = [], ...answerSafe } = answer;
        answerSafe.helpfulCount = helpfulBy.length;
        answerSafe.isHelpfulByMe = Boolean(viewerId && helpfulBy.some(id => String(id) === viewerId));
        return answerSafe;
      });
      return safe;
    });
    res.json({ questions });
  } catch (error) { next(error); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true }).populate('author', 'name username avatarUrl experienceLevel').populate('answers.author', 'name username avatarUrl experienceLevel');
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    const json = question.toObject();
    const viewerId = req.user ? String(req.user._id) : '';
    json.likesCount = (json.likedBy || []).length;
    json.isLikedByMe = Boolean(viewerId && (json.likedBy || []).some(id => String(id) === viewerId));
    delete json.likedBy;
    json.answers = (json.answers || []).map(answer => {
      const item = answer.toObject ? answer.toObject() : { ...answer };
      item.helpfulCount = (item.helpfulBy || []).length;
      item.isHelpfulByMe = Boolean(viewerId && (item.helpfulBy || []).some(id => String(id) === viewerId));
      delete item.helpfulBy;
      return item;
    });
    res.json({ question: json });
  } catch (error) { next(error); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ title: z.string().trim().min(8).max(180), description: z.string().trim().min(15).max(12000), topic: z.string().trim().min(2).max(60), language: z.string().trim().max(60).optional(), difficulty: z.enum(['Easy', 'Medium', 'Hard']), tags: z.array(z.string().trim().max(40)).max(10).optional(), codeSnippet: z.string().max(12000).optional() });
    const p = schema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message || 'Please check the question form.' });
    const question = await Question.create({ ...p.data, author: req.user._id, tags: p.data.tags || [] });
    await User.updateOne({ _id: req.user._id }, { $inc: { questionsAsked: 1 } });
    const populated = await question.populate('author', 'name username avatarUrl experienceLevel');
    res.status(201).json({ question: populated });
  } catch (error) { next(error); }
});

router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    const already = question.likedBy.some(id => String(id) === String(req.user._id));
    if (already) question.likedBy.pull(req.user._id); else question.likedBy.addToSet(req.user._id);
    await question.save();
    res.json({ isLiked: !already, likesCount: question.likedBy.length });
  } catch (error) { next(error); }
});

router.post('/:id/answers', requireAuth, async (req, res, next) => {
  try {
    const body = String(req.body.body || '').trim();
    if (body.length < 3 || body.length > 5000) return res.status(400).json({ message: 'Answer must be between 3 and 5,000 characters.' });
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    if (question.status === 'resolved') return res.status(409).json({ message: 'This question is already resolved.' });
    question.answers.push({ author: req.user._id, body });
    await question.save();
    await User.updateOne({ _id: req.user._id }, { $inc: { answersPosted: 1 } });
    await question.populate('answers.author', 'name username avatarUrl experienceLevel');
    res.status(201).json({ answers: question.answers });
  } catch (error) { next(error); }
});

router.post('/:id/answers/:answerId/helpful', requireAuth, async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    const answer = question.answers.id(req.params.answerId);
    if (!answer) return res.status(404).json({ message: 'Answer not found.' });
    if (String(answer.author) === String(req.user._id)) return res.status(400).json({ message: 'You cannot mark your own answer helpful.' });
    const already = answer.helpfulBy.some(id => String(id) === String(req.user._id));
    if (already) answer.helpfulBy.pull(req.user._id); else answer.helpfulBy.addToSet(req.user._id);
    await question.save();
    res.json({ helpful: !already, helpfulCount: answer.helpfulBy.length });
  } catch (error) { next(error); }
});

router.patch('/:id/answers/:answerId/accept', requireAuth, async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    if (String(question.author) !== String(req.user._id)) return res.status(403).json({ message: 'Only the question author can accept an answer.' });
    const selected = question.answers.id(req.params.answerId);
    if (!selected) return res.status(404).json({ message: 'Answer not found.' });
    question.answers.forEach(answer => { answer.isAccepted = String(answer._id) === String(selected._id); });
    if (question.status !== 'resolved') {
      question.status = 'resolved';
      question.resolvedAt = new Date();
      await User.updateOne({ _id: question.author }, { $inc: { questionsResolved: 1 } });
    }
    await question.save();
    await question.populate('author', 'name username avatarUrl experienceLevel');
    await question.populate('answers.author', 'name username avatarUrl experienceLevel');
    res.json({ question });
  } catch (error) { next(error); }
});

router.patch('/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found.' });
    if (String(question.author) !== String(req.user._id)) return res.status(403).json({ message: 'Only the question author can mark it resolved.' });
    if (question.status !== 'resolved') {
      question.status = 'resolved'; question.resolvedAt = new Date(); await question.save();
      const updatedUser = await User.findByIdAndUpdate(req.user._id, { $inc: { questionsResolved: 1 } }, { new: true });
      if (updatedUser && updatedUser.questionsResolved >= 25) await User.updateOne({ _id: req.user._id }, { $addToSet: { badges: 'Problem Solver' } });
    }
    res.json({ status: question.status });
  } catch (error) { next(error); }
});

export default router;
