import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { connectDatabase } from './config/db.js';
import { configureSockets } from './sockets/index.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import questionRoutes from './routes/questions.js';
import bookingRoutes from './routes/bookings.js';
import sessionRoutes from './routes/sessions.js';
import walletRoutes from './routes/wallet.js';
import leaderboardRoutes from './routes/leaderboard.js';
import uiRoutes from './routes/ui.js';
import aiRoutes from './routes/ai.js';
import rtcRoutes from './routes/rtc.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /replace_with/i.test(process.env.JWT_SECRET)) {
  console.error('Set JWT_SECRET to a random value of at least 32 characters in server/.env before starting PeerLearn.');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(v => v.trim());
const io = new Server(server, { cors: { origin: clientOrigins, methods: ['GET', 'POST', 'PATCH', 'DELETE'], credentials: true }, maxHttpBufferSize: 1e6 });
configureSockets(io);
app.set('io', io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: clientOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/ai', rateLimit({ windowMs: 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', async (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  if (!connected) return res.status(503).json({ ok: false, service: 'PeerLearn API', database: 'disconnected', timestamp: new Date().toISOString() });
  try { await mongoose.connection.db.admin().ping(); return res.json({ ok: true, service: 'PeerLearn API', database: 'connected', databaseName: mongoose.connection.name, timestamp: new Date().toISOString() }); }
  catch { return res.status(503).json({ ok: false, service: 'PeerLearn API', database: 'unreachable', timestamp: new Date().toISOString() }); }
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/ui', uiRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/rtc', rtcRoutes);
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.name === 'ValidationError') return res.status(400).json({ message: Object.values(error.errors).map(e => e.message).join(', ') });
  if (error?.code === 11000) return res.status(409).json({ message: 'This record already exists.' });
  if (/Transaction numbers are only allowed|replica set|does not support retryable writes/i.test(error?.message || '')) return res.status(503).json({ message: 'PeerLearn credit transfers require MongoDB transactions. Use MongoDB Atlas or run the provided replica-set Docker setup.' });
  res.status(500).json({ message: process.env.NODE_ENV === 'production' ? 'Unexpected server error.' : (error.message || 'Unexpected server error.') });
});

const port = Number(process.env.PORT || 5000);
connectDatabase().then(() => server.listen(port, () => console.log(`PeerLearn API running at http://localhost:${port}`))).catch(error => {
  console.error('Could not start PeerLearn:', error.message);
  process.exit(1);
});

export { app, server, io };
