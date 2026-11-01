import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/db.js';
import User from '../models/User.js';
import Question from '../models/Question.js';
import CreditTransaction from '../models/CreditTransaction.js';

const demoPassword = 'PeerLearn123!';
const samples = [
  { name: 'Priya Mehta', username: 'priyamehta', email: 'priya@peerlearn.demo', bio: 'Frontend engineer who enjoys making hard concepts feel simple.', skills: ['React', 'JavaScript', 'System Design', 'CSS'], languages: ['JavaScript', 'TypeScript'], experienceLevel: 'Advanced', availability: ['Evenings', 'Weekends'], credits: { available: 2400, reserved: 0, lifetimeEarned: 2860, lifetimeSpent: 460 }, completedSessions: 42, sessionsHelped: 35, questionsAsked: 8, questionsResolved: 6, answersPosted: 24, averageRating: 4.9, ratingCount: 28, badges: ['First Step', 'First 10 Sessions', 'Helpful Peer'] },
  { name: 'Rohan Verma', username: 'rohanverma', email: 'rohan@peerlearn.demo', bio: 'DSA, C++ and interview prep. Bring your edge cases.', skills: ['DSA', 'C++', 'Graphs', 'Binary Search'], languages: ['C++', 'Java'], experienceLevel: 'Advanced', availability: ['Evenings', 'Weekends'], credits: { available: 2100, reserved: 0, lifetimeEarned: 2450, lifetimeSpent: 350 }, completedSessions: 38, sessionsHelped: 31, questionsAsked: 7, questionsResolved: 5, answersPosted: 21, averageRating: 4.8, ratingCount: 25, badges: ['First Step', 'First 10 Sessions'] },
  { name: 'Sneha Kapoor', username: 'snehakapoor', email: 'sneha@peerlearn.demo', bio: 'Python, data and ML fundamentals without the jargon.', skills: ['Python', 'Machine Learning', 'Data Analysis'], languages: ['Python', 'SQL'], experienceLevel: 'Advanced', availability: ['Afternoons', 'Evenings'], credits: { available: 1800, reserved: 0, lifetimeEarned: 2075, lifetimeSpent: 275 }, completedSessions: 30, sessionsHelped: 24, questionsAsked: 9, questionsResolved: 7, answersPosted: 18, averageRating: 4.8, ratingCount: 19, badges: ['First Step', 'Helpful Peer'] },
  { name: 'Arjun Nair', username: 'arjunnair', email: 'arjun@peerlearn.demo', bio: 'I explain operating systems and networking using practical examples.', skills: ['Operating Systems', 'Computer Networks', 'Linux'], languages: ['C', 'Python'], experienceLevel: 'Advanced', availability: ['Weekends', 'Evenings'], credits: { available: 1500, reserved: 0, lifetimeEarned: 1710, lifetimeSpent: 210 }, completedSessions: 22, sessionsHelped: 18, questionsAsked: 5, questionsResolved: 4, answersPosted: 14, averageRating: 4.7, ratingCount: 12, badges: ['First Step'] },
  { name: 'Karan Malik', username: 'karanmalik', email: 'karan@peerlearn.demo', bio: 'B.Tech student learning in public. I like DBMS and SQL puzzles.', skills: ['DBMS', 'SQL', 'Java', 'OOP'], languages: ['Java', 'SQL'], experienceLevel: 'Intermediate', availability: ['Evenings'], credits: { available: 860, reserved: 0, lifetimeEarned: 1110, lifetimeSpent: 250 }, completedSessions: 18, sessionsHelped: 12, questionsAsked: 52, questionsResolved: 18, answersPosted: 18, averageRating: 4.8, ratingCount: 9, badges: ['First Step'] },
  { name: 'Aarav Sharma', username: 'aaravsharma', email: 'aarav@peerlearn.demo', bio: 'React learner trying to understand the why, not just the what.', skills: ['React', 'Frontend', 'JavaScript'], languages: ['JavaScript', 'HTML', 'CSS'], experienceLevel: 'Intermediate', availability: ['Evenings', 'Weekends'], credits: { available: 520, reserved: 0, lifetimeEarned: 650, lifetimeSpent: 130 }, completedSessions: 8, sessionsHelped: 5, questionsAsked: 18, questionsResolved: 4, answersPosted: 6, averageRating: 4.6, ratingCount: 5, badges: ['First Step'] },
  { name: 'Riya Verma', username: 'riyaverma', email: 'riya@peerlearn.demo', bio: 'Practising DSA one problem at a time.', skills: ['DSA', 'Binary Search', 'C++'], languages: ['C++', 'Python'], experienceLevel: 'Beginner', availability: ['Afternoons', 'Evenings'], credits: { available: 475, reserved: 0, lifetimeEarned: 500, lifetimeSpent: 25 }, completedSessions: 1, sessionsHelped: 1, questionsAsked: 12, questionsResolved: 2, answersPosted: 2, averageRating: 5, ratingCount: 1, badges: [] }
];

