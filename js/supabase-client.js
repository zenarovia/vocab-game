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
    .select('id, display_name, class_period, class_level')
    .eq('id', currentStudentId)
    .maybeSingle();
  if(error){
    console.error('Failed to check student profile:', error);
    return null;
  }
  return data;
}

async function createStudentProfile(displayName, classPeriod, classLevel){
  if(!currentStudentId) return null;
  const { data, error } = await sb
    .from('students')
    .insert({
      id: currentStudentId,
      display_name: displayName,
      class_period: classPeriod || null,
      class_level: classLevel || null,
    })
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
async function getAssignedSetForClassPeriod(classPeriod, classLevel){
  if(!classPeriod && !classLevel) return null;
  const { data, error } = await sb.rpc('get_assigned_set', {
    p_class_period: classPeriod || null,
    p_class_level: classLevel || null,
  });
  if(error){
    console.error('Failed to check set assignment:', error);
    return null;
  }
  return data || null;
}

// Fetches every active vocab set + its words in one round trip, and
// reshapes the flat rows into the same {id, name, words, order,
// previousSetId, activities} registry shape the app already uses —
// this is what replaces the old hardcoded VOCAB_SETS object.
async function loadAllVocabContent(){
  const { data, error } = await sb.rpc('get_all_vocab_content');
  if(error){
    console.error('Failed to load vocab content:', error);
    return {};
  }
  const sets = {};
  (data || []).forEach(row => {
    if(!sets[row.set_id]){
      sets[row.set_id] = {
        id: row.set_id,
        name: row.set_name,
        order: row.set_order,
        previousSetId: row.previous_set_id,
        activities: row.activities,
        words: [],
      };
    }
    sets[row.set_id].words.push({
      number: row.word_number,
      word: row.word_text,
      translation: row.english_word,
      audio: row.audio_url,
      context: row.context_sentence,
      contextImage: row.context_image_url,
    });
  });
  return sets;
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
    .select('class_period, class_level, student_count, avg_participation_this_week, avg_mastery_this_week, combined_score')
    .order('combined_score', { ascending: false });
  if(error){
    console.error('Failed to load class leaderboard:', error);
    return [];
  }
  return data || [];
}

// Overall cross-level standings — uses accuracy % instead of raw
// mastery points, since raw points naturally favor a class that's
// unlocked higher-weight activities. Lets a beginner class genuinely
// outrank a more advanced one on real effort + skill.
async function getOverallCrossLevelLeaderboard(){
  const { data, error } = await sb
    .from('overall_cross_level_leaderboard')
    .select('class_period, class_level, student_count, avg_participation_this_week, avg_accuracy_this_week, combined_score')
    .order('combined_score', { ascending: false });
  if(error){
    console.error('Failed to load overall cross-level leaderboard:', error);
    return [];
  }
  return data || [];
}

// Fetches per-student status for a class period — connected today,
// participation/mastery today, and a struggling flag. Powers the
// teacher-facing dashboard (passcode-gated in the app, not a real
// authenticated teacher role yet).
async function getClassStatus(classPeriod){
  const { data, error } = await sb.rpc('get_class_status', { p_class_period: classPeriod });
  if(error){
    console.error('Failed to load class status:', error);
    return [];
  }
  return data || [];
}

// Fetches recent correct-answer events for the ambient display's reward
// ticker — a fun "who just did something" feed for a classroom TV/iFP,
// separate from the quieter teacher dashboard.
async function getRecentClassActivity(classPeriod, minutes){
  const { data, error } = await sb.rpc('get_recent_class_activity', {
    p_class_period: classPeriod,
    p_minutes: minutes || 20,
  });
  if(error){
    console.error('Failed to load recent activity:', error);
    return [];
  }
  return data || [];
}

// Writes (or updates) which set is assigned to a class period. Uses a
// security-definer function since set_assignments only has a read
// policy by default — this is the app's sanctioned write path,
// reachable only through the passcode-gated teacher panel.
async function setClassAssignment(classPeriod, classLevel, setId){
  const { error } = await sb.rpc('set_class_assignment', {
    p_class_period: classPeriod || null,
    p_class_level: classLevel || null,
    p_set_id: setId,
  });
  if(error){
    console.error('Failed to set class assignment:', error);
    return false;
  }
  return true;
}

// Fetches a grading report for any date range — participation and
// mastery per student, per set. Powers the in-app grading screen
// (previously only available by running SQL directly in Supabase).
async function getGradingReport(startDate, endDate){
  const { data, error } = await sb.rpc('get_grading_report', {
    start_date: startDate,
    end_date: endDate,
  });
  if(error){
    console.error('Failed to load grading report:', error);
    return [];
  }
  return data || [];
}

// Reads the active competition period (teacher-set, or the current
// calendar week if nothing's been set) — powers the short-week
// adjustment, so a holiday-shortened week isn't scored like a normal one.
async function getCompetitionPeriod(){
  const { data, error } = await sb.rpc('get_competition_period');
  if(error){
    console.error('Failed to load competition period:', error);
    return null;
  }
  return (data && data[0]) ? data[0] : null;
}

// Sets the competition period — the app's sanctioned write path,
// reachable only through the passcode-gated teacher panel.
async function setCompetitionPeriod(startDate, endDate, label){
  const { error } = await sb.rpc('set_competition_period', {
    p_start: startDate,
    p_end: endDate,
    p_label: label || null,
  });
  if(error){
    console.error('Failed to set competition period:', error);
    return false;
  }
  return true;
}

// ---- Badges & puzzle pieces (reward economy collectibles) -----------------
// The catalogs themselves live in game.js (BADGE_CATALOG / PUZZLE_SETS) —
// these tables just track which ones a given student has actually earned.
async function loadCollectibles(){
  if(!currentStudentId) return { badgeIds: [], puzzlePieceIds: [] };
  const [badgeResult, pieceResult] = await Promise.all([
    sb.from('student_badges').select('badge_id').eq('student_id', currentStudentId),
    sb.from('student_puzzle_pieces').select('puzzle_set_id, piece_id').eq('student_id', currentStudentId),
  ]);
  if(badgeResult.error) console.error('Failed to load badges:', badgeResult.error);
  if(pieceResult.error) console.error('Failed to load puzzle pieces:', pieceResult.error);
  return {
    badgeIds: (badgeResult.data || []).map(row => row.badge_id),
    puzzlePieceIds: (pieceResult.data || []).map(row => `${row.puzzle_set_id}:${row.piece_id}`),
  };
}

// Fire-and-forget, like the other save functions — awarding a badge/piece
// a student already has is harmless (the primary key just ignores it).
function awardBadge(badgeId){
  if(!currentStudentId) return;
  sb.from('student_badges').upsert({ student_id: currentStudentId, badge_id: badgeId })
    .then(({ error }) => { if(error) console.error('Failed to award badge:', error); });
}
function awardPuzzlePiece(puzzleSetId, pieceId){
  if(!currentStudentId) return;
  sb.from('student_puzzle_pieces').upsert({ student_id: currentStudentId, puzzle_set_id: puzzleSetId, piece_id: pieceId })
    .then(({ error }) => { if(error) console.error('Failed to award puzzle piece:', error); });
}

// ---- Mascot collection (mystery packs + Exclusivo) -------------------------
async function loadMascots(){
  if(!currentStudentId) return [];
  const { data, error } = await sb
    .from('student_mascots')
    .select('mascot_id, rarity, species, icon, image_url')
    .eq('student_id', currentStudentId);
  if(error){
    console.error('Failed to load mascots:', error);
    return [];
  }
  return data || [];
}

// Awards one mascot from a mystery-pack pull — self-service, same trust
// level as everything else a student can already do (spend coins,
// client picks the random result, writes it directly).
function saveMascot(mascotId, rarity, species, icon){
  if(!currentStudentId) return;
  sb.from('student_mascots').upsert({
    student_id: currentStudentId, mascot_id: mascotId, rarity, species, icon,
  }).then(({ error }) => { if(error) console.error('Failed to save mascot:', error); });
}

// Teacher-only Exclusivo grant — looks up the student by name + class
// period and inserts a one-off custom mascot. Returns how many
// students matched (should normally be 1).
async function grantExclusiveMascot(studentName, classPeriod, mascotName, mascotIcon, imageUrl){
  const { data, error } = await sb.rpc('grant_exclusive_mascot', {
    p_student_name: studentName,
    p_class_period: classPeriod || null,
    p_mascot_name: mascotName,
    p_mascot_icon: mascotIcon,
    p_image_url: imageUrl || null,
  });
  if(error){
    console.error('Failed to grant exclusive mascot:', error);
    return 0;
  }
  return data;
}

// Logs what the winning class got for a competition period — the app's
// sanctioned write path, reachable only through the teacher panel.
async function logCompetitionPrize(periodStart, periodEnd, periodLabel, classPeriod, classLevel, prizeDescription){
  const { error } = await sb.rpc('log_competition_prize', {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_period_label: periodLabel || null,
    p_class_period: classPeriod,
    p_class_level: classLevel || null,
    p_prize_description: prizeDescription,
  });
  if(error){
    console.error('Failed to log prize:', error);
    return false;
  }
  return true;
}

// Fetches recent prize history, newest first — powers both the teacher
// panel's history list and the student-facing "recent winner" banner.
async function getPrizeHistory(limit){
  const { data, error } = await sb
    .from('competition_prizes')
    .select('period_start, period_end, period_label, class_period, class_level, prize_description, logged_at')
    .order('logged_at', { ascending: false })
    .limit(limit || 10);
  if(error){
    console.error('Failed to load prize history:', error);
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
  loadAllVocabContent,
  saveWordProgress,
  saveModeCount,
  saveCoins,
  isSetFullyGraduated,
  getAssignedSetForClassPeriod,
  logActivity,
  getClassLeaderboard,
  getOverallCrossLevelLeaderboard,
  getClassStatus,
  getRecentClassActivity,
  setClassAssignment,
  getGradingReport,
  getCompetitionPeriod,
  setCompetitionPeriod,
  logCompetitionPrize,
  getPrizeHistory,
  loadCollectibles,
  awardBadge,
  awardPuzzlePiece,
  loadMascots,
  saveMascot,
  grantExclusiveMascot,
};
