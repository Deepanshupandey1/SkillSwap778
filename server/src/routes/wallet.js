import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import CreditTransaction from '../models/CreditTransaction.js';
import User from '../models/User.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('credits');
    const transactions = await CreditTransaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('booking', 'topic difficulty status').lean();
    res.json({ credits: user.credits, transactions });
  } catch (error) { next(error); }
});
export default router;
