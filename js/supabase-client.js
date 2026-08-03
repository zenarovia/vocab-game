/* ============================================================
   NÚMERO NEST — Supabase persistence client
   Talks to the real backend (see schema.sql for table shapes).
   Replaces the prototype's in-browser-memory-only stats with real,
   persisted per-student progress that survives a refresh.

   The anon/publishable key below is safe to be here — it's the
   client-side key Supabase is designed to have shipped in the
   browser. Row Level Security (set up in schema.sql) is what
   actually keeps one student's data private from another, not
   secrecy of this key.
   ============================================================ */

const SUPABASE_URL = 'https://xvpeqazqltyjqhnwcwex.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QmKsson3W2-X3Cj7eWFk_w_H_7FkDNv';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_SET_ID = 'numbers-0-10'; // which set a student starts on before any switching/assignment exists

let currentStudentId = null;
let wordIdByNumber = {};   // number -> vocab_words.id, for the current set
let numberByWordId = {};   // reverse lookup

// ---- Identity --------------------------------------------------------
// Anonymous sign-in gives a real, persistent Supabase user id without
// a password/login screen — the session is saved by supabase-js
// (localStorage) so returning to the site on the same device keeps
// the same identity automatically.
async function ensureSignedIn(){
  const { data: { session } } = await sb.auth.getSession();
  if(session){
    currentStudentId = session.user.id;
    return session.user;
  }
  const { data, error } = await sb.auth.signInAnonymously();
  if(error){
    console.error('Supabase anonymous sign-in failed:', error);
    return null;
  }
  currentStudentId = data.user.id;
  return data.user;
}

// Returns the existing student row, or null if this student hasn't
// set up a profile (name/class period) yet — the caller should prompt
// and call createStudentProfile() in that case.
async function getStudentProfile(){
  if(!currentStudentId) return null;
  const { data, error } = await sb
    .from('students')
    .select('id, display_name, class_period')
    .eq('id', currentStudentId)
    .maybeSingle();
  if(error){
    console.error('Failed to check student profile:', error);
    return null;
  }
  return data;
}

async function createStudentProfile(displayName, classPeriod){
  if(!currentStudentId) return null;
  const { data, error } = await sb
    .from('students')
    .insert({ id: currentStudentId, display_name: displayName, class_period: classPeriod || null })
    .select()
    .single();
  if(error){
    console.error('Failed to create student profile:', error);
    return null;
  }
  return data;
}

// ---- Loading progress --------------------------------------------------------
async function loadWordIdsForSet(setId){
  const { data, error } = await sb
    .from('vocab_words')
    .select('id, number')
    .eq('set_id', setId);
  if(error){
    console.error('Failed to load vocab_words:', error);
    return {};
  }
  const map = {};
  (data || []).forEach(row => {
    if(row.number !== null) map[row.number] = row.id;
  });
  return map;
}

// Checks whether EVERY word in a set has been graduated in Matching
// (correct > wrong) — used to gate whether the next set unlocks. Doesn't
// require switching the active set; queries that set's own data directly.
async function isSetFullyGraduated(setId){
  if(!currentStudentId) return false;
  const idMap = await loadWordIdsForSet(setId);
  const wordIds = Object.values(idMap);
  if(wordIds.length === 0) return false;

  const { data, error } = await sb
    .from('word_progress')
    .select('word_id, correct_count, wrong_count')
    .eq('student_id', currentStudentId)
    .eq('mode', 'matching')
    .in('word_id', wordIds);
  if(error){
    console.error('Failed to check set completion:', error);
    return false;
  }
  const graduatedIds = new Set(
    (data || []).filter(row => row.correct_count > row.wrong_count).map(row => row.word_id)
  );
  return wordIds.every(id => graduatedIds.has(id));
}

// Checks whether a teacher has assigned a specific set for this class
// period. Returns the assigned set_id, or null if none/no class period.
// (Setting the assignment itself is done directly in Supabase's Table
// Editor for now — see README for the exact steps — until a real
// teacher-facing admin screen exists.)
async function getAssignedSetForClassPeriod(classPeriod){
  if(!classPeriod) return null;
  const { data, error } = await sb
    .from('set_assignments')
    .select('set_id')
    .eq('class_period', classPeriod)
    .maybeSingle();
  if(error){
    console.error('Failed to check set assignment:', error);
    return null;
  }
  return data ? data.set_id : null;
}