async function seed() {
  await connectDatabase();
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const users = [];
  for (const sample of samples) {
    const spokenByUser = {
      priyamehta: ['English', 'Hindi'], rohanverma: ['English', 'Hindi'], snehakapoor: ['English', 'Hindi'],
      arjunnair: ['English', 'Malayalam'], karanmalik: ['English', 'Hindi'], aaravsharma: ['English', 'Hindi'], riyaverma: ['English', 'Hindi']
    };
    const slotsByUser = {
      priyamehta: ['Mon 18:00', 'Wed 18:00', 'Fri 18:00', 'Sat 12:00'],
      rohanverma: ['Tue 18:00', 'Thu 18:00', 'Sat 12:00', 'Sun 15:00'],
      snehakapoor: ['Tue 15:00', 'Wed 18:00', 'Fri 18:00', 'Sat 15:00'],
      arjunnair: ['Mon 18:00', 'Thu 18:00', 'Sat 12:00', 'Sun 15:00'],
      karanmalik: ['Mon 18:00', 'Wed 18:00', 'Fri 18:00'],
      aaravsharma: ['Tue 18:00', 'Thu 18:00', 'Sat 12:00'],
      riyaverma: ['Tue 15:00', 'Thu 18:00', 'Sat 15:00']
    };
    const { _id } = await User.findOneAndUpdate({ username: sample.username }, { $set: { ...sample, passwordHash, welcomeCreditsGranted: true, spokenLanguages: spokenByUser[sample.username] || ['English'], availableSlots: slotsByUser[sample.username] || [], topics: [] } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    users.push(await User.findById(_id));
    const earnings = Math.max(0, sample.credits.lifetimeEarned - 500);
    const ledgerRows = [
      { referenceKey: `user:${_id}:seed-welcome`, type: 'welcome_bonus', amount: 500, balanceAfter: 500, description: 'Demo account starter credits', createdAt: new Date(Date.now() - 90 * 86400000) },
      ...(earnings > 0 ? [{ referenceKey: `user:${_id}:seed-earnings`, type: 'session_earned', amount: earnings, balanceAfter: sample.credits.lifetimeEarned, description: 'Historical mentorship earnings (demo data)', createdAt: new Date(Date.now() - 35 * 86400000) }] : []),
      ...(sample.credits.lifetimeSpent > 0 ? [{ referenceKey: `user:${_id}:seed-spending`, type: 'session_spent', amount: -sample.credits.lifetimeSpent, balanceAfter: sample.credits.available, description: 'Historical completed mentorships (demo data)', createdAt: new Date(Date.now() - 2 * 86400000) }] : [])
    ];
    for (const row of ledgerRows) {
      await CreditTransaction.updateOne({ referenceKey: row.referenceKey }, { $setOnInsert: { user: _id, ...row } }, { upsert: true });
    }
  }
  const byName = Object.fromEntries(users.map(u => [u.username, u]));
  const questionSeeds = [
    { author: 'aaravsharma', likes: ['priyamehta', 'karanmalik', 'snehakapoor'], title: 'How to optimize re-renders in React?', description: 'I am facing unnecessary re-renders in my component even though the state is not changing. Can someone explain when to use React.memo properly?', topic: 'React', language: 'JavaScript', difficulty: 'Medium', tags: ['React', 'Frontend', 'Optimization'], answers: [{ author: 'priyamehta', body: 'Start by using React DevTools Profiler to verify which component is rendering. React.memo helps when props stay referentially stable; useMemo/useCallback only where profiling shows a benefit.' }, { author: 'rohanverma', body: 'Also check whether a parent is recreating object and function props on every render.' }] },
    { author: 'riyaverma', likes: ['rohanverma', 'karanmalik'], status: 'resolved', resolvedAt: new Date(Date.now() - 3 * 86400000), title: 'Why is my binary search giving wrong index?', description: 'I implemented binary search but it returns an incorrect index for some test cases. I think my mid value or update conditions are wrong. What edge cases should I check?', topic: 'DSA', language: 'C++', difficulty: 'Easy', tags: ['DSA', 'Binary Search', 'C++'], answers: [{ author: 'rohanverma', body: 'Use low + (high - low) / 2. Check that low = mid + 1 and high = mid - 1 after a failed comparison, and decide what to return when the value is absent.' }] },
    { author: 'karanmalik', likes: ['snehakapoor', 'priyamehta'], title: 'Difference between WHERE and HAVING in SQL?', description: 'I understand both are used for filtering, but when exactly should we use HAVING instead of WHERE in a grouped query?', topic: 'DBMS', language: 'SQL', difficulty: 'Easy', tags: ['DBMS', 'SQL', 'Query'], answers: [{ author: 'snehakapoor', body: 'WHERE filters rows before grouping; HAVING filters the groups after GROUP BY, often using aggregate values like COUNT(*) or AVG().' }] },
    { author: 'aaravsharma', likes: ['arjunnair', 'priyamehta', 'rohanverma'], status: 'resolved', resolvedAt: new Date(Date.now() - 8 * 86400000), title: 'Can someone explain deadlocks using a simple example?', description: 'I get the four deadlock conditions in theory, but I want to understand how circular wait appears in real programs.', topic: 'Operating Systems', language: 'General', difficulty: 'Medium', tags: ['OS', 'Deadlock', 'Processes'], answers: [{ author: 'arjunnair', body: 'Imagine process A locks resource 1 and waits for resource 2 while process B locks resource 2 and waits for resource 1. Neither can proceed.' }] },
    { author: 'karanmalik', likes: ['priyamehta', 'snehakapoor'], status: 'resolved', resolvedAt: new Date(Date.now() - 14 * 86400000), title: 'How do I structure a small Express API?', description: 'My routes, database queries and validation are all inside one file. What is a clean beginner-friendly folder structure?', topic: 'Backend', language: 'JavaScript', difficulty: 'Medium', tags: ['Node.js', 'Express', 'Architecture'], answers: [] },
    { author: 'riyaverma', likes: ['rohanverma', 'aaravsharma'], title: 'When should I use a sliding window?', description: 'I can solve arrays with loops, but I struggle to identify questions where a sliding window is useful.', topic: 'DSA', language: 'C++', difficulty: 'Medium', tags: ['DSA', 'Sliding Window', 'Arrays'], answers: [{ author: 'rohanverma', body: 'Look for contiguous subarrays/substrings and a range that can be expanded or shrunk while maintaining a condition. Try fixed-size windows first.' }] }
  ];
  for (const seed of questionSeeds) {
    const existing = await Question.findOne({ title: seed.title, author: byName[seed.author]._id });
    if (existing) continue;
    const answers = seed.answers.map(a => ({ author: byName[a.author]._id, body: a.body }));
    const likedBy = (seed.likes || []).map(username => byName[username]._id);
    const { likes, ...questionFields } = seed;
    await Question.create({ ...questionFields, likedBy, author: byName[seed.author]._id, answers });
  }
  console.log(`Seeded ${users.length} PeerLearn demo users and sample questions.`);
  console.log(`Demo password for each sample account: ${demoPassword}`);
  await mongoose.disconnect();
}
seed().catch(async error => { console.error(error); await mongoose.disconnect(); process.exit(1); });
