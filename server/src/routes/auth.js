import { Router } from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import User from '../models/User.js';
import CreditTransaction from '../models/CreditTransaction.js';
import { requireAuth } from '../middleware/auth.js';
import { addLedgerEntry } from '../services/credits.js';

const router = Router();
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_.]+$/),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(100),
  skills: z.array(z.string().trim().max(40)).max(20).optional(),
  languages: z.array(z.string().trim().max(40)).max(15).optional()
});
const loginSchema = z.object({ emailOrUsername: z.string().trim().min(3), password: z.string().min(1).max(100) });

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
}
function safeUser(user) {
  const data = user.toObject ? user.toObject() : user;
  delete data.passwordHash;
  return data;
}

router.post('/register', async (req, res, next) => {
  const mongoSession = await mongoose.startSession();
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Check your signup details.' });
    const input = parsed.data;
    const username = input.username.toLowerCase();
    const email = input.email.toLowerCase();
    let result;
    await mongoSession.withTransaction(async () => {
      const existing = await User.findOne({ $or: [{ username }, { email }] }).session(mongoSession);
      if (existing) {
        result = { conflict: existing.username === username ? 'That username is already taken.' : 'An account with this email already exists.' };
        return;
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const [user] = await User.create([{
        name: input.name, username, email, passwordHash,
        skills: input.skills || [], languages: input.languages?.length ? input.languages : ['JavaScript'],
        credits: { available: 500, reserved: 0, lifetimeEarned: 500, lifetimeSpent: 0 }, welcomeCreditsGranted: true
      }], { session: mongoSession });
      await addLedgerEntry({ userId: user._id, type: 'welcome_bonus', amount: 500, balanceAfter: 500, description: 'Welcome to PeerLearn', referenceKey: `user:${user._id}:welcome`, session: mongoSession });
      result = { user };
    });
    if (result?.conflict) return res.status(409).json({ message: result.conflict });
    res.status(201).json({ token: signToken(result.user), user: safeUser(result.user) });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ message: 'That username or email is already registered.' });
    next(error);
  } finally { await mongoSession.endSession(); }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Enter a valid email/username and password.' });
    const key = parsed.data.emailOrUsername.toLowerCase();
    const user = await User.findOne({ $or: [{ email: key }, { username: key }] }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ message: 'Incorrect email/username or password.' });
    if (String(user.email || '').endsWith('@peerlearn.demo') && String(process.env.ENABLE_DEMO_AUTH).toLowerCase() === 'false') {
      return res.status(403).json({ message: 'Demo sign-in is disabled. Sign in with your own account or create an account.' });
    }
    user.lastActiveAt = new Date();
    await user.save();
    res.json({ token: signToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res) => res.json({ user: safeUser(req.user) }));
router.post('/logout', requireAuth, (_req, res) => res.json({ message: 'Logged out. Remove the local session token to finish logout.' }));

export default router;
