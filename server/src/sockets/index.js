import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Message from '../models/Message.js';
import * as Y from 'yjs';

const docs = new Map();
const toBase64 = value => Buffer.from(value).toString('base64');
function getSharedDoc(sessionId, code = '') {
  if (!docs.has(String(sessionId))) {
    const doc = new Y.Doc();
    if (code) doc.getText('code').insert(0, code);
    docs.set(String(sessionId), doc);
  }
  return docs.get(String(sessionId));
}

export function configureSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required.'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('name username avatarUrl');
      if (!user) return next(new Error('Account not found.'));
      socket.user = user;
      next();
    } catch { next(new Error('Invalid session token.')); }
  });

  io.on('connection', socket => {
    socket.join(`user:${socket.user._id}`);

    socket.on('room:join', async ({ sessionId } = {}, ack = () => {}) => {
      try {
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] });
        if (!session || !['in_progress', 'completed'].includes(session.status)) return ack({ ok: false, message: 'Start the accepted booking before joining its live room.' });
        socket.join(`session:${sessionId}`);
        if (session.status === 'in_progress') {
          // Persist actual room participation so credits cannot be settled by confirming from the dashboard alone.
          await Session.updateOne({ _id: sessionId, status: 'in_progress' }, { $addToSet: { participantsJoined: socket.user._id } });
        }
        const doc = getSharedDoc(sessionId, session.code || '// PeerLearn shared editor\n\n');
        socket.emit('editor:yinit', { update: toBase64(Y.encodeStateAsUpdate(doc)) });
        const messages = await Message.find({ session: sessionId }).sort({ createdAt: 1 }).limit(250).lean();
        ack({ ok: true, user: { id: String(socket.user._id), name: socket.user.name }, session: { id: String(session._id), status: session.status }, workspace: { code: session.code || doc.getText('code').toString(), language: session.language || 'javascript', whiteboard: session.whiteboard || { strokes: [] }, notes: session.notes || '', summary: session.summary || '' }, messages: messages.map(m => ({ _id: String(m._id), sender: { _id: String(m.sender), name: m.senderName }, body: m.body, createdAt: m.createdAt })) });
        socket.to(`session:${sessionId}`).emit('presence:joined', { id: String(socket.user._id), name: socket.user.name });
      } catch { ack({ ok: false, message: 'Could not join this room.' }); }
    });

    socket.on('room:ping', async ({ sessionId } = {}) => {
      try {
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id');
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return;
        socket.to(`session:${sessionId}`).volatile.emit('presence:ping', { id: String(socket.user._id), name: socket.user.name });
      } catch { /* presence is best-effort */ }
    });

    socket.on('room:leave', ({ sessionId } = {}) => {
      if (sessionId && socket.rooms.has(`session:${sessionId}`)) socket.leave(`session:${sessionId}`);
    });

    socket.on('room:event', async ({ sessionId, event } = {}) => {
      try {
        if (!event || !['ss', 'sp', 'se', 'undo', 'clear'].includes(event.t)) return;
        if (JSON.stringify(event).length > 24000) return;
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id');
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return;
        const clean = { ...event, uid: String(socket.user._id) };
        // Never trust identity or routing fields supplied by a browser; user id comes from the verified JWT.
        delete clean.sessionId;
        socket.to(`session:${sessionId}`).volatile.emit('room:event', clean);
      } catch { /* malformed whiteboard delta is ignored */ }
    });

    socket.on('chat:message', async ({ sessionId, body } = {}, ack = () => {}) => {
      try {
        const clean = String(body || '').trim();
        if (!clean || clean.length > 3000) return ack({ ok: false, message: 'Message must be 1–3,000 characters.' });
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id');
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return ack({ ok: false, message: 'Join the session room first.' });
        const message = await Message.create({ session: sessionId, sender: socket.user._id, senderName: socket.user.name, body: clean });
        const payload = { _id: message._id, sender: { _id: socket.user._id, name: socket.user.name }, body: message.body, createdAt: message.createdAt };
        io.to(`session:${sessionId}`).emit('chat:message', payload);
        ack({ ok: true, message: payload });
      } catch { ack({ ok: false, message: 'Message could not be saved.' }); }
    });

    socket.on('editor:request-sync', async ({ sessionId } = {}) => {
      try {
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id code status');
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return;
        const doc = getSharedDoc(sessionId, session.code || '// PeerLearn shared editor\n\n');
        socket.emit('editor:yinit', { update: toBase64(Y.encodeStateAsUpdate(doc)) });
      } catch { /* a future sync request can retry */ }
    });

    socket.on('editor:yupdate', async ({ sessionId, update } = {}, ack = () => {}) => {
      try {
        if (typeof update !== 'string' || update.length > 350000) return ack({ ok: false, message: 'Editor update is too large.' });
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id code status');
        if (!session || session.status !== 'in_progress' || !socket.rooms.has(`session:${sessionId}`)) return ack({ ok: false, message: 'Code editing is available only after you join an active room.' });
        const doc = getSharedDoc(sessionId, session.code || '// PeerLearn shared editor\n\n');
        const bytes = Buffer.from(update, 'base64');
        Y.applyUpdate(doc, bytes, socket.id);
        socket.to(`session:${sessionId}`).emit('editor:yupdate', { update });
        await Session.updateOne({ _id: sessionId }, { $set: { code: doc.getText('code').toString() } });
        ack({ ok: true });
      } catch { ack({ ok: false, message: 'Collaborative editor update could not be saved.' }); }
    });

    socket.on('editor:language', async ({ sessionId, language } = {}, ack = () => {}) => {
      try {
        const value = String(language || 'javascript').slice(0, 40);
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id status');
        if (!session || session.status !== 'in_progress' || !socket.rooms.has(`session:${sessionId}`)) return ack({ ok: false, message: 'Language can be changed only in an active room.' });
        await Session.updateOne({ _id: sessionId }, { $set: { language: value } });
        socket.to(`session:${sessionId}`).emit('editor:language', { language: value });
        ack({ ok: true });
      } catch { ack({ ok: false, message: 'Language could not be saved.' }); }
    });

    socket.on('editor:update', async ({ sessionId, code, language } = {}, ack = () => {}) => {
      try {
        if (typeof code !== 'string' || code.length > 100000) return ack({ ok: false, message: 'Code size limit exceeded.' });
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id status');
        if (!session || session.status !== 'in_progress' || !socket.rooms.has(`session:${sessionId}`)) return ack({ ok: false, message: 'Code editing is available only after you join an active room.' });
        await Session.updateOne({ _id: sessionId }, { $set: { code, ...(typeof language === 'string' ? { language: language.slice(0, 40) } : {}) } });
        socket.to(`session:${sessionId}`).emit('editor:update', { code, language, updatedBy: socket.user.name, updatedAt: new Date().toISOString() });
        ack({ ok: true });
      } catch { ack({ ok: false, message: 'Code update could not be saved.' }); }
    });

    socket.on('whiteboard:preview', async ({ sessionId, whiteboard } = {}) => {
      try {
        if (JSON.stringify(whiteboard ?? {}).length > 250000) return;
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id status');
        if (!session || session.status !== 'in_progress' || !socket.rooms.has(`session:${sessionId}`)) return;
        socket.to(`session:${sessionId}`).volatile.emit('whiteboard:preview', { whiteboard, updatedBy: socket.user.name });
      } catch { /* ignore malformed preview; the committed board remains persisted */ }
    });

    socket.on('whiteboard:update', async ({ sessionId, whiteboard } = {}, ack = () => {}) => {
      try {
        const serialized = JSON.stringify(whiteboard ?? {});
        if (serialized.length > 250000) return ack({ ok: false, message: 'Whiteboard data is too large.' });
        const session = await Session.findOne({ _id: sessionId, $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id status');
        if (!session || session.status !== 'in_progress' || !socket.rooms.has(`session:${sessionId}`)) return ack({ ok: false, message: 'Whiteboard editing is available only in an active session.' });
        await Session.updateOne({ _id: sessionId }, { $set: { whiteboard } });
        socket.to(`session:${sessionId}`).emit('whiteboard:update', { whiteboard, updatedBy: socket.user.name });
        ack({ ok: true });
      } catch { ack({ ok: false, message: 'Whiteboard update could not be saved.' }); }
    });

    socket.on('rtc:signal', async ({ sessionId, toUserId, signal } = {}) => {
      try {
        if (!sessionId || !toUserId || !signal || !['offer', 'answer', 'candidate', 'hangup'].includes(signal.type) || JSON.stringify(signal).length > 250000) return;
        if (signal.type === 'candidate' && (!signal.candidate || typeof signal.candidate.candidate !== 'string' || signal.candidate.candidate.length > 5000)) return;
        if (['offer', 'answer'].includes(signal.type) && (!signal.description || !['offer', 'answer'].includes(signal.description.type) || typeof signal.description.sdp !== 'string' || signal.description.sdp.length > 200000)) return;
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('learner mentor status');
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return;
        const members = [String(session.learner), String(session.mentor)];
        if (!members.includes(String(toUserId)) || String(toUserId) === String(socket.user._id)) return;
        const destinationSockets = io.sockets.adapter.rooms.get(`user:${toUserId}`);
        const destinationIsInRoom = [...(destinationSockets || [])].some(socketId => io.sockets.sockets.get(socketId)?.rooms.has(`session:${sessionId}`));
        if (!destinationIsInRoom) return;
        io.to(`user:${toUserId}`).emit('rtc:signal', { sessionId: String(sessionId), fromUserId: String(socket.user._id), signal });
      } catch { /* ignore malformed/unavailable signaling */ }
    });

    socket.on('rtc:ready', async ({ sessionId } = {}) => {
      try {
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('learner mentor');
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return;
        const peerId = String(session.learner) === String(socket.user._id) ? String(session.mentor) : String(session.learner);
        io.to(`user:${peerId}`).emit('rtc:peer-ready', { sessionId: String(sessionId), userId: String(socket.user._id) });
      } catch { /* peer can retry by toggling media */ }
    });

    socket.on('session:notes', async ({ sessionId, notes, summary } = {}, ack = () => {}) => {
      try {
        const cleanNotes = String(notes || '').slice(0, 12000);
        const cleanSummary = String(summary || '').slice(0, 3000);
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] });
        if (!session || !socket.rooms.has(`session:${sessionId}`)) return ack({ ok: false, message: 'Join an active room before editing notes.' });
        session.notes = cleanNotes; session.summary = cleanSummary; await session.save();
        socket.to(`session:${sessionId}`).emit('session:notes', { notes: cleanNotes, summary: cleanSummary, updatedBy: String(socket.user._id) });
        ack({ ok: true });
      } catch { ack({ ok: false, message: 'Notes could not be saved.' }); }
    });

    socket.on('editor:cursor', async ({ sessionId, pos } = {}) => {
      try {
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id');
        if (!session || !socket.rooms.has(`session:${sessionId}`) || !pos || typeof pos.line !== 'number' || typeof pos.ch !== 'number') return;
        socket.to(`session:${sessionId}`).volatile.emit('editor:cursor', { userId: String(socket.user._id), pos });
      } catch { /* cursors are ephemeral */ }
    });

    socket.on('whiteboard:pointer', async ({ sessionId, x, y } = {}) => {
      try {
        const session = await Session.findOne({ _id: sessionId, status: 'in_progress', $or: [{ learner: socket.user._id }, { mentor: socket.user._id }] }).select('_id');
        if (!session || !socket.rooms.has(`session:${sessionId}`) || !Number.isFinite(x) || !Number.isFinite(y)) return;
        socket.to(`session:${sessionId}`).volatile.emit('whiteboard:pointer', { userId: String(socket.user._id), x, y });
      } catch { /* pointers are ephemeral */ }
    });

    socket.on('disconnect', () => {
      socket.broadcast.emit('presence:left', { id: socket.user._id, name: socket.user.name });
    });
  });
}
