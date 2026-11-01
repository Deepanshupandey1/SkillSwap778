import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const levelRank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const cleanText = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const lower = value => String(value || '').trim().toLocaleLowerCase();
const includesCI = (values, target) => (values || []).some(value => lower(value) === lower(target));
const slotMatchesPeriod = (slot, period) => {
  const hour = Number(String(slot).split(' ')[1]?.split(':')[0]);
  if (!Number.isFinite(hour)) return false;
  if (period === 'morning') return hour >= 5 && hour < 12;
  if (period === 'afternoon') return hour >= 12 && hour < 17;
  if (period === 'evening') return hour >= 17 && hour < 22;
  if (period === 'weekend') return /^(Sat|Sun)\s/.test(String(slot));
  return true;
};

function skillMatchScore(user, preferredSkill) {
  const target = lower(preferredSkill);
  const skills = [...(user.skills || []), ...(user.topics || [])].map(lower);
  if (skills.some(skill => skill === target)) return 60;
  if (skills.some(skill => skill.includes(target) || target.includes(skill))) return 42;
  const words = target.split(/[^a-z0-9+#.]+/).filter(word => word.length > 2);
  const overlap = new Set(skills.flatMap(skill => skill.split(/[^a-z0-9+#.]+/).filter(word => word.length > 2)));
  const matches = words.filter(word => overlap.has(word)).length;
  return words.length ? Math.round((matches / words.length) * 25) : 0;
}

function getReasons(user, preferredSkill, language, availability) {
  const reasons = [];
  const skills = [...(user.skills || []), ...(user.topics || [])];
  const matchedSkill = skills.find(skill => lower(skill) === lower(preferredSkill))
    || skills.find(skill => lower(skill).includes(lower(preferredSkill)) || lower(preferredSkill).includes(lower(skill)));
  if (matchedSkill) reasons.push(`Skill match: ${matchedSkill}`);
  else reasons.push(`Related experience in ${(user.skills || []).slice(0, 2).join(', ') || 'peer learning'}`);
  if (language && includesCI(user.languages, language)) reasons.push(`Uses ${language}`);
  if (availability && availability !== 'any' && (user.availableSlots || []).some(slot => slotMatchesPeriod(slot, availability))) reasons.push(`Has ${availability} availability`);
  if (user.averageRating > 0) reasons.push(`${user.averageRating.toFixed(1)}★ from ${user.ratingCount || 0} ratings`);
  return reasons.slice(0, 3);
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const chunks = [];
  for (const item of payload?.output || []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if ((content?.type === 'output_text' || content?.type === 'text') && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
}

router.post('/recommendations', async (req, res) => {
  const preferredSkill = cleanText(req.body?.preferredSkill, 80);
  const language = cleanText(req.body?.language, 60);
  const availability = cleanText(req.body?.availability || 'any', 20).toLowerCase();
  if (preferredSkill.length < 2) return res.status(400).json({ message: 'Enter a skill or topic with at least 2 characters.' });
  if (!['any', 'morning', 'afternoon', 'evening', 'weekend'].includes(availability)) {
    return res.status(400).json({ message: 'Choose a valid availability window.' });
  }

  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('name username bio skills topics languages spokenLanguages experienceLevel availableSlots averageRating ratingCount sessionsHelped credits.lifetimeEarned badges')
      .limit(250).lean();
    // Recommend the best-fitting peers regardless of experience level; booking acceptance is the consent gate.
    const eligible = users;
    const ranked = eligible.map(user => {
      const slots = user.availableSlots || [];
      const available = availability === 'any' || slots.some(slot => slotMatchesPeriod(slot, availability));
      const langMatch = !language || includesCI(user.languages, language);
      const skillScore = skillMatchScore(user, preferredSkill);
      const score = skillScore + (langMatch && language ? 20 : language ? 0 : 8) + (available ? 12 : -20)
        + Math.min(8, Number(user.averageRating || 0) * 1.6)
        + Math.min(6, Number(user.sessionsHelped || 0) / 3);
      return { user, score, skillScore, available, langMatch };
    }).sort((a, b) => b.score - a.score);

    // Start with exact preference matches. If filters are too narrow, relax availability/language,
    // then skill so the assistant can still suggest peers instead of returning a dead end.
    let selected = ranked.filter(item => item.available && item.langMatch && item.skillScore > 0);
    let matchMode = 'all_preferences';
    if (!selected.length) { selected = ranked.filter(item => item.skillScore > 0 && item.langMatch); matchMode = 'availability_relaxed'; }
    if (!selected.length) { selected = ranked.filter(item => item.skillScore > 0); matchMode = 'language_relaxed'; }
    if (!selected.length) { selected = ranked; matchMode = 'broad_profile_matches'; }
    selected = selected.slice(0, 5);

    const candidates = selected.map(({ user, score, available, langMatch, skillScore }) => ({
      id: String(user._id), username: user.username, name: user.name, bio: user.bio || '',
      experienceLevel: user.experienceLevel, skills: user.skills || [], languages: user.languages || [],
      availableSlots: user.availableSlots || [], rating: Number(user.averageRating || 0),
      ratingCount: Number(user.ratingCount || 0), sessionsHelped: Number(user.sessionsHelped || 0),
      score: Math.round(score), skillScore, matchedAvailability: available, matchedLanguage: langMatch,
      reasons: [...getReasons(user, preferredSkill, language, availability), ...(matchMode !== 'all_preferences' ? ['Suggested after relaxing one or more filters'] : [])].slice(0, 4)
    }));

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.json({
        aiEnabled: false,
        assistantText: 'These peer suggestions are ranked from live PeerLearn profiles. Personalized coaching text is generated by the server-side AI configuration when available; the API key is never sent to the browser.',
        preferredSkill, candidates
      });
    }

    try {
      const instructions = 'You are PeerLearn’s session-matching assistant. Recommend only peers listed in the supplied candidates. Do not invent people, skills, ratings, prices, or availability. Users may work with any peer regardless of experience level or exact skill match, but do not claim a booking is confirmed. Explain the strongest available match in 2–4 short sentences and suggest one concrete learning goal for the session. If no candidates are supplied, say so and suggest broadening filters. Do not imply you booked anything.';
      const input = JSON.stringify({ learnerLevel: req.user.experienceLevel, preferredSkill, language: language || 'Any', availability, matchMode, candidates: candidates.map(c => ({ name: c.name, username: c.username, experienceLevel: c.experienceLevel, skills: c.skills, languages: c.languages, availableSlots: c.availableSlots, rating: c.rating, sessionsHelped: c.sessionsHelped, matchReasons: c.reasons })) });
      const callOpenAI = async model => {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ model, store: false, instructions, input, max_output_tokens: 240 })
        });
        const payload = await response.json().catch(() => ({}));
        return { response, payload };
      };
      let model = String(process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim();
      let { response, payload } = await callOpenAI(model);
      // A Render environment may still have a retired/typo model configured. Retry once with a stable fallback.
      const fallbackModel = String(process.env.OPENAI_FALLBACK_MODEL || 'gpt-4.1-mini').trim();
      if (!response.ok && model !== fallbackModel && (response.status === 400 || response.status === 404) && /model|unsupported/i.test(String(payload?.error?.code || payload?.error?.message || payload?.error?.type || ''))) {
        model = fallbackModel;
        ({ response, payload } = await callOpenAI(model));
      }
      if (!response.ok) {
        console.error('OpenAI recommendation request failed:', response.status, payload?.error?.code || payload?.error?.type || 'API error');
        return res.json({ aiEnabled: true, aiAvailable: false, assistantText: 'AI guidance is temporarily unavailable. The ranked peer matches below still come from live PeerLearn profiles; verify the OpenAI key and model on the server if this persists.', preferredSkill, candidates });
      }
      const assistantText = extractResponseText(payload);
      return res.json({ aiEnabled: true, aiAvailable: Boolean(assistantText), assistantText: assistantText || 'The profiles below are the closest database matches. Review their skills and free slots before booking.', preferredSkill, candidates });
    } catch (error) {
      console.error('OpenAI recommendation request failed:', error.name || 'RequestError');
      return res.json({ aiEnabled: true, aiAvailable: false, assistantText: 'The AI assistant timed out or is temporarily unavailable. The ranked matches below are still available.', preferredSkill, candidates });
    }
  } catch (error) {
    console.error('AI recommendation search failed:', error);
    return res.status(500).json({ message: 'Could not search peer profiles right now.' });
  }
});

export default router;