async function loadStudentProgress(setId){
  if(!currentStudentId) return { wordStatsByMode: {}, modeCounts: {}, coins: 0 };

  wordIdByNumber = await loadWordIdsForSet(setId);
  numberByWordId = {};
  Object.entries(wordIdByNumber).forEach(([num, id]) => { numberByWordId[id] = Number(num); });
  const wordIds = Object.values(wordIdByNumber);

  const [progressResult, modeResult, coinResult] = await Promise.all([
    sb.from('word_progress')
      .select('word_id, mode, correct_count, wrong_count')
      .eq('student_id', currentStudentId)
      .in('word_id', wordIds.length ? wordIds : [-1]),
    sb.from('mode_practice_counts')
      .select('mode, questions_answered')
      .eq('student_id', currentStudentId)
      .eq('set_id', setId),
    sb.from('student_coins')
      .select('total_coins')
      .eq('student_id', currentStudentId)
      .maybeSingle(),
  ]);

  if(progressResult.error) console.error('Failed to load word progress:', progressResult.error);
  if(modeResult.error) console.error('Failed to load mode counts:', modeResult.error);
  if(coinResult.error) console.error('Failed to load coins:', coinResult.error);

  const wordStatsByMode = {};
  (progressResult.data || []).forEach(row => {
    const num = numberByWordId[row.word_id];
    if(num !== undefined){
      if(!wordStatsByMode[row.mode]) wordStatsByMode[row.mode] = {};
      wordStatsByMode[row.mode][num] = { correct: row.correct_count, wrong: row.wrong_count };
    }
  });

  const modeCounts = {};
  (modeResult.data || []).forEach(row => {
    modeCounts[row.mode] = row.questions_answered;
  });

  return {
    wordStatsByMode,
    modeCounts,
    coins: coinResult.data ? coinResult.data.total_coins : 0,
  };
}

// ---- Saving progress --------------------------------------------------------
// Fire-and-forget: the UI updates immediately from local state, these
// just persist that state in the background. Errors are logged, not
// shown to the student — a failed save shouldn't interrupt play.
function saveWordProgress(mode, number, correct, wrong){
  const wordId = wordIdByNumber[number];
  if(!currentStudentId || !wordId) return;
  sb.from('word_progress').upsert({
    student_id: currentStudentId,
    word_id: wordId,
    mode: mode,
    correct_count: correct,
    wrong_count: wrong,
    updated_at: new Date().toISOString(),
  }).then(({ error }) => { if(error) console.error('Failed to save word progress:', error); });
}

function saveModeCount(setId, mode, count){
  if(!currentStudentId) return;
  sb.from('mode_practice_counts').upsert({
    student_id: currentStudentId,
    set_id: setId,
    mode: mode,
    questions_answered: count,
    updated_at: new Date().toISOString(),
  }).then(({ error }) => { if(error) console.error('Failed to save mode count:', error); });
}

function saveCoins(total){
  if(!currentStudentId) return;
  sb.from('student_coins').upsert({
    student_id: currentStudentId,
    total_coins: total,
    updated_at: new Date().toISOString(),
  }).then(({ error }) => { if(error) console.error('Failed to save coins:', error); });
}

// Logs one answer event with a real timestamp — this is what lets the
// class competition leaderboard compute "this week" / "today" purely as
// a date filter, with no manual weekly reset needed.
function logActivity(setId, mode, isCorrect, points){
  if(!currentStudentId) return;
  sb.from('activity_log').insert({
    student_id: currentStudentId,
    set_id: setId,
    mode: mode,
    is_correct: isCorrect,
    points: points || 0,
  }).then(({ error }) => { if(error) console.error('Failed to log activity:', error); });
}

// Fetches the current class standings (this week), highest combined
// score first — reads directly from the class_weekly_leaderboard view.
async function getClassLeaderboard(){
  const { data, error } = await sb
    .from('class_weekly_leaderboard')
    .select('class_period, student_count, avg_participation_this_week, avg_mastery_this_week, combined_score')
    .order('combined_score', { ascending: false });
  if(error){
    console.error('Failed to load class leaderboard:', error);
    return [];
  }
  return data || [];
}

window.VocabBackend = {
  DEFAULT_SET_ID,
  ensureSignedIn,
  getStudentProfile,
  createStudentProfile,
  loadStudentProgress,
  saveWordProgress,
  saveModeCount,
  saveCoins,
  isSetFullyGraduated,
  getAssignedSetForClassPeriod,
  logActivity,
  getClassLeaderboard,
};
