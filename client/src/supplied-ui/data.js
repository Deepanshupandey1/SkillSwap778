// UI vocabulary only. User, session, ledger, and review records come from MongoDB via the API.
export const TOPICS = ['Frontend', 'Backend', 'Databases', 'Graphics & WebGL', 'Algorithms', 'DevOps', 'Mobile', 'Data & ML', 'Security', 'Design & UX', 'Systems'];
export const LANGS = ['JavaScript', 'TypeScript', 'Python', 'SQL', 'GLSL', 'Rust', 'Go', 'Java', 'C++', 'Dart', 'Swift', 'Kotlin', 'HTML/CSS'];
export const SPOKEN = ['English', 'Hindi', 'German', 'Spanish', 'Japanese', 'Arabic', 'Italian', 'Korean', 'French', 'Gujarati', 'Yoruba', 'Malayalam'];
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const PERIODS = [
  { id: 'morning', label: 'Morning', icon: 'fa-sun', test: hour => hour < 12 },
  { id: 'afternoon', label: 'Afternoon', icon: 'fa-cloud-sun', test: hour => hour >= 12 && hour < 17 },
  { id: 'evening', label: 'Evening', icon: 'fa-moon', test: hour => hour >= 17 && hour < 22 },
];
export const LEVELS = [
  { n: 1, name: 'Newcomer', min: 0, icon: 'fa-seedling', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
  { n: 2, name: 'Contributor', min: 250, icon: 'fa-leaf', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { n: 3, name: 'Helper', min: 750, icon: 'fa-hand-holding-heart', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  { n: 4, name: 'Mentor', min: 2000, icon: 'fa-graduation-cap', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  { n: 5, name: 'Guru', min: 5000, icon: 'fa-crown', cls: 'bg-amber-50 text-amber-700 ring-amber-300' },
];
export const DURATIONS = [15, 30, 45];
