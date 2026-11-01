import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/config', (_req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  const turnUrls = String(process.env.TURN_URLS || '').split(',').map(value => value.trim()).filter(Boolean);
  const username = String(process.env.TURN_USERNAME || '').trim();
  const credential = String(process.env.TURN_CREDENTIAL || '').trim();
  if (turnUrls.length && username && credential) iceServers.push({ urls: turnUrls, username, credential });
  res.set('Cache-Control', 'no-store').json({ iceServers, turnConfigured: iceServers.length > 2 });
});

export default router;
