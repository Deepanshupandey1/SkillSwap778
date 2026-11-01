import { Router } from 'express';
import User from '../models/User.js';
const router = Router();
router.get('/', async (req, res, next) => {
  try {
    const users = await User.find().select('name username avatarUrl bio skills experienceLevel credits.lifetimeEarned completedSessions sessionsHelped averageRating ratingCount badges').sort({ sessionsHelped: -1, averageRating: -1, 'credits.lifetimeEarned': -1 }).limit(50).lean();
    res.json({ users });
  } catch (error) { next(error); }
});
export default router;
