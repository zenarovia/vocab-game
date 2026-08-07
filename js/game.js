/* ============================================================
   NÚMERO NEST — core session engine (prototype slice)
   Scope of this file: TWO modalities (matching, typing), Batch 1
   (0–10). Round-level adaptive step: once a word is answered right
   more than wrong in matching, it "graduates" into typing rounds
   instead (recall > recognition). Everything else in the full spec
   (3 more modalities, dual dashboards, competition, mascot economy,
   grading export, teacher tools, persisted data) still builds on
   top of this same data model — intentionally NOT in this slice.
   ============================================================ */

// ---- Batch 1 vocab data ----------------------------------------------
// In production this comes from the CSV pipeline (number, word_es,
// batch, audio_url, image_url, context_sentence, modality_tags).
// Hardcoded here for the prototype.
// Two separate sets, per Twila's request — batch 1 (0-10) and batch 2
// (11-20) are distinct vocabulary sets, not one merged list. Only
// VOCAB_SET_1 is currently wired into the live game; VOCAB_SET_2 is
// prepared content, waiting on the multi-set switching UI (not yet built).
const VOCAB_SET_1 = [
  { number: 0,  word: 'cero',   translation: 'zero',  audio: 'assets/audio/cero.mp3?v=2',   context: 'Cinco menos cinco son ___.' },
  { number: 1,  word: 'uno',    translation: 'one',   audio: 'assets/audio/uno.mp3?v=2',    context: 'Tres menos dos son ___.' },
  { number: 2,  word: 'dos',    translation: 'two',   audio: 'assets/audio/dos.mp3?v=2',    context: 'Tengo ___ manzanas en la mesa.', contextImage: 'assets/context/dos.png' },
  { number: 3,  word: 'tres',   translation: 'three', audio: 'assets/audio/tres.mp3?v=2',   context: 'Hay ___ libros en la mesa.', contextImage: 'assets/context/tres.png' },
  { number: 4,  word: 'cuatro', translation: 'four',  audio: 'assets/audio/cuatro.mp3?v=2', context: 'Mi casa tiene ___ ventanas.', contextImage: 'assets/context/cuatro.png' },
  { number: 5,  word: 'cinco',  translation: 'five',  audio: 'assets/audio/cinco.mp3?v=2',  context: 'Tengo ___ dólares en mi mochila.', contextImage: 'assets/context/cinco.png' },
  { number: 6,  word: 'seis',   translation: 'six',   audio: 'assets/audio/seis.mp3?v=2',   context: 'Hay ___ pelotas en la caja.', contextImage: 'assets/context/seis.png' },
  { number: 7,  word: 'siete',  translation: 'seven', audio: 'assets/audio/siete.mp3?v=2',  context: 'La semana tiene ___ días.' },
  { number: 8,  word: 'ocho',   translation: 'eight', audio: 'assets/audio/ocho.mp3?v=2',   context: 'La araña tiene ___ patas.' },
  { number: 9,  word: 'nueve',  translation: 'nine',  audio: 'assets/audio/nueve.mp3?v=2',  context: 'Cuatro más cinco son ___.' },
  { number: 10, word: 'diez',   translation: 'ten',   audio: 'assets/audio/diez.mp3?v=2',   context: 'Tengo ___ dedos en las manos.' },
];

const VOCAB_SET_2 = [
  { number: 11, word: 'once',       translation: 'eleven',    audio: 'assets/audio/once.mp3',       context: 'Cinco más seis son ___.' },
  { number: 12, word: 'doce',       translation: 'twelve',    audio: 'assets/audio/doce.mp3',       context: 'Una docena tiene ___ huevos.' },
  { number: 13, word: 'trece',      translation: 'thirteen',  audio: 'assets/audio/trece.mp3',      context: 'Seis más siete son ___.' },
  { number: 14, word: 'catorce',    translation: 'fourteen',  audio: 'assets/audio/catorce.mp3',    context: 'El día de San Valentín es el ___ de febrero.' },
  { number: 15, word: 'quince',     translation: 'fifteen',   audio: 'assets/audio/quince.mp3',     context: 'Siete más ocho son ___.' },
  { number: 16, word: 'dieciséis',  translation: 'sixteen',   audio: 'assets/audio/dieciseis.mp3',  context: 'Ocho más ocho son ___.' },
  { number: 17, word: 'diecisiete', translation: 'seventeen', audio: 'assets/audio/diecisiete.mp3', context: 'Diez más siete son ___.' },
  { number: 18, word: 'dieciocho',  translation: 'eighteen',  audio: 'assets/audio/dieciocho.mp3',  context: 'A los ___ años, puedes votar en Estados Unidos.' },
  { number: 19, word: 'diecinueve', translation: 'nineteen',  audio: 'assets/audio/diecinueve.mp3', context: 'Diez más nueve son ___.' },
  { number: 20, word: 'veinte',     translation: 'twenty',    audio: 'assets/audio/veinte.mp3',     context: 'Diez más diez son ___.' },
];

// ---- Set registry -------------------------------------------------------
// This hardcoded object is now only a FALLBACK — real content is fetched
// from Supabase at startup (see initApp/loadAllVocabContent) so new sets
// can be added without touching code. This stays in sync only for
// offline resilience if that fetch ever fails.
// Each set has its own id (matches the Supabase vocab_sets.id), a display
// name, and its own word list. Sets are sequential, same as levels — a
// set only unlocks once the one before it has been fully graduated in
// Matching. previousSetId is null for the first set (always unlocked).
// Each set's `activities` list controls which levels apply to it —
// Matching/Typing/Listening/Dictation/Speed are meant to be standard
// across every set; Context/Bonus/Sequence are per-set optional, since
// they don't fit every vocab category equally well (Sequence suits
// numbers/days/months but not most vocab; Context depends on whether
// good context sentences/pictures exist for that content).
let VOCAB_SETS = {
  'numbers-0-10':  {
    id: 'numbers-0-10', name: 'Numbers 0-10', words: VOCAB_SET_1, order: 0, previousSetId: null,
    activities: ['matching', 'typing', 'listening', 'dictation', 'context', 'speed', 'bonus', 'sequence'],
  },
  'numbers-11-20': {
    id: 'numbers-11-20', name: 'Numbers 11-20', words: VOCAB_SET_2, order: 1, previousSetId: 'numbers-0-10',
    activities: ['matching', 'typing', 'listening', 'dictation', 'context', 'speed', 'bonus', 'sequence'],
  },
};

let VOCAB = VOCAB_SET_1;

const PAIRS_PER_ROUND = 6;
const MIN_TYPING_QUESTIONS = 10; // minimum before "Finish for now" unlocks

// Harder modalities are worth more — recall (typing) takes more real
// knowledge than recognition (matching), so it earns more mastery points
// and coins per correct answer. Placeholder weights for the 3 modalities
// not yet built (listening, fill-in-context, speed challenge) — set them
// when each is implemented, keeping the same "harder = worth more" logic.
const MODALITY_WEIGHT = {
  matching: 1,
  typing: 2,
  listening: 3,
};

// Dictation is its own separate, harder level (unlocked after Listening
// is genuinely practiced) — type the Spanish spelling you heard, rather
// than the number. Worth more than regular listening, reflecting that.
const DICTATION_WEIGHT = 4;
const CONTEXT_WEIGHT = 5; // fill-in-context — continues the increasing scale
const SPEED_WEIGHT = 6;   // speed challenge — the hardest, final level
const SPEED_TIME_LIMIT_MS = 9000; // milliseconds to answer before it's marked wrong
const BONUS_WEIGHT = 6;   // bonus games (math facts, true/false, odd-one-out) — reward/review tier, same weight as Speed
const SEQUENCE_WEIGHT = 6; // sequence builder — same reward/review tier as Bonus

// (English translations now live directly on each vocab word — see
// VOCAB_SET_1/2 — rather than a numbers-specific lookup table, since
// non-numeric sets need translations too.)

// ---- Per-word performance memory -------------------------------------
// Tracked per ACTIVITY (mode), not shared across all of them — doing
// well on a word in Typing shouldn't quietly make it rare in Listening
// too. Persisted per student via Supabase (word_progress now has a mode
// column — see migration-per-mode-progress.sql), hydrated on load in
// initApp(), and every change is saved through markWordStatsChanged().
let wordStatsByMode = {}; // mode -> number -> { wrong: 0, correct: 0 }
function statsFor(mode, n){
  if(!wordStatsByMode[mode]) wordStatsByMode[mode] = {};
  if(!wordStatsByMode[mode][n]) wordStatsByMode[mode][n] = { wrong: 0, correct: 0 };
  return wordStatsByMode[mode][n];
}
function markWordStatsChanged(mode, number){
  const s = statsFor(mode, number);
  VocabBackend.saveWordProgress(mode, number, s.correct, s.wrong);
}

// Weighted pick: words missed more within THIS activity resurface a bit
// more often — capped, not multiplied, so a couple of struggling words
// can't crowd out the rest of the set and shrink the effective pool
// back down to just a few repeating questions.
function pickWordsForRound(count, pool, mode){
  const source = pool || VOCAB;
  const weighted = source.map(v => {
    const s = statsFor(mode, v.number);
    const weight = 1 + Math.min(s.wrong, 3); // capped nudge, not a multiplier
    return { v, weight };
  });
  const poolArr = [];
  weighted.forEach(({v, weight}) => { for(let i=0;i<weight;i++) poolArr.push(v); });

  const chosen = [];
  const seen = new Set();
  while(chosen.length < count && seen.size < source.length){
    const pick = poolArr[Math.floor(Math.random()*poolArr.length)];
    if(!seen.has(pick.number)){
      seen.add(pick.number);
      chosen.push(pick);
    }
  }
  return chosen;
}

// Continuous single-word picker (typing/listening/etc.) — avoids
// repeating any of the last few words asked, so a heavily-weighted
// struggling word can't come up several times in a row by chance.
// Falls back to allowing repeats only if the pool is too small.
const recentContinuousWords = [];
const RECENT_AVOID_COUNT = 3;
function pickNextContinuousWord(pool, mode){
  const source = (pool && pool.length) ? pool : VOCAB;
  const avoidSet = new Set(recentContinuousWords.slice(-RECENT_AVOID_COUNT));
  let candidates = source.filter(v => !avoidSet.has(v.number));
  if(candidates.length === 0) candidates = source; // pool too small — allow repeats

  const weighted = candidates.map(v => {
    const s = statsFor(mode, v.number);
    const weight = 1 + Math.min(s.wrong, 3); // capped nudge, not a multiplier — keeps the full set in real rotation
    return { v, weight };
  });
  const poolArr = [];
  weighted.forEach(({v, weight}) => { for(let i=0;i<weight;i++) poolArr.push(v); });
  const pick = poolArr[Math.floor(Math.random() * poolArr.length)];

  recentContinuousWords.push(pick.number);
  if(recentContinuousWords.length > 5) recentContinuousWords.shift();

  return pick;
}


// ---- Level unlocking + pool selection (manual level-select) -----------
// Students now pick which level to play from the always-visible level bar,
// rather than the system deciding automatically. Strictly sequential,
// same canonical order for every set — but which activities actually
// APPLY to a given set is configurable (see VOCAB_SETS[id].activities).
// Matching, Typing, Listening, Dictation, Speed are the "standard" ones
// every set is expected to offer; Context, Bonus, and Sequence are
// per-set optional (e.g. Sequence fits numbers/days/months but not most
// vocab; Context depends on whether good picture/fact content exists).
const CANONICAL_ACTIVITY_ORDER = ['matching', 'typing', 'listening', 'dictation', 'context', 'speed', 'bonus', 'sequence'];
const GRADUATION_THRESHOLD_COUNT = 3; // words needed before Typing unlocks
const modeAnsweredCounters = { typing: 0, listening: 0, dictation: 0, context: 0, speed: 0, bonus: 0, sequence: 0 };

function masteryScore(number, mode = 'matching'){
  const s = statsFor(mode, number);
  return s.correct - s.wrong;
}
function getGraduatedWords(mode = 'matching'){
  return VOCAB.filter(v => masteryScore(v.number, mode) >= 1);
}

// Which activities this set actually offers, in canonical order. Falls
// back to all of them if a set doesn't specify (keeps existing sets
// working without needing to list every activity explicitly).
function getEnabledActivities(setId){
  const set = VOCAB_SETS[setId];
  const allowed = (set && set.activities) ? set.activities : CANONICAL_ACTIVITY_ORDER;
  return CANONICAL_ACTIVITY_ORDER.filter(mode => allowed.includes(mode));
}

// Per-set override for how many questions/graduated words are needed to
// unlock the next level — falls back to the global defaults above for
// any set that doesn't specify its own (i.e. every existing set keeps
// working unchanged). Bigger sets (e.g. a full 1-100 or 1-1000 numbers
// challenge) can require a genuinely higher bar than a normal 10-20 word set.
function getUnlockThreshold(setId){
  const set = VOCAB_SETS[setId];
  return (set && set.unlockThreshold) ? set.unlockThreshold : MIN_TYPING_QUESTIONS;
}
function getGraduationThreshold(setId){
  const set = VOCAB_SETS[setId];
  return (set && set.graduationThreshold) ? set.graduationThreshold : GRADUATION_THRESHOLD_COUNT;
}

function isModeUnlocked(mode){
  if(teacherOverrideActive) return true; // whole-class activity — bypasses individual progress
  const enabled = getEnabledActivities(activeSetId);
  const idx = enabled.indexOf(mode);
  if(idx === -1) return false; // this set doesn't offer this activity at all
  if(idx === 0) return true;   // first enabled activity for this set is always open

  const prevMode = enabled[idx - 1];
  if(prevMode === 'matching') return getGraduatedWords().length >= getGraduationThreshold(activeSetId);
  return isModeUnlocked(prevMode) && modeAnsweredCounters[prevMode] >= getUnlockThreshold(activeSetId);
}
function poolForMode(mode){
  // Every level draws from the full set — the sequential unlock system
  // (isModeUnlocked) already ensures real competence before a harder
  // level opens up. Restricting the actual question pool further, to
  // only words that happened to graduate first, caused severe
  // repetition (as few as 3 words in rotation) once a student reached
  // the later levels.
  return VOCAB;
}

// ---- Badges & puzzle pieces (reward economy collectibles) ---------------
// Badges: frequent, participation-based — easy to earn, checked after
// every correct answer and every round completion. Emoji-based so no
// new art assets are needed to ship this.
const BADGE_CATALOG = [
  { id: 'first_match',    icon: '🧩', name: 'First Match',     description: 'Complete your first Matching round' },
  { id: 'first_typed',    icon: '⌨️', name: 'Typing Starter',  description: 'Answer your first Typing question' },
  { id: 'chatty_10',      icon: '💬', name: 'Getting Started', description: 'Answer 10 questions total' },
  { id: 'chatty_50',      icon: '🗣️', name: 'Chatterbox',      description: 'Answer 50 questions total' },
  { id: 'chatty_100',     icon: '📣', name: 'Century Club',    description: 'Answer 100 questions total' },
  { id: 'streak_5',       icon: '🔥', name: 'On a Roll',       description: 'Get a streak of 5 in a row' },
  { id: 'streak_10',      icon: '⚡', name: 'Unstoppable',     description: 'Get a streak of 10 in a row' },
  { id: 'explorer',       icon: '🗺️', name: 'Explorer',        description: 'Try every level in a set at least once' },
  { id: 'speed_demon',    icon: '🏎️', name: 'Speed Demon',     description: 'Complete a Speed Challenge round' },
  { id: 'coin_collector', icon: '💰', name: 'Coin Collector',  description: 'Earn 100 coins total' },
];

// Puzzle pieces: mastery-milestone-based, one per activity (beyond
// Matching) that a set offers — collecting every piece for a set
// completes that set's puzzle. Ties directly into the per-set activity
// configuration, so this automatically adapts to whichever activities
// a given set actually has.
const PUZZLE_PIECE_ICONS = { typing: '🌿', listening: '🌴', dictation: '🦋', context: '📝', speed: '⚡', bonus: '🎉', sequence: '🔢' };

// ---- Mascot skins & mystery packs -----------------------------------------
// Roster is expandable (more species can just be added to this list) —
// each species comes in 4 standard rarities, plus one special Mítico
// alebrije-style hybrid not tied to any single species. Emoji-based, so
// no custom art is needed to ship this; rarity is visually distinguished
// by border/background color on the collection grid instead.
const MASCOT_SPECIES = [
  { key: 'axolotl',  name: 'Axolote',          icon: '🦎' },
  { key: 'coqui',    name: 'Coquí',            icon: '🐸' },
  { key: 'sloth',    name: 'Perezoso',         icon: '🦥' },
  { key: 'quetzal',  name: 'Quetzal',          icon: '🦜' },
  { key: 'jaguar',   name: 'Jaguar',           icon: '🐆' },
  { key: 'capibara', name: 'Capibara',         icon: '🦫' },
  { key: 'iguana',   name: 'Iguana',           icon: '🐊' },
  { key: 'monarca',  name: 'Mariposa Monarca', icon: '🦋' },
];

const RARITY_TIERS = ['comun', 'especial', 'raro', 'legendario'];
const RARITY_LABELS = { comun: 'Común', especial: 'Especial', raro: 'Raro', legendario: 'Legendario', mitico: 'Mítico', exclusivo: 'Exclusivo' };
const RARITY_COLORS = { comun: '#9CA3AF', especial: '#2EC4B6', raro: '#4D9DE0', legendario: '#A855F7', mitico: '#FFB627', exclusivo: '#FF7DAC' };
// Weighted toward common — mítico is a genuine rare pull, not routine.
const RARITY_WEIGHTS = { comun: 60, especial: 25, raro: 10, legendario: 4, mitico: 1 };

const MASCOT_CATALOG = [];
MASCOT_SPECIES.forEach(sp => {
  RARITY_TIERS.forEach(tier => {
    MASCOT_CATALOG.push({ id: `${sp.key}_${tier}`, species: sp.name, rarity: tier, icon: sp.icon, image: `assets/mascots/${sp.key}_${tier}.jpg` });
  });
});
// Four Mítico options (not just one) — so pulling the rarest tier still
// has real variety instead of always giving the exact same result.
MASCOT_CATALOG.push({ id: 'alebrije_mitico',          species: 'Alebrije (Jaguar-Coyote)', rarity: 'mitico', icon: '🐉', image: 'assets/mascots/alebrije_mitico.jpg' });
MASCOT_CATALOG.push({ id: 'alebrije_mitico_quetzal',  species: 'Alebrije (Quetzal-Serpiente)', rarity: 'mitico', icon: '🐉', image: 'assets/mascots/alebrije_mitico_quetzal.jpg' });
MASCOT_CATALOG.push({ id: 'alebrije_mitico_jaguar',   species: 'Alebrije (Águila-Jaguar)', rarity: 'mitico', icon: '🐉', image: 'assets/mascots/alebrije_mitico_jaguar.jpg' });
MASCOT_CATALOG.push({ id: 'alebrije_mitico_axolotl',  species: 'Alebrije (Axolote-Mariposa)', rarity: 'mitico', icon: '🐉', image: 'assets/mascots/alebrije_mitico_axolotl.jpg' });

// Small ready-to-go Exclusivo presets for common occasions — teacher can
// also grant any custom name/icon beyond these via free text.
const EXCLUSIVO_PRESETS = [
  { name: 'Alebrije Navideño', icon: '🎄', image: 'assets/mascots/exclusivo_navideno.jpg' },
  { name: 'Alebrije de Primavera', icon: '🌸', image: 'assets/mascots/exclusivo_primavera.jpg' },
  { name: 'Corazón Volador', icon: '💘', image: 'assets/mascots/exclusivo_corazon.jpg' },
  { name: 'Estrella Dorada', icon: '⭐', image: 'assets/mascots/exclusivo_estrella.jpg' },
  { name: 'Calavera de Azúcar', icon: '💀', image: 'assets/mascots/exclusivo_calavera.jpg' },
  { name: 'Fiesta de Herencia Hispana', icon: '💃', image: 'assets/mascots/exclusivo_herencia.jpg' },
  { name: '¡Se Acabaron los Exámenes!', icon: '🥳', image: 'assets/mascots/exclusivo_examenes.jpg' },
];

const MASCOT_PACK_COST = 20;   // coins for a pack (also the egg-hatching cost — same economy)
const MASCOT_PACK_SIZE = 1;    // one mascot per pack — quality/anticipation over quantity, per her call
const MASCOT_DUPLICATE_REFUND = 3; // coins back if a pull is something already owned

let earnedMascots = new Set(); // mascot_id (or exclusivo's generated id)
let earnedExclusivos = []; // full rows for Exclusivo grants — not in MASCOT_CATALOG, so kept separately

function pickRandomMascotByWeight(){
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  let chosenRarity = 'comun';
  for(const tier of Object.keys(RARITY_WEIGHTS)){
    cumulative += RARITY_WEIGHTS[tier];
    if(roll <= cumulative){ chosenRarity = tier; break; }
  }
  const candidates = MASCOT_CATALOG.filter(m => m.rarity === chosenRarity);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function openMysteryPack(){
  if(coins < MASCOT_PACK_COST) return null;
  coins -= MASCOT_PACK_COST;
  VocabBackend.saveCoins(coins);

  const results = [];
  for(let i = 0; i < MASCOT_PACK_SIZE; i++){
    const picked = pickRandomMascotByWeight();
    const isDuplicate = earnedMascots.has(picked.id);
    if(isDuplicate){
      coins += MASCOT_DUPLICATE_REFUND;
      VocabBackend.saveCoins(coins);
    } else {
      earnedMascots.add(picked.id);
      VocabBackend.saveMascot(picked.id, picked.rarity, picked.species, picked.icon);
    }
    results.push({ ...picked, duplicate: isDuplicate });
  }
  coinValueEl.textContent = coins;
  return results;
}

let earnedBadges = new Set();
let earnedPuzzlePieces = new Set(); // stored as "setId:pieceId"

function checkAndAwardBadge(badgeId){
  if(earnedBadges.has(badgeId)) return;
  earnedBadges.add(badgeId);
  VocabBackend.awardBadge(badgeId);
  const badge = BADGE_CATALOG.find(b => b.id === badgeId);
  if(badge) showToast(`${badge.icon} ¡Nueva insignia! ${badge.name}`);
}

function checkAllBadges(){
  const totalAnswered = Object.values(modeAnsweredCounters).reduce((a, b) => a + b, 0);
  if(totalAnswered >= 10) checkAndAwardBadge('chatty_10');
  if(totalAnswered >= 50) checkAndAwardBadge('chatty_50');
  if(totalAnswered >= 100) checkAndAwardBadge('chatty_100');
  if(modeAnsweredCounters.typing >= 1) checkAndAwardBadge('first_typed');
  if(modeAnsweredCounters.speed >= 1) checkAndAwardBadge('speed_demon');
  if(state.streak >= 5) checkAndAwardBadge('streak_5');
  if(state.streak >= 10) checkAndAwardBadge('streak_10');
  if(coins >= 100) checkAndAwardBadge('coin_collector');

  const enabled = getEnabledActivities(activeSetId);
  const triedEveryLevel = enabled.every(mode =>
    mode === 'matching' ? getGraduatedWords().length > 0 : modeAnsweredCounters[mode] >= 1
  );
  if(triedEveryLevel) checkAndAwardBadge('explorer');

  checkPuzzlePieces();
}

// One themed trophy per vocabulary set — awarded when every puzzle piece
// for that set has been collected. Reuses the badge backend (a set trophy
// is just a global one-time achievement, same as any other badge) so no
// new table is needed. Falls back to a generic trophy image if a future
// set doesn't have custom art yet.
const SET_TROPHIES = {
  'numbers-0-10':  { name: 'Numbers 0-10 Trophy',  image: 'assets/trophies/set_numbers-0-10.jpg' },
  'numbers-11-20': { name: 'Numbers 11-20 Trophy', image: 'assets/trophies/set_numbers-11-20.jpg' },
  'numbers-tens-10-100':      { name: 'Numbers by Tens Trophy',    image: 'assets/trophies/set_numbers-tens-10-100.jpg' },
  'numbers-hundreds-100-1m':  { name: 'Numbers to a Million Trophy', image: 'assets/trophies/set_numbers-hundreds-100-1m.jpg' },
  'days-of-week':   { name: 'Days of the Week Trophy',  image: 'assets/trophies/set_days-of-week.jpg' },
  'months-of-year': { name: 'Months of the Year Trophy', image: 'assets/trophies/set_months-of-year.jpg' },
  'numbers-1-100':  { name: 'Centurión de los Números', image: 'assets/trophies/set_numbers-1-100.jpg' },
  'numbers-1-1000': { name: 'Maestro del Milenio',       image: 'assets/trophies/set_numbers-1-1000.jpg' },
  'colors': { name: 'Trofeo de Colores', image: 'assets/trophies/set_colors.jpg' },
  'weather': { name: 'Trofeo del Tiempo', image: 'assets/trophies/set_weather.jpg' },
  'emotions': { name: 'Trofeo de las Emociones', image: 'assets/trophies/set_emotions.jpg' },
};
const GENERIC_SET_TROPHY_IMAGE = 'assets/trophies/set_generic.jpg';

function checkPuzzlePieces(){
  const enabled = getEnabledActivities(activeSetId).filter(mode => mode !== 'matching');
  enabled.forEach(mode => {
    const key = `${activeSetId}:${mode}`;
    if(earnedPuzzlePieces.has(key)) return;
    if(isModeUnlocked(mode)){
      earnedPuzzlePieces.add(key);
      VocabBackend.awardPuzzlePiece(activeSetId, mode);
      showToast(`${PUZZLE_PIECE_ICONS[mode] || '\u2728'} \u00a1Pieza de rompecabezas ganada!`);
      if(enabled.every(m => earnedPuzzlePieces.has(`${activeSetId}:${m}`))){
        const badgeId = `set_trophy_${activeSetId}`;
        if(!earnedBadges.has(badgeId)){
          earnedBadges.add(badgeId);
          VocabBackend.awardBadge(badgeId);
          const trophyName = SET_TROPHIES[activeSetId] ? SET_TROPHIES[activeSetId].name : `${VOCAB_SETS[activeSetId].name} Trophy`;
          showToast(`\ud83c\udfc6 \u00a1Trofeo ganado! ${trophyName}`);
        }
      }
    }
  });
}

// ---- Render vocab as an image, not selectable text --------------------
// Defeats browser translate extensions and blocks simple copy/paste,
// per the cheating-prevention design decision.
//
// IMPORTANT: this is size-aware. It measures the ACTUAL card box the
// browser rendered (which varies by screen width / column count) and
// draws the text to exactly fill it, auto-shrinking the font until the
// word fits on one line. A fixed guessed size was the earlier bug —
// on a smaller card that guess was too big and got visually cropped.
const FONT_READY = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();

function createWordCanvas(){
  // Returns an unsized <canvas>; call fitWordCanvas() once it's in the DOM
  // and has a real box size to measure.
  return document.createElement('canvas');
}

function fitWordCanvas(canvas, text, boxWidth, boxHeight){
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(boxWidth * scale));
  canvas.height = Math.max(1, Math.round(boxHeight * scale));
  canvas.style.width = boxWidth + 'px';
  canvas.style.height = boxHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, boxWidth, boxHeight);
  ctx.fillStyle = '#0A2B2C';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const paddingX = Math.max(6, boxWidth * 0.08);
  const maxWidth = boxWidth - paddingX * 2;

  // Auto-shrink: start generous, step down until the word fits on one
  // line. Words here are short (max ~7 letters) so this always resolves
  // well above a readable floor.
  let fontSize = Math.round(boxHeight * 0.42);
  const minFontSize = 12;
  ctx.font = `700 ${fontSize}px "Baloo 2", sans-serif`;
  while(fontSize > minFontSize && ctx.measureText(text).width > maxWidth){
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px "Baloo 2", sans-serif`;
  }

  ctx.fillText(text, boxWidth / 2, boxHeight / 2);
}

// Sentence version of the above — same anti-translation image-rendering
// approach, but word-wraps across multiple lines to fit a full sentence
// (used by fill-in-context) rather than a single short word/digit.
function fitSentenceCanvas(canvas, text, boxWidth, boxHeight){
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(boxWidth * scale));
  canvas.height = Math.max(1, Math.round(boxHeight * scale));
  canvas.style.width = boxWidth + 'px';
  canvas.style.height = boxHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, boxWidth, boxHeight);
  ctx.fillStyle = '#0A2B2C';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const paddingX = Math.max(10, boxWidth * 0.08);
  const maxWidth = boxWidth - paddingX * 2;
  const words = text.split(' ');

  function wrapAt(fontSize){
    ctx.font = `700 ${fontSize}px "Baloo 2", sans-serif`;
    const lines = [];
    let current = '';
    words.forEach(word => {
      const trial = current ? current + ' ' + word : word;
      if(ctx.measureText(trial).width > maxWidth && current){
        lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    });
    if(current) lines.push(current);
    return lines;
  }

  // Auto-shrink: start generous, step down until the wrapped lines fit
  // within the box height.
  let fontSize = Math.round(boxHeight * 0.16);
  const minFontSize = 14;
  let lines = wrapAt(fontSize);
  const lineHeightOf = fs => fs * 1.35;
  while(fontSize > minFontSize && lines.length * lineHeightOf(fontSize) > boxHeight * 0.92){
    fontSize -= 2;
    lines = wrapAt(fontSize);
  }

  ctx.font = `700 ${fontSize}px "Baloo 2", sans-serif`;
  const lineHeight = lineHeightOf(fontSize);
  const totalHeight = lines.length * lineHeight;
  const startY = boxHeight / 2 - totalHeight / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, boxWidth / 2, startY + i * lineHeight);
  });
}

// After web fonts finish loading, re-draw every card-front canvas so the
// real typeface (not a fallback) is used for final measurement + paint.
function refitAllCanvases(){
  document.querySelectorAll('.card-front').forEach(front => {
    const canvas = front.querySelector('canvas');
    if(!canvas) return;
    const text = canvas.dataset.text;
    const rect = front.getBoundingClientRect();
    const cs = getComputedStyle(front);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const boxWidth = rect.width - padX;
    const boxHeight = rect.height - padY;
    if(boxWidth > 0 && boxHeight > 0){
      fitWordCanvas(canvas, text, boxWidth, boxHeight);
    }
  });
}
FONT_READY.then(refitAllCanvases);
window.addEventListener('resize', () => {
  clearTimeout(window.__vocabResizeT);
  window.__vocabResizeT = setTimeout(refitAllCanvases, 150);
});

// ---- Tab-switch detection (mastery guard) ------------------------------
// Per design decision: a tab-switch still counts as participation
// (the student saw the card), but the resulting match will NOT count
// toward mastery — closes the "screenshot -> Google Lens" loophole.
let tabSwitchedDuringRound = false;
document.addEventListener('visibilitychange', () => {
  if(document.hidden && state.screen === 'game'){
    tabSwitchedDuringRound = true;
  }
});

// ---- Coins ---------------------------------------------------------------
let coins = 0;
const coinValueEl = document.getElementById('coinValue');
const coinCounterEl = document.getElementById('coinCounter');
function earnCoins(amount){
  coins += amount;
  state.roundCoinsEarned = (state.roundCoinsEarned || 0) + amount;
  coinValueEl.textContent = coins;
  coinCounterEl.classList.add('bump');
  setTimeout(()=>coinCounterEl.classList.remove('bump'), 180);
  VocabBackend.saveCoins(coins);
  checkAllBadges();
}

// Logs one answer event for the class competition leaderboard — every
// attempt counts toward participation; points only get logged on a
// correct, mastery-counting answer (review-halved points included).
function logCompetitionActivity(isCorrect, points){
  VocabBackend.logActivity(activeSetId, state.mode, isCorrect, isCorrect ? (points || 0) : 0);
}

// ---- Listening modality: audio playback -----------------------------------
// Prefers a real generated audio file (uniform quality, works the same on
// every device) — falls back to the browser's built-in speech synthesis
// only if a word has no audio file yet (e.g. future vocab not recorded).
const audioCache = {};
function getAudioFor(word){
  if(!word.audio) return null;
  if(!audioCache[word.number]){
    audioCache[word.number] = new Audio(word.audio);
  }
  return audioCache[word.number];
}

function playWordAudio(word){
  const audioEl = getAudioFor(word);
  if(audioEl){
    audioEl.currentTime = 0;
    audioEl.play().catch(() => {
      // Playback blocked/failed (e.g. file missing) — fall back to TTS.
      speakSpanish(word.word);
    });
    return true;
  }
  return speakSpanish(word.word);
}

// ---- Fallback: browser text-to-speech (Web Speech API) --------------------
// Only used for words that don't have a real audio file yet.
function speakSpanish(text){
  if(!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel(); // stop any overlapping previous utterance
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-ES';
  utterance.rate = 0.85; // slightly slower — easier for learners to catch
  window.speechSynthesis.speak(utterance);
  return true;
}

// ---- App state -------------------------------------------------------
const state = {
  screen: 'start',
  mode: 'matching',       // 'matching' | 'typing' for the current round
  roundWords: [],
  roundTotal: 0,          // used by matching only; typing is open-ended
  roundCoinsEarned: 0,
  matchedCount: 0,
  wrongAttempts: 0,
  correctAttempts: 0,
  streak: 0,
  openCard: null,   // currently flipped, unmatched card (matching mode)
  lock: false,      // input lock during resolve animation
  typingPool: [],           // word pool this typing session draws from
  typingQuestionCount: 0,   // how many questions answered so far (open-ended)
  currentTypingWord: null,  // the word currently being asked
  typingPromptKind: 'number', // what's shown: 'number' -> answer word, or 'word' -> answer number
  bonusFormat: null,  // 'mathfacts' | 'truefalse' | 'oddoneout' | 'riddle' — current bonus sub-format
  tfIsTrue: null,     // true/false format: is the shown statement correct?
  sequenceTarget: [],       // sequence builder: words sorted into correct order
  sequenceProgress: 0,      // how many tiles placed correctly so far
  sequenceMistakeMade: false, // any out-of-order taps this round?
};

// ---- DOM refs ----------------------------------------------------------
const screens = {
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  complete: document.getElementById('screen-complete'),
  setup: document.getElementById('screen-setup'),
  leaderboard: document.getElementById('screen-leaderboard'),
  ambient: document.getElementById('screen-ambient'),
  collection: document.getElementById('screen-collection'),
};
const board = document.getElementById('board');
const typingPanel = document.getElementById('typingPanel');
const typingPrompt = document.getElementById('typingPrompt');
const contextImage = document.getElementById('contextImage');
const speedTimerTrack = document.getElementById('speedTimerTrack');
const speedTimerFill = document.getElementById('speedTimerFill');
const tfButtons = document.getElementById('tfButtons');
const btnTfYes = document.getElementById('btnTfYes');
const btnTfNo = document.getElementById('btnTfNo');
const oddOneOutGrid = document.getElementById('oddOneOutGrid');
const sequenceRow = document.getElementById('sequenceRow');
const typingInstruction = document.getElementById('typingInstruction');
const typingForm = document.getElementById('typingForm');
const typingInput = document.getElementById('typingInput');
const typingFeedback = document.getElementById('typingFeedback');
const listeningControls = document.getElementById('listeningControls');
const btnPlayAudio = document.getElementById('btnPlayAudio');
const finishHint = document.getElementById('finishHint');
const btnFinishTyping = document.getElementById('btnFinishTyping');
const modeLabelEl = document.getElementById('modeLabel');
const progressFill = document.getElementById('progressFill');
const progressTrackEl = document.getElementById('progressTrack');
const pairsLeftEl = document.getElementById('pairsLeft');
const streakLabelEl = document.getElementById('streakLabel');
const toastEl = document.getElementById('toast');
const levelSelectEl = document.getElementById('levelSelect');
const setSelectEl = document.getElementById('setSelect');
const setCurrentBtn = document.getElementById('setCurrentBtn');
const setCurrentName = document.getElementById('setCurrentName');
const setReviewBadge = document.getElementById('setReviewBadge');
const setAssignedBadge = document.getElementById('setAssignedBadge');
const setDropdown = document.getElementById('setDropdown');
let activeSetId = VocabBackend.DEFAULT_SET_ID;
let assignedSetId = null; // teacher-assigned set for this student's class period, if any
let teacherOverrideActive = false; // whole-class activity mode — bypasses individual unlock progress
const levelButtons = {
  matching: document.getElementById('levelBtnMatching'),
  typing: document.getElementById('levelBtnTyping'),
  listening: document.getElementById('levelBtnListening'),
  dictation: document.getElementById('levelBtnDictation'),
  context: document.getElementById('levelBtnContext'),
  speed: document.getElementById('levelBtnSpeed'),
  bonus: document.getElementById('levelBtnBonus'),
  sequence: document.getElementById('levelBtnSequence'),
};

function updateLevelSelect(){
  const enabled = getEnabledActivities(activeSetId);
  Object.entries(levelButtons).forEach(([mode, btn]) => {
    const offeredByThisSet = enabled.includes(mode);
    btn.hidden = !offeredByThisSet;
    if(!offeredByThisSet) return;
    const unlocked = isModeUnlocked(mode);
    btn.disabled = !unlocked;
    btn.classList.toggle('is-active', state.mode === mode);
  });
}

// ---- Set switching -------------------------------------------------------
// Sets are sequential, same as levels: a set only unlocks once the one
// before it has been fully graduated in Matching. Renders one option per
// registered set in the dropdown; clicking an unlocked, non-active set
// swaps VOCAB, resets in-memory progress, and re-hydrates from the
// backend for that set specifically.
async function isSetUnlocked(setId){
  if(teacherOverrideActive) return true;
  const set = VOCAB_SETS[setId];
  if(!set || !set.previousSetId) return true; // first set is always open
  return VocabBackend.isSetFullyGraduated(set.previousSetId);
}

// ---- Recency-based scoring -------------------------------------------
// Working on your "frontier" set (the most advanced one you've unlocked)
// pays full points. Going back to review an earlier, already-passed set
// still works in every modality, but pays reduced points — review is
// always available and rewarded, just never as profitable as moving
// forward, per her design.
const REVIEW_MULTIPLIER = 0.5;
let isReviewSet = false;

async function updateReviewStatus(){
  const orderedSets = Object.values(VOCAB_SETS).sort((a, b) => a.order - b.order);
  const unlockResults = await Promise.all(orderedSets.map(set => isSetUnlocked(set.id)));
  let frontierOrder = 0;
  orderedSets.forEach((set, i) => {
    if(unlockResults[i]) frontierOrder = set.order;
  });
  const activeOrder = VOCAB_SETS[activeSetId] ? VOCAB_SETS[activeSetId].order : 0;
  isReviewSet = activeOrder < frontierOrder;
  // The assigned set is what a student is expected to be working toward —
  // it always pays full points even if they've technically moved past it
  // in raw sequence order (e.g. a fast student who got further ahead).
  if(assignedSetId && activeSetId === assignedSetId) isReviewSet = false;
  setReviewBadge.hidden = !isReviewSet;
  setAssignedBadge.hidden = !(assignedSetId && activeSetId === assignedSetId);
}

function applyReviewMultiplier(points){
  return isReviewSet ? Math.max(1, Math.round(points * REVIEW_MULTIPLIER)) : points;
}

async function renderSetSelect(){
  const activeSet = VOCAB_SETS[activeSetId];
  setCurrentName.textContent = activeSet ? activeSet.name : activeSetId;

  const orderedSets = Object.values(VOCAB_SETS).sort((a, b) => a.order - b.order);
  const unlockResults = await Promise.all(orderedSets.map(set => isSetUnlocked(set.id)));

  setDropdown.innerHTML = '';
  orderedSets.forEach((set, i) => {
    const unlocked = unlockResults[i];
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'set-option';
    opt.setAttribute('role', 'option');
    opt.disabled = !unlocked;
    opt.classList.toggle('is-active', set.id === activeSetId);
    const assignedTag = (assignedSetId && set.id === assignedSetId)
      ? ' <span class="set-option-assigned">Assigned</span>'
      : '';
    opt.innerHTML = unlocked
      ? `${set.name}${assignedTag}`
      : `${set.name}${assignedTag} <span class="set-option-lock" aria-hidden="true">🔒</span>`;
    opt.addEventListener('click', () => {
      if(!unlocked) return;
      closeSetDropdown();
      if(set.id !== activeSetId) switchToSet(set.id);
    });
    setDropdown.appendChild(opt);
  });
}

function openSetDropdown(){
  setDropdown.hidden = false;
  setCurrentBtn.classList.add('is-open');
  setCurrentBtn.setAttribute('aria-expanded', 'true');
}
function closeSetDropdown(){
  setDropdown.hidden = true;
  setCurrentBtn.classList.remove('is-open');
  setCurrentBtn.setAttribute('aria-expanded', 'false');
}
setCurrentBtn.addEventListener('click', () => {
  if(setDropdown.hidden) openSetDropdown(); else closeSetDropdown();
});
document.addEventListener('click', (e) => {
  if(!setDropdown.hidden && !setSelectEl.contains(e.target)) closeSetDropdown();
});

async function switchToSet(setId){
  const set = VOCAB_SETS[setId];
  if(!set) return;

  activeSetId = setId;
  VOCAB = set.words;

  // Reset in-memory tracking — the backend holds the real per-set
  // history, so this just clears the stale copy before re-hydrating.
  wordStatsByMode = {};
  Object.keys(modeAnsweredCounters).forEach(mode => { modeAnsweredCounters[mode] = 0; });
  recentContinuousWords.length = 0;

  await hydrateFromBackend();
  await updateReviewStatus();
  await renderSetSelect();
}

Object.entries(levelButtons).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => startRound(mode));
});

// ---- Class competition leaderboard ---------------------------------------
const btnLeaderboard = document.getElementById('btnLeaderboard');
const btnCloseLeaderboard = document.getElementById('btnCloseLeaderboard');
const leaderboardList = document.getElementById('leaderboardList');

btnLeaderboard.addEventListener('click', async () => {
  showScreen('leaderboard');
  leaderboardTab = 'level';
  document.getElementById('tabLevelBracket').classList.add('is-active');
  document.getElementById('tabOverall').classList.remove('is-active');
  await renderLeaderboard();
});
btnCloseLeaderboard.addEventListener('click', () => showScreen('start'));

document.getElementById('tabLevelBracket').addEventListener('click', async () => {
  leaderboardTab = 'level';
  document.getElementById('tabLevelBracket').classList.add('is-active');
  document.getElementById('tabOverall').classList.remove('is-active');
  await renderLeaderboard();
});
document.getElementById('tabOverall').addEventListener('click', async () => {
  leaderboardTab = 'overall';
  document.getElementById('tabOverall').classList.add('is-active');
  document.getElementById('tabLevelBracket').classList.remove('is-active');
  await renderLeaderboard();
});

// ---- Collection (badges + puzzle pieces) ----------------------------------
const btnCollection = document.getElementById('btnCollection');
const btnCloseCollection = document.getElementById('btnCloseCollection');
const badgeGrid = document.getElementById('badgeGrid');
const puzzleGrid = document.getElementById('puzzleGrid');
const puzzleSetLabel = document.getElementById('puzzleSetLabel');
const puzzleCompleteNote = document.getElementById('puzzleCompleteNote');
const setTrophyGrid = document.getElementById('setTrophyGrid');
const mascotGrid = document.getElementById('mascotGrid');
const btnOpenPack = document.getElementById('btnOpenPack');
const packReveal = document.getElementById('packReveal');

btnCollection.addEventListener('click', () => {
  showScreen('collection');
  renderCollection();
});
btnCloseCollection.addEventListener('click', () => showScreen('start'));

btnOpenPack.addEventListener('click', () => {
  const isFirstHatch = earnedMascots.size === 0;
  const results = openMysteryPack();
  if(!results) return;

  packReveal.innerHTML = '';
  packReveal.hidden = false;
  results.forEach(mascot => {
    const el = document.createElement('div');
    el.className = 'pack-reveal-item';
    el.style.borderColor = RARITY_COLORS[mascot.rarity];
    const headline = isFirstHatch && !mascot.duplicate
      ? '🥚 ¡Abriste tu huevo!'
      : (mascot.duplicate ? '' : '');
    el.innerHTML = `
      ${headline ? `<span class="pack-reveal-hatch">${headline}</span>` : ''}
      <img src="${mascot.image}" alt="${mascot.species}" />
      <span class="pack-reveal-name" style="color:${RARITY_COLORS[mascot.rarity]}">${mascot.species} \u00b7 ${RARITY_LABELS[mascot.rarity]}</span>
      ${mascot.duplicate ? `<span class="pack-reveal-dupe">Duplicate +${MASCOT_DUPLICATE_REFUND}</span>` : ''}
    `;
    packReveal.appendChild(el);
  });

  renderCollection();
});

function renderCollection(){
  badgeGrid.innerHTML = '';
  BADGE_CATALOG.forEach(badge => {
    const earned = earnedBadges.has(badge.id);
    const el = document.createElement('div');
    el.className = 'badge-item' + (earned ? ' is-earned' : ' is-locked');
    el.title = badge.description;
    el.innerHTML = `${badge.icon}<span class="badge-item-name">${badge.name}</span>`;
    badgeGrid.appendChild(el);
  });

  const activeSet = VOCAB_SETS[activeSetId];
  puzzleSetLabel.textContent = `Puzzle: ${activeSet ? activeSet.name : activeSetId}`;
  const pieces = getEnabledActivities(activeSetId).filter(mode => mode !== 'matching');

  puzzleGrid.innerHTML = '';
  pieces.forEach(mode => {
    const earned = earnedPuzzlePieces.has(`${activeSetId}:${mode}`);
    const el = document.createElement('div');
    el.className = 'puzzle-piece' + (earned ? ' is-earned' : ' is-locked');
    el.textContent = PUZZLE_PIECE_ICONS[mode] || '\u2728';
    puzzleGrid.appendChild(el);
  });

  const allEarned = pieces.length > 0 && pieces.every(mode => earnedPuzzlePieces.has(`${activeSetId}:${mode}`));
  puzzleCompleteNote.hidden = !allEarned;

  setTrophyGrid.innerHTML = '';
  Object.values(VOCAB_SETS).sort((a, b) => a.order - b.order).forEach(set => {
    const trophy = SET_TROPHIES[set.id];
    const isEarned = earnedBadges.has(`set_trophy_${set.id}`);
    const el = document.createElement('div');
    el.className = 'mascot-item' + (isEarned ? '' : ' is-locked');
    el.title = trophy ? trophy.name : `${set.name} Trophy`;
    el.innerHTML = `<img src="${trophy ? trophy.image : GENERIC_SET_TROPHY_IMAGE}" alt="${set.name} trophy" loading="lazy" />`;
    setTrophyGrid.appendChild(el);
  });

  mascotGrid.innerHTML = '';
  MASCOT_CATALOG.forEach(mascot => {
    mascotGrid.appendChild(buildMascotTile(mascot, earnedMascots.has(mascot.id)));
  });
  btnOpenPack.disabled = coins < MASCOT_PACK_COST;
  btnOpenPack.innerHTML = earnedMascots.size === 0
    ? `🥚 Hatch Your Egg (${MASCOT_PACK_COST} <span class="coin-icon">●</span>)`
    : `🎁 Open Mystery Pack (${MASCOT_PACK_COST} <span class="coin-icon">●</span>)`;

  const exclusivoSection = document.getElementById('exclusivoSection');
  const exclusivoGrid = document.getElementById('exclusivoGrid');
  exclusivoSection.hidden = earnedExclusivos.length === 0;
  if(earnedExclusivos.length > 0){
    exclusivoGrid.innerHTML = '';
    earnedExclusivos.forEach(row => {
      const el = document.createElement('div');
      el.className = 'mascot-item';
      el.style.borderColor = RARITY_COLORS.exclusivo;
      el.title = row.species;
      el.innerHTML = row.image_url
        ? `<img src="${row.image_url}" alt="${row.species}" loading="lazy" />`
        : `<span style="font-size:2rem;">${row.icon}</span>`;
      exclusivoGrid.appendChild(el);
    });
  }
}

function buildMascotTile(mascot, isEarned){
  const el = document.createElement('div');
  el.className = 'mascot-item' + (isEarned ? '' : ' is-locked');
  el.style.borderColor = RARITY_COLORS[mascot.rarity] || 'rgba(255,255,255,0.12)';
  el.title = `${mascot.species} \u00b7 ${RARITY_LABELS[mascot.rarity]}`;
  el.innerHTML = `<img src="${mascot.image}" alt="${mascot.species}" loading="lazy" /><span class="mascot-item-rarity" style="color:${RARITY_COLORS[mascot.rarity]}">${RARITY_LABELS[mascot.rarity]}</span>`;
  return el;
}

let leaderboardTab = 'level'; // 'level' | 'overall'

async function renderLeaderboard(){
  leaderboardList.innerHTML = '<p class="leaderboard-empty">Loading...</p>';

  const period = await VocabBackend.getCompetitionPeriod();
  if(period){
    document.getElementById('leaderboardPeriodLabel').textContent =
      `${period.label} (${period.period_start} to ${period.period_end})`;
  }

  const profile = await VocabBackend.getStudentProfile();
  const myClassPeriod = profile ? profile.class_period : null;
  const myClassLevel = profile ? profile.class_level : null;

  const tabNote = document.getElementById('leaderboardTabNote');
  let standings;
  if(leaderboardTab === 'overall'){
    tabNote.textContent = 'All levels \u00b7 ranked by participation + accuracy (not raw points, so every level competes fairly)';
    standings = await VocabBackend.getOverallCrossLevelLeaderboard();
  } else {
    tabNote.textContent = myClassLevel
      ? `Same class level (${myClassLevel}) \u00b7 ranked by participation + mastery points`
      : 'Ranked by participation + mastery points';
    const all = await VocabBackend.getClassLeaderboard();
    standings = myClassLevel ? all.filter(row => row.class_level === myClassLevel) : all;
  }

  if(standings.length === 0){
    leaderboardList.innerHTML = '<p class="leaderboard-empty">No class activity yet this period.</p>';
    return;
  }

  // Anonymize every class except the viewer's own — shows real relative
  // standing without exposing which other teacher's/class's data it is.
  let anonCount = 0;
  const ANON_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  leaderboardList.innerHTML = '';
  standings.forEach((row, i) => {
    const isMine = myClassPeriod && row.class_period === myClassPeriod;
    const displayName = isMine ? row.class_period : `Class ${ANON_LETTERS[anonCount++] || anonCount}`;
    const detail = leaderboardTab === 'overall'
      ? `${Math.round(row.avg_participation_this_week)} avg questions &middot; ${row.avg_accuracy_this_week != null ? Math.round(row.avg_accuracy_this_week) : '\u2014'}% avg accuracy`
      : `${Math.round(row.avg_participation_this_week)} avg questions &middot; ${Math.round(row.avg_mastery_this_week)} avg mastery pts`;

    const el = document.createElement('div');
    el.className = 'leaderboard-row' + (i === 0 ? ' is-first' : '') + (isMine ? ' is-mine' : '');
    const trophyImg = i === 0
      ? `<img class="leaderboard-trophy" src="assets/trophies/${leaderboardTab === 'overall' ? 'trophy_overall.jpg' : 'trophy_level.jpg'}" alt="Trophy" />`
      : `<span class="leaderboard-rank">#${i + 1}</span>`;
    el.innerHTML = `
      ${trophyImg}
      <span class="leaderboard-info">
        <span class="leaderboard-class">${displayName}${isMine ? ' (you)' : ''}</span><br>
        <span class="leaderboard-detail">${detail}</span>
      </span>
      <span class="leaderboard-score">${Math.round(row.combined_score)}</span>
    `;
    leaderboardList.appendChild(el);
  });
}

// ---- Teacher override / class-activity-mode -------------------------------
// A hidden long-press on the mascot icon opens a passcode-gated panel.
// Once entered, every level (and set) unlocks for this browser session
// only — meant for a teacher running a whole-class activity, not a
// permanent change. Change TEACHER_OVERRIDE_PASSCODE below to whatever
// you want it to be.
const TEACHER_OVERRIDE_PASSCODE = '4242';
const LONG_PRESS_MS = 1200;

const brandTeacherTrigger = document.getElementById('brandTeacherTrigger');
const teacherOverlay = document.getElementById('teacherOverlay');
const teacherPasscodeStep = document.getElementById('teacherPasscodeStep');
const teacherActiveStep = document.getElementById('teacherActiveStep');
const teacherPasscodeInput = document.getElementById('teacherPasscodeInput');
const teacherPasscodeError = document.getElementById('teacherPasscodeError');
const teacherOverrideBadge = document.getElementById('teacherOverrideBadge');

let longPressTimer = null;
function startLongPress(){
  longPressTimer = setTimeout(openTeacherOverlay, LONG_PRESS_MS);
}
function cancelLongPress(){
  clearTimeout(longPressTimer);
}
brandTeacherTrigger.addEventListener('pointerdown', startLongPress);
brandTeacherTrigger.addEventListener('pointerup', cancelLongPress);
brandTeacherTrigger.addEventListener('pointerleave', cancelLongPress);

function openTeacherOverlay(){
  teacherOverlay.hidden = false;
  if(teacherOverrideActive){
    teacherPasscodeStep.hidden = true;
    teacherActiveStep.hidden = false;
    teacherDashboardStep.hidden = true;
    teacherAssignStep.hidden = true;
    teacherGradingStep.hidden = true;
    teacherPeriodStep.hidden = true;
    teacherPrizeStep.hidden = true;
    teacherExclusiveStep.hidden = true;
  } else {
    teacherPasscodeStep.hidden = false;
    teacherActiveStep.hidden = true;
    teacherDashboardStep.hidden = true;
    teacherAssignStep.hidden = true;
    teacherGradingStep.hidden = true;
    teacherPeriodStep.hidden = true;
    teacherPrizeStep.hidden = true;
    teacherExclusiveStep.hidden = true;
    teacherPasscodeInput.value = '';
    teacherPasscodeError.textContent = '';
  }
}
function closeTeacherOverlay(){
  teacherOverlay.hidden = true;
}

document.getElementById('btnTeacherSubmit').addEventListener('click', () => {
  if(teacherPasscodeInput.value === TEACHER_OVERRIDE_PASSCODE){
    teacherOverrideActive = true;
    teacherOverrideBadge.hidden = false;
    teacherPasscodeStep.hidden = true;
    teacherActiveStep.hidden = false;
    updateLevelSelect();
    renderSetSelect();
  } else {
    teacherPasscodeError.textContent = 'Incorrect passcode.';
  }
});
document.getElementById('btnTeacherCancel').addEventListener('click', closeTeacherOverlay);
document.getElementById('btnTeacherClose').addEventListener('click', closeTeacherOverlay);
document.getElementById('btnTeacherOff').addEventListener('click', () => {
  teacherOverrideActive = false;
  teacherOverrideBadge.hidden = true;
  updateLevelSelect();
  renderSetSelect();
  closeTeacherOverlay();
});

// ---- Teacher dashboard (part of the same passcode-gated panel) -----------
const teacherDashboardStep = document.getElementById('teacherDashboardStep');
const dashboardClassPeriodInput = document.getElementById('dashboardClassPeriodInput');
const dashboardList = document.getElementById('dashboardList');

document.getElementById('btnOpenDashboard').addEventListener('click', async () => {
  teacherActiveStep.hidden = true;
  teacherDashboardStep.hidden = false;
  const profile = await VocabBackend.getStudentProfile();
  if(profile && profile.class_period && !dashboardClassPeriodInput.value){
    dashboardClassPeriodInput.value = profile.class_period;
  }
});
document.getElementById('btnDashboardBack').addEventListener('click', () => {
  teacherDashboardStep.hidden = true;
  teacherActiveStep.hidden = false;
});

// ---- Set assignment (part of the same passcode-gated panel) --------------
const teacherAssignStep = document.getElementById('teacherAssignStep');
const assignTargetType = document.getElementById('assignTargetType');
const assignClassPeriodInput = document.getElementById('assignClassPeriodInput');
const assignClassLevelInput = document.getElementById('assignClassLevelInput');
const assignSetSelect = document.getElementById('assignSetSelect');
const assignFeedback = document.getElementById('assignFeedback');

document.getElementById('btnOpenAssign').addEventListener('click', async () => {
  teacherActiveStep.hidden = true;
  teacherAssignStep.hidden = false;
  assignFeedback.textContent = '';
  assignFeedback.className = 'typing-feedback';
  const profile = await VocabBackend.getStudentProfile();
  if(profile && profile.class_period && !assignClassPeriodInput.value){
    assignClassPeriodInput.value = profile.class_period;
  }
  if(profile && profile.class_level && !assignClassLevelInput.value){
    assignClassLevelInput.value = profile.class_level;
  }
  assignSetSelect.innerHTML = '';
  Object.values(VOCAB_SETS).sort((a, b) => a.order - b.order).forEach(set => {
    const opt = document.createElement('option');
    opt.value = set.id;
    opt.textContent = set.name;
    assignSetSelect.appendChild(opt);
  });
});
assignTargetType.addEventListener('change', () => {
  const isLevel = assignTargetType.value === 'level';
  assignClassPeriodInput.hidden = isLevel;
  assignClassLevelInput.hidden = !isLevel;
});
document.getElementById('btnAssignBack').addEventListener('click', () => {
  teacherAssignStep.hidden = true;
  teacherActiveStep.hidden = false;
});
document.getElementById('btnSubmitAssign').addEventListener('click', async () => {
  const isLevel = assignTargetType.value === 'level';
  const classPeriod = isLevel ? null : assignClassPeriodInput.value.trim();
  const classLevel = isLevel ? assignClassLevelInput.value.trim() : null;
  const setId = assignSetSelect.value;
  const target = isLevel ? classLevel : classPeriod;
  if(!target || !setId) return;
  const ok = await VocabBackend.setClassAssignment(classPeriod, classLevel, setId);
  assignFeedback.textContent = ok
    ? `${VOCAB_SETS[setId].name} is now assigned to ${isLevel ? 'every ' + target + ' section' : target}.`
    : 'Something went wrong — try again.';
  assignFeedback.className = ok ? 'typing-feedback correct' : 'typing-feedback wrong';
});

// ---- Grading report (part of the same passcode-gated panel) --------------
const teacherGradingStep = document.getElementById('teacherGradingStep');
const gradingStartInput = document.getElementById('gradingStartInput');
const gradingEndInput = document.getElementById('gradingEndInput');
const gradingList = document.getElementById('gradingList');
const btnDownloadGrading = document.getElementById('btnDownloadGrading');
let lastGradingReport = [];

document.getElementById('btnOpenGrading').addEventListener('click', () => {
  teacherActiveStep.hidden = true;
  teacherGradingStep.hidden = false;
  const today = new Date().toISOString().slice(0, 10);
  if(!gradingStartInput.value) gradingStartInput.value = today;
  if(!gradingEndInput.value) gradingEndInput.value = today;
  btnDownloadGrading.hidden = true;
  gradingList.innerHTML = '';
});
document.getElementById('btnGradingBack').addEventListener('click', () => {
  teacherGradingStep.hidden = true;
  teacherActiveStep.hidden = false;
});
document.getElementById('btnRunGrading').addEventListener('click', async () => {
  const start = gradingStartInput.value;
  const end = gradingEndInput.value;
  if(!start || !end) return;
  gradingList.innerHTML = '<p class="leaderboard-empty">Loading...</p>';
  btnDownloadGrading.hidden = true;
  lastGradingReport = await VocabBackend.getGradingReport(start, end);

  if(lastGradingReport.length === 0){
    gradingList.innerHTML = '<p class="leaderboard-empty">No activity in that range.</p>';
    return;
  }

  gradingList.innerHTML = '';
  lastGradingReport.forEach(row => {
    const el = document.createElement('div');
    el.className = 'dashboard-row';
    el.innerHTML = `
      <span class="dashboard-name">${row.student_name}</span>
      <span class="dashboard-detail">${row.class_period || '—'} &middot; ${row.set_id} &middot; ${row.participation_count} attempts &middot; ${row.mastery_points} pts &middot; ${row.accuracy_pct ?? '—'}% acc.</span>
    `;
    gradingList.appendChild(el);
  });
  btnDownloadGrading.hidden = false;
});
btnDownloadGrading.addEventListener('click', () => {
  if(lastGradingReport.length === 0) return;
  const headers = ['student_name', 'class_period', 'set_id', 'participation_count', 'mastery_points', 'accuracy_pct'];
  const rows = lastGradingReport.map(row => headers.map(h => row[h] ?? '').join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grading-report-${gradingStartInput.value}-to-${gradingEndInput.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- Competition period / short-week adjustment (same passcode panel) ----
const teacherPeriodStep = document.getElementById('teacherPeriodStep');
const currentPeriodLabel = document.getElementById('currentPeriodLabel');
const periodStartInput = document.getElementById('periodStartInput');
const periodEndInput = document.getElementById('periodEndInput');
const periodLabelInput = document.getElementById('periodLabelInput');
const periodFeedback = document.getElementById('periodFeedback');

document.getElementById('btnOpenPeriod').addEventListener('click', async () => {
  teacherActiveStep.hidden = true;
  teacherPeriodStep.hidden = false;
  periodFeedback.textContent = '';
  periodFeedback.className = 'typing-feedback';
  const period = await VocabBackend.getCompetitionPeriod();
  if(period){
    currentPeriodLabel.textContent = `Currently: ${period.label} (${period.period_start} to ${period.period_end})`;
    periodStartInput.value = period.period_start;
    periodEndInput.value = period.period_end;
    periodLabelInput.value = period.label === 'Current week' ? '' : period.label;
  }
});
document.getElementById('btnPeriodBack').addEventListener('click', () => {
  teacherPeriodStep.hidden = true;
  teacherActiveStep.hidden = false;
});
document.getElementById('btnSubmitPeriod').addEventListener('click', async () => {
  const start = periodStartInput.value;
  const end = periodEndInput.value;
  const label = periodLabelInput.value.trim();
  if(!start || !end) return;
  const ok = await VocabBackend.setCompetitionPeriod(start, end, label);
  periodFeedback.textContent = ok
    ? `Competition period set: ${label || start + ' to ' + end}.`
    : 'Something went wrong — try again.';
  periodFeedback.className = ok ? 'typing-feedback correct' : 'typing-feedback wrong';
  if(ok){
    currentPeriodLabel.textContent = `Currently: ${label || 'Custom range'} (${start} to ${end})`;
  }
});

// ---- Prize tracking (same passcode-gated panel) ---------------------------
const teacherPrizeStep = document.getElementById('teacherPrizeStep');
const prizeWinnerSuggestion = document.getElementById('prizeWinnerSuggestion');
const prizeClassPeriodInput = document.getElementById('prizeClassPeriodInput');
const prizeDescriptionInput = document.getElementById('prizeDescriptionInput');
const prizeFeedback = document.getElementById('prizeFeedback');
const prizeHistoryList = document.getElementById('prizeHistoryList');

async function renderPrizeHistory(){
  const history = await VocabBackend.getPrizeHistory(10);
  if(history.length === 0){
    prizeHistoryList.innerHTML = '<p class="leaderboard-empty">No prizes logged yet.</p>';
    return;
  }
  prizeHistoryList.innerHTML = '';
  history.forEach(row => {
    const el = document.createElement('div');
    el.className = 'dashboard-row';
    el.innerHTML = `
      <span class="dashboard-name">${row.class_period}</span>
      <span class="dashboard-detail">${row.period_label || row.period_start + ' to ' + row.period_end} &middot; ${row.prize_description}</span>
    `;
    prizeHistoryList.appendChild(el);
  });
}

document.getElementById('btnOpenPrize').addEventListener('click', async () => {
  teacherActiveStep.hidden = true;
  teacherPrizeStep.hidden = false;
  prizeFeedback.textContent = '';
  prizeFeedback.className = 'typing-feedback';

  const standings = await VocabBackend.getClassLeaderboard();
  if(standings.length > 0){
    prizeWinnerSuggestion.textContent = `This period's leader: ${standings[0].class_period} (${Math.round(standings[0].combined_score)} pts). Log a prize below.`;
    if(!prizeClassPeriodInput.value) prizeClassPeriodInput.value = standings[0].class_period;
  }
  await renderPrizeHistory();
});
document.getElementById('btnPrizeBack').addEventListener('click', () => {
  teacherPrizeStep.hidden = true;
  teacherActiveStep.hidden = false;
});
document.getElementById('btnSubmitPrize').addEventListener('click', async () => {
  const classPeriod = prizeClassPeriodInput.value.trim();
  const description = prizeDescriptionInput.value.trim();
  if(!classPeriod || !description) return;

  const period = await VocabBackend.getCompetitionPeriod();
  const standings = await VocabBackend.getClassLeaderboard();
  const winnerRow = standings.find(row => row.class_period === classPeriod);
  const classLevel = winnerRow ? winnerRow.class_level : null;

  const ok = await VocabBackend.logCompetitionPrize(
    period ? period.period_start : new Date().toISOString().slice(0, 10),
    period ? period.period_end : new Date().toISOString().slice(0, 10),
    period ? period.label : null,
    classPeriod, classLevel, description
  );
  prizeFeedback.textContent = ok ? 'Prize logged.' : 'Something went wrong — try again.';
  prizeFeedback.className = ok ? 'typing-feedback correct' : 'typing-feedback wrong';
  if(ok){
    prizeDescriptionInput.value = '';
    await renderPrizeHistory();
  }
});

// ---- Grant Exclusive Mascot (same passcode-gated panel) -------------------
const teacherExclusiveStep = document.getElementById('teacherExclusiveStep');
const exclusiveStudentInput = document.getElementById('exclusiveStudentInput');
const exclusiveClassPeriodInput = document.getElementById('exclusiveClassPeriodInput');
const exclusivePresetSelect = document.getElementById('exclusivePresetSelect');
const exclusiveCustomNameInput = document.getElementById('exclusiveCustomNameInput');
const exclusiveCustomIconInput = document.getElementById('exclusiveCustomIconInput');
const exclusiveFeedback = document.getElementById('exclusiveFeedback');

EXCLUSIVO_PRESETS.forEach((preset, i) => {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = `${preset.icon} ${preset.name}`;
  exclusivePresetSelect.appendChild(opt);
});

document.getElementById('btnOpenExclusive').addEventListener('click', () => {
  teacherActiveStep.hidden = true;
  teacherExclusiveStep.hidden = false;
  exclusiveFeedback.textContent = '';
  exclusiveFeedback.className = 'typing-feedback';
});
document.getElementById('btnExclusiveBack').addEventListener('click', () => {
  teacherExclusiveStep.hidden = true;
  teacherActiveStep.hidden = false;
});
exclusivePresetSelect.addEventListener('change', () => {
  const isCustom = exclusivePresetSelect.value === 'custom';
  exclusiveCustomNameInput.hidden = !isCustom;
  exclusiveCustomIconInput.hidden = !isCustom;
});
document.getElementById('btnSubmitExclusive').addEventListener('click', async () => {
  const studentName = exclusiveStudentInput.value.trim();
  const classPeriod = exclusiveClassPeriodInput.value.trim();
  if(!studentName) return;

  let mascotName, mascotIcon, mascotImage;
  if(exclusivePresetSelect.value === 'custom'){
    mascotName = exclusiveCustomNameInput.value.trim();
    mascotIcon = exclusiveCustomIconInput.value.trim();
    mascotImage = null; // no art for an arbitrary custom name
  } else {
    const preset = EXCLUSIVO_PRESETS[Number(exclusivePresetSelect.value)];
    mascotName = preset.name;
    mascotIcon = preset.icon;
    mascotImage = preset.image;
  }
  if(!mascotName || !mascotIcon){
    exclusiveFeedback.textContent = 'Enter both a name and an emoji.';
    exclusiveFeedback.className = 'typing-feedback wrong';
    return;
  }

  const matched = await VocabBackend.grantExclusiveMascot(studentName, classPeriod, mascotName, mascotIcon, mascotImage);
  if(matched > 0){
    exclusiveFeedback.textContent = `Granted ${mascotIcon} ${mascotName} to ${matched === 1 ? studentName : matched + ' matching students'}.`;
    exclusiveFeedback.className = 'typing-feedback correct';
  } else {
    exclusiveFeedback.textContent = 'No matching student found — check the name/class period.';
    exclusiveFeedback.className = 'typing-feedback wrong';
  }
});

document.getElementById('btnLoadDashboard').addEventListener('click', async () => {
  const classPeriod = dashboardClassPeriodInput.value.trim();
  if(!classPeriod) return;
  dashboardList.innerHTML = '<p class="leaderboard-empty">Loading...</p>';
  const rows = await VocabBackend.getClassStatus(classPeriod);

  if(rows.length === 0){
    dashboardList.innerHTML = '<p class="leaderboard-empty">No students found for that class period.</p>';
    return;
  }

  dashboardList.innerHTML = '';
  rows.forEach(row => {
    const el = document.createElement('div');
    el.className = 'dashboard-row' + (row.is_struggling ? ' is-struggling' : '');
    const connectedText = row.connected_today ? 'Connected today' : 'Not connected today';
    el.innerHTML = `
      <span class="dashboard-name">${row.student_name}</span>
      <span class="dashboard-detail">${connectedText} &middot; ${row.participation_today} today &middot; ${row.accuracy_today ?? '—'}% acc.</span>
      ${row.is_struggling ? '<span class="dashboard-flag">Flag</span>' : ''}
    `;
    dashboardList.appendChild(el);
  });
});

// ---- Ambient display (classroom TV/iFP) -----------------------------------
const ambientClassTitle = document.getElementById('ambientClassTitle');
const ambientRoster = document.getElementById('ambientRoster');
const ambientTicker = document.getElementById('ambientTicker');
let ambientClassPeriod = null;
let ambientRefreshTimer = null;
const AMBIENT_REFRESH_MS = 20000;
const seenTickerTimestamps = new Set();

document.getElementById('btnOpenAmbient').addEventListener('click', () => {
  const classPeriod = dashboardClassPeriodInput.value.trim();
  if(!classPeriod) return;
  ambientClassPeriod = classPeriod;
  seenTickerTimestamps.clear();
  ambientTicker.innerHTML = '<p class="ambient-ticker-empty">Waiting for activity...</p>';
  closeTeacherOverlay();
  showScreen('ambient');
  ambientClassTitle.textContent = classPeriod;
  refreshAmbientDisplay();
  clearInterval(ambientRefreshTimer);
  ambientRefreshTimer = setInterval(refreshAmbientDisplay, AMBIENT_REFRESH_MS);
});

document.getElementById('btnExitAmbient').addEventListener('click', () => {
  clearInterval(ambientRefreshTimer);
  ambientRefreshTimer = null;
  showScreen('start');
});

async function refreshAmbientDisplay(){
  if(!ambientClassPeriod) return;

  const roster = await VocabBackend.getClassStatus(ambientClassPeriod);
  ambientRoster.innerHTML = '';
  roster.forEach(row => {
    const card = document.createElement('div');
    card.className = 'ambient-student-card' + (row.connected_today ? ' is-connected' : '');
    card.innerHTML = `
      <div class="ambient-student-name">${row.student_name}</div>
      <div class="ambient-student-dot"></div>
    `;
    ambientRoster.appendChild(card);
  });

  const recent = await VocabBackend.getRecentClassActivity(ambientClassPeriod, 20);
  const newOnes = recent.filter(r => !seenTickerTimestamps.has(r.created_at));
  if(newOnes.length > 0){
    if(ambientTicker.querySelector('.ambient-ticker-empty')) ambientTicker.innerHTML = '';
    newOnes.reverse().forEach(r => {
      seenTickerTimestamps.add(r.created_at);
      const item = document.createElement('p');
      item.className = 'ambient-ticker-item';
      item.textContent = `\u2728 ${r.student_name} earned ${r.points} points in ${r.mode}!`;
      ambientTicker.insertBefore(item, ambientTicker.firstChild);
    });
    // Keep the ticker from growing forever
    while(ambientTicker.children.length > 12){
      ambientTicker.removeChild(ambientTicker.lastChild);
    }
  }
}

function showScreen(name){
  Object.entries(screens).forEach(([k, el]) => el.hidden = (k !== name));
  state.screen = name;
  // Level bar is the way to choose/re-choose a level — visible except
  // mid-round, first-time setup, or the leaderboard. Set-select follows
  // the same rule.
  const hideBars = (name === 'game' || name === 'setup' || name === 'leaderboard' || name === 'ambient' || name === 'collection');
  levelSelectEl.hidden = hideBars;
  setSelectEl.hidden = hideBars;
  btnLeaderboard.hidden = hideBars;
  btnCollection.hidden = hideBars;
  if(name !== 'game' && name !== 'setup'){
    updateLevelSelect();
    updateReviewStatus();
    renderSetSelect();
    stopSpeedTimer();
  }
  if(name !== 'game' && 'speechSynthesis' in window){
    window.speechSynthesis.cancel();
  }
}

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(()=>toastEl.classList.remove('show'), 1100);
}

// ---- Round setup --------------------------------------------------------
function startRound(mode){
  if(!isModeUnlocked(mode)) return; // guard: ignore clicks on locked levels
  const pool = poolForMode(mode);
  state.mode = mode;
  state.wrongAttempts = 0;
  state.correctAttempts = 0;
  state.streak = 0;
  state.roundCoinsEarned = 0;
  tabSwitchedDuringRound = false;

  if(mode === 'typing' || mode === 'listening' || mode === 'dictation' || mode === 'context' || mode === 'speed' || mode === 'bonus' || mode === 'sequence'){
    startTypingRound(pool);
  } else {
    startMatchingRound(pool);
  }
}

function startMatchingRound(pool){
  modeLabelEl.textContent = 'Matching';
  board.hidden = false;
  typingPanel.hidden = true;
  progressTrackEl.hidden = false;

  state.matchedCount = 0;
  state.openCard = null;
  state.lock = false;

  const count = Math.min(PAIRS_PER_ROUND, pool.length);
  state.roundWords = pickWordsForRound(count, pool, 'matching');
  state.roundTotal = count;

  // Build card list: one "digit" card + one "word" card per vocab item —
  // fulfils the "both formats" content decision (digit and word forms).
  const cards = [];
  state.roundWords.forEach(v => {
    cards.push({ id: `${v.number}-num`, number: v.number, kind: 'number', display: String(v.number) });
    cards.push({ id: `${v.number}-word`, number: v.number, kind: 'word', display: v.word });
  });
  shuffle(cards);
  renderBoard(cards);
  updateProgress();
  showScreen('game');
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}

function renderBoard(cards){
  board.innerHTML = '';
  cards.forEach(c => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.tabIndex = 0;
    cardEl.dataset.number = c.number;
    cardEl.dataset.kind = c.kind;
    cardEl.dataset.id = c.id;

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    const back = document.createElement('div');
    back.className = 'card-face card-back';

    const front = document.createElement('div');
    front.className = 'card-face card-front';
    const canvas = createWordCanvas();
    canvas.dataset.text = c.display;
    front.appendChild(canvas);

    inner.appendChild(back);
    inner.appendChild(front);
    cardEl.appendChild(inner);

    cardEl.addEventListener('click', () => onCardClick(cardEl));
    cardEl.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onCardClick(cardEl); }
    });

    board.appendChild(cardEl);
  });

  // Cards are now laid out by the grid — measure each card-front's real
  // box and draw text to fit it exactly.
  requestAnimationFrame(refitAllCanvases);
}

function onCardClick(cardEl){
  if(state.lock) return;
  if(cardEl.classList.contains('is-open') || cardEl.classList.contains('is-matched')) return;

  cardEl.classList.add('is-open');

  if(!state.openCard){
    state.openCard = cardEl;
    return;
  }

  // second card selected -> resolve
  const a = state.openCard;
  const b = cardEl;
  state.openCard = null;

  const sameNumber = a.dataset.number === b.dataset.number;
  const differentKind = a.dataset.kind !== b.dataset.kind;

  if(sameNumber && differentKind){
    resolveMatch(a, b);
  } else {
    resolveWrong(a, b);
  }
}

function resolveMatch(a, b){
  state.lock = true;
  const number = Number(a.dataset.number);
  const s = statsFor('matching', number);

  // Tab-switch guard: correct answer still resolves visually and counts
  // as participation, but does not register as mastery progress.
  const countsForMastery = !tabSwitchedDuringRound;
  const matchPoints = countsForMastery ? applyReviewMultiplier(MODALITY_WEIGHT.matching) : 0;
  if(countsForMastery){
    s.correct += matchPoints;
    markWordStatsChanged('matching', number);
  }
  logCompetitionActivity(true, matchPoints);
  state.correctAttempts++;
  state.streak++;

  setTimeout(() => {
    a.classList.add('is-matched');
    b.classList.add('is-matched');
    state.matchedCount++;

    const bonus = applyReviewMultiplier((state.streak >= 3 ? 2 : 1) * MODALITY_WEIGHT.matching);
    earnCoins(bonus);
    showToast(state.streak >= 3 ? '¡Racha! +' + bonus : `¡Correcto! +${bonus}`);

    updateProgress();
    state.lock = false;

    if(state.matchedCount === state.roundTotal){
      setTimeout(finishRound, 500);
    }
  }, 350);
}

// Per Twila's feedback: a mismatch here usually means "I forgot which
// tile had which word," not "I don't know the vocabulary" — matching
// is a location-memory game as much as a vocab game. So a mismatch
// still gives visual feedback (for game feel) but does NOT count
// against wordStats.wrong / mastery / graduation. Only genuine recall
// errors in the typing modality affect mastery scoring.
function resolveWrong(a, b){
  state.lock = true;
  state.streak = 0;
  logCompetitionActivity(false, 0);

  a.classList.add('is-wrong');
  b.classList.add('is-wrong');

  setTimeout(() => {
    a.classList.remove('is-open','is-wrong');
    b.classList.remove('is-open','is-wrong');
    state.lock = false;
    updateProgress();
  }, 500);
}

function updateProgress(){
  if(state.mode === 'typing' || state.mode === 'listening' || state.mode === 'dictation' || state.mode === 'context' || state.mode === 'speed' || state.mode === 'bonus' || state.mode === 'sequence'){
    pairsLeftEl.textContent = state.typingQuestionCount === 1
      ? '1 question so far'
      : `${state.typingQuestionCount} questions so far`;

    const threshold = getUnlockThreshold(activeSetId);
    const unlocked = state.typingQuestionCount >= threshold;
    btnFinishTyping.hidden = !unlocked;
    finishHint.hidden = unlocked;
    if(!unlocked){
      const remaining = threshold - state.typingQuestionCount;
      finishHint.textContent = remaining === 1
        ? 'Answer 1 more question to unlock "Finish for now"'
        : `Answer ${remaining} more questions to unlock "Finish for now"`;
    }
  } else {
    const pct = Math.round((state.matchedCount / state.roundTotal) * 100);
    progressFill.style.width = pct + '%';
    const left = state.roundTotal - state.matchedCount;
    pairsLeftEl.textContent = left === 1 ? '1 pair left' : `${left} pairs left`;
  }
  streakLabelEl.textContent = `Streak: ${state.streak}`;
}

function finishRound(){
  const matchingStat = document.getElementById('matchingCompleteStat');
  const typingStat = document.getElementById('typingAccuracyStat');

  if(state.mode === 'typing' || state.mode === 'listening' || state.mode === 'dictation' || state.mode === 'context' || state.mode === 'speed' || state.mode === 'bonus' || state.mode === 'sequence'){
    const total = state.correctAttempts + state.wrongAttempts;
    const accuracy = total > 0 ? Math.round((state.correctAttempts/total)*100) : 100;
    document.getElementById('finalAccuracy').textContent = accuracy;
    typingStat.hidden = false;
    matchingStat.hidden = true;
  } else {
    // Matching: no accuracy percentage — completion is what matters here.
    // Mismatches during matching are a location-memory miss, not a
    // vocabulary miss, so they intentionally don't produce a "score".
    matchingStat.hidden = false;
    typingStat.hidden = true;
    checkAndAwardBadge('first_match');
  }
  checkAllBadges();

  const roundCoins = '+' + (state.roundCoinsEarned || 0);
  document.getElementById('coinsEarnedThisSession').textContent = roundCoins;

  const masteryNote = document.getElementById('masteryNote');
  masteryNote.textContent = tabSwitchedDuringRound
    ? 'This round\u2019s answers counted for participation, but not mastery (left the tab).'
    : 'All answers this round counted toward mastery.';

  // Refresh the level bar now — mastery gained this round may have just
  // unlocked typing/listening, and the student picks what's next from there.
  updateLevelSelect();

  showScreen('complete');
}

// ---- Typing & listening modalities ---------------------------------------
// Words that "graduate" out of matching (per isModeUnlocked/poolForMode) get
// tested here instead — recall (typing the answer, or recognizing the
// spoken word) rather than recognition (picking from two visible options),
// meaningfully harder modalities for the adaptive system to step students
// up into. Both share this same continuous answer panel — the prompt
// area just shows a canvas (typing) or a play button (listening).
//
// Continuous, not round-capped: a fixed small batch wasn't nearly enough
// real practice. Both modes keep presenting words (repeating/cycling,
// still weighted toward struggling ones) until the student taps Finish.
function startTypingRound(pool){
  const modeLabels = { typing: 'Typing', listening: 'Listening', dictation: 'Dictation', context: 'Fill-in-Context', speed: 'Speed Challenge', bonus: 'Bonus', sequence: 'Sequence' };
  modeLabelEl.textContent = modeLabels[state.mode];
  board.hidden = true;
  typingPanel.hidden = false;
  progressTrackEl.hidden = true; // open-ended now — a % bar doesn't apply

  state.typingPool = pool;
  state.typingQuestionCount = 0;
  state.roundTotal = 0; // not used to gate completion in typing/listening mode

  showScreen('game');
  updateProgress();
  renderTypingWord();
}

// ---- Speed challenge timer -------------------------------------------
// A visible countdown bar; if it runs out before the student answers,
// the question resolves as a timed-out (wrong) answer automatically —
// speed itself is the skill being tested here.
let speedTimeoutId = null;
let speedUrgentId = null;

function startSpeedTimer(){
  stopSpeedTimer();
  speedTimerFill.classList.remove('is-urgent');
  speedTimerFill.style.transition = 'none';
  speedTimerFill.style.width = '100%';
  void speedTimerFill.offsetWidth; // force reflow so the transition below applies
  speedTimerFill.style.transition = `width ${SPEED_TIME_LIMIT_MS}ms linear, background 200ms ease`;
  requestAnimationFrame(() => {
    speedTimerFill.style.width = '0%';
  });
  speedUrgentId = setTimeout(() => speedTimerFill.classList.add('is-urgent'), SPEED_TIME_LIMIT_MS * 0.6);
  speedTimeoutId = setTimeout(() => {
    resolveTypingAnswer(''); // time's up — resolves as incorrect, same as any empty answer
  }, SPEED_TIME_LIMIT_MS);
}

function stopSpeedTimer(){
  clearTimeout(speedTimeoutId);
  clearTimeout(speedUrgentId);
}

// ---- Bonus games: math facts, true/false, odd-one-out ---------------------
// A variety/reward tier for early finishers — mixes three quick formats
// rather than one repeated drill. Math facts flows through the existing
// text-answer engine (state.currentTypingWord is set to the sum's VOCAB
// entry); true/false and odd-one-out are click-based and resolved here.
function pickMathFactsQuestion(){
  const maxNum = VOCAB[VOCAB.length - 1].number;
  const a = VOCAB[Math.floor(Math.random() * VOCAB.length)];
  const bCandidates = VOCAB.filter(v => v.number <= maxNum - a.number);
  const b = bCandidates[Math.floor(Math.random() * bCandidates.length)];
  const sum = a.number + b.number;
  const sumEntry = VOCAB.find(v => v.number === sum);
  return { a, b, sumEntry };
}

function pickTrueFalseQuestion(){
  const v = pickNextContinuousWord(state.typingPool, state.mode);
  const isTrue = Math.random() < 0.5;
  let displayTranslation = v.translation;
  if(!isTrue){
    const others = VOCAB.filter(o => o.number !== v.number);
    displayTranslation = others[Math.floor(Math.random() * others.length)].translation;
  }
  return { v, displayTranslation, isTrue };
}

function pickOddOneOutQuestion(){
  const groupIsEven = Math.random() < 0.5;
  const matching = VOCAB.filter(v => (v.number % 2 === 0) === groupIsEven);
  const nonMatching = VOCAB.filter(v => (v.number % 2 === 0) !== groupIsEven);
  const shuffledMatching = [...matching].sort(() => Math.random() - 0.5).slice(0, 3);
  const oddOne = nonMatching[Math.floor(Math.random() * nonMatching.length)];
  const items = [...shuffledMatching, oddOne].sort(() => Math.random() - 0.5);
  return { items, oddOneNumber: oddOne.number };
}

// Riddles: a text clue, student types the answer — reuses the same
// text-answer engine as math facts. Works for any topic (unlike
// math-facts/odd-even, which are numeric-specific), so this is what
// non-numeric sets rotate through instead.
function pickRiddleQuestion(){
  const withRiddles = VOCAB.filter(v => v.riddle);
  const pool = withRiddles.length > 0 ? withRiddles : VOCAB;
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderOddOneOutTiles(items, oddOneNumber){
  oddOneOutGrid.innerHTML = '';
  items.forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'oddoneout-tile';
    const canvas = createWordCanvas();
    canvas.dataset.text = item.word;
    tile.appendChild(canvas);
    tile.addEventListener('click', () => {
      const isCorrect = item.number === oddOneNumber;
      const correctWord = VOCAB.find(v => v.number === oddOneNumber).word;
      resolveBonusClick(isCorrect, null, isCorrect ? null : `Era "${correctWord}"`);
    });
    oddOneOutGrid.appendChild(tile);
  });
  requestAnimationFrame(() => {
    const tiles = oddOneOutGrid.querySelectorAll('.oddoneout-tile');
    tiles.forEach((tile, i) => {
      const canvas = tile.querySelector('canvas');
      const rect = tile.getBoundingClientRect();
      fitWordCanvas(canvas, items[i].word, rect.width - 16, rect.height - 16);
    });
  });
}

// ---- Sequence builder -----------------------------------------------------
// Pick N distinct words at random, shuffled for display; the student
// taps them in ascending numeric order. A tap out of order shakes and
// doesn't advance — they keep trying until the whole set is placed.
const SEQUENCE_SET_SIZE = 4;
function pickSequenceQuestion(){
  const shuffled = [...VOCAB].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(SEQUENCE_SET_SIZE, VOCAB.length));
}

function renderSequenceTiles(words){
  sequenceRow.innerHTML = '';
  words.forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'sequence-tile';
    const canvas = createWordCanvas();
    canvas.dataset.text = item.word;
    tile.appendChild(canvas);
    tile.addEventListener('click', () => resolveSequenceTap(tile, item.number));
    sequenceRow.appendChild(tile);
  });
  requestAnimationFrame(() => {
    const tiles = sequenceRow.querySelectorAll('.sequence-tile');
    tiles.forEach((tile, i) => {
      const canvas = tile.querySelector('canvas');
      const rect = tile.getBoundingClientRect();
      fitWordCanvas(canvas, words[i].word, rect.width - 16, rect.height - 16);
    });
  });
}

function resolveSequenceTap(tileEl, number){
  if(tileEl.classList.contains('is-placed')) return;
  const expectedNumber = state.sequenceTarget[state.sequenceProgress].number;

  if(number === expectedNumber){
    tileEl.classList.add('is-placed');
    state.sequenceProgress++;
    if(state.sequenceProgress === state.sequenceTarget.length){
      resolveSequenceRoundComplete();
    }
  } else {
    state.sequenceMistakeMade = true;
    tileEl.classList.add('is-wrong');
    setTimeout(() => tileEl.classList.remove('is-wrong'), 340);
  }
}

// A round only counts as fully "correct" (mastery + full coin bonus) if
// completed with zero mistakes — a mistake still lets them finish
// (educational retry), but the round counts as a miss for the words
// involved, same spirit as every other level here.
function resolveSequenceRoundComplete(){
  const noMistakes = !state.sequenceMistakeMade;
  state.sequenceTarget.forEach(item => {
    const s = statsFor('sequence', item.number);
    if(noMistakes){
      const countsForMastery = !tabSwitchedDuringRound;
      if(countsForMastery){
        s.correct += applyReviewMultiplier(SEQUENCE_WEIGHT);
        markWordStatsChanged('sequence', item.number);
      }
    } else {
      s.wrong++;
      markWordStatsChanged('sequence', item.number);
    }
  });

  if(noMistakes){
    state.correctAttempts++;
    state.streak++;
    const bonus = applyReviewMultiplier((state.streak >= 3 ? 2 : 1) * SEQUENCE_WEIGHT);
    earnCoins(bonus);
    logCompetitionActivity(true, bonus);
    typingFeedback.textContent = state.streak >= 3 ? `¡Racha! +${bonus}` : `¡Correcto! +${bonus}`;
    typingFeedback.className = 'typing-feedback correct';
  } else {
    state.wrongAttempts++;
    state.streak = 0;
    logCompetitionActivity(false, 0);
    typingFeedback.textContent = '¡Buen intento! Sigue practicando.';
    typingFeedback.className = 'typing-feedback wrong';
  }

  state.typingQuestionCount++;
  modeAnsweredCounters.sequence++;
  VocabBackend.saveModeCount(activeSetId, 'sequence', modeAnsweredCounters.sequence);
  updateProgress();

  setTimeout(() => {
    renderTypingWord();
  }, noMistakes ? 700 : 1200);
}

// Shared resolver for the click-based bonus sub-formats (true/false,
// odd-one-out) — mirrors resolveTypingAnswer's bookkeeping (coins,
// streak, question count) without forcing a single-word attribution
// for formats that don't cleanly map to one word (odd-one-out).
function resolveBonusClick(isCorrect, attributedNumber, wrongFeedbackText){
  stopSpeedTimer();

  if(attributedNumber !== null && attributedNumber !== undefined){
    const s = statsFor('bonus', attributedNumber);
    if(isCorrect){
      const countsForMastery = !tabSwitchedDuringRound;
      if(countsForMastery){
        s.correct += applyReviewMultiplier(BONUS_WEIGHT);
        markWordStatsChanged('bonus', attributedNumber);
      }
    } else {
      s.wrong++;
      markWordStatsChanged('bonus', attributedNumber);
    }
  }

  if(isCorrect){
    state.correctAttempts++;
    state.streak++;
    const bonus = applyReviewMultiplier((state.streak >= 3 ? 2 : 1) * BONUS_WEIGHT);
    earnCoins(bonus);
    logCompetitionActivity(true, bonus);
    typingFeedback.textContent = state.streak >= 3 ? `¡Racha! +${bonus}` : `¡Correcto! +${bonus}`;
    typingFeedback.className = 'typing-feedback correct';
  } else {
    state.wrongAttempts++;
    state.streak = 0;
    logCompetitionActivity(false, 0);
    typingFeedback.textContent = wrongFeedbackText || 'Inténtalo la próxima vez.';
    typingFeedback.className = 'typing-feedback wrong';
  }

  state.typingQuestionCount++;
  modeAnsweredCounters.bonus++;
  VocabBackend.saveModeCount(activeSetId, 'bonus', modeAnsweredCounters.bonus);
  updateProgress();

  btnTfYes.disabled = true;
  btnTfNo.disabled = true;
  Array.from(oddOneOutGrid.children).forEach(el => { el.style.pointerEvents = 'none'; });

  setTimeout(() => {
    btnTfYes.disabled = false;
    btnTfNo.disabled = false;
    renderTypingWord();
  }, isCorrect ? 550 : 1400);
}

btnTfYes.addEventListener('click', () => {
  if(state.mode !== 'bonus' || state.bonusFormat !== 'truefalse') return;
  const isCorrect = state.tfIsTrue === true;
  const correctLabel = state.tfIsTrue ? null : `${state.currentTypingWord.word} = ${state.currentTypingWord.number}`;
  resolveBonusClick(isCorrect, state.currentTypingWord.number, correctLabel);
});
btnTfNo.addEventListener('click', () => {
  if(state.mode !== 'bonus' || state.bonusFormat !== 'truefalse') return;
  const isCorrect = state.tfIsTrue === false;
  const correctLabel = state.tfIsTrue ? `${state.currentTypingWord.word} = ${state.currentTypingWord.number}` : null;
  resolveBonusClick(isCorrect, state.currentTypingWord.number, correctLabel);
});

function renderTypingWord(){
  typingFeedback.textContent = '';
  typingFeedback.className = 'typing-feedback';
  typingInput.value = '';
  typingInput.classList.remove('is-wrong');
  typingInput.disabled = false;
  typingForm.hidden = false;
  accentRow.hidden = false;
  tfButtons.hidden = true;
  oddOneOutGrid.hidden = true;
  sequenceRow.hidden = true;

  // Pick one word, weighted toward ones missed more, while avoiding an
  // immediate repeat of the last couple of words asked.
  const v = pickNextContinuousWord(state.typingPool, state.mode);
  state.currentTypingWord = v;

  if(state.mode === 'listening' || state.mode === 'dictation'){
    // Both play audio, but ask for different things: listening tests
    // comprehension (type the number you heard); dictation is a distinct,
    // harder level testing spelling-from-sound (type the Spanish word).
    state.typingPromptKind = 'word';
    typingInstruction.textContent = state.mode === 'dictation'
      ? 'Escucha y escribe la palabra en español:'
      : 'Escucha y escribe el número:';
    typingPanel.classList.toggle('is-dictation', state.mode === 'dictation');
    typingPrompt.hidden = true;
    listeningControls.hidden = false;
    contextImage.hidden = true;
    contextImage.removeAttribute('src');
    speedTimerTrack.hidden = true;
    stopSpeedTimer();
    playCurrentListeningWord();
  } else if(state.mode === 'context'){
    // Fill-in-context: a full sentence with a blank, testing the word in
    // real usage rather than in isolation — the most advanced level, since
    // it requires reading comprehension on top of vocabulary recall.
    state.typingPromptKind = 'word';
    typingInstruction.textContent = 'Completa la oración:';
    typingPanel.classList.remove('is-dictation');
    listeningControls.hidden = true;
    speedTimerTrack.hidden = true;
    stopSpeedTimer();
    typingPrompt.hidden = false;
    typingPrompt.classList.add('is-sentence');
    typingPrompt.innerHTML = '';
    const canvas = createWordCanvas();
    canvas.dataset.text = v.context;
    typingPrompt.appendChild(canvas);
    requestAnimationFrame(() => {
      const rect = typingPrompt.getBoundingClientRect();
      const cs = getComputedStyle(typingPrompt);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      fitSentenceCanvas(canvas, v.context, rect.width - padX, rect.height - padY);
    });
    if(v.contextImage){
      contextImage.src = v.contextImage;
      contextImage.hidden = false;
    } else {
      contextImage.hidden = true;
      contextImage.removeAttribute('src');
    }
  } else if(state.mode === 'bonus'){
    // Three mini-formats mixed for variety, reusing this same answer
    // panel/engine — a reward tier for early finishers, not a new
    // vocab-difficulty escalation, so it shares Speed's weight.
    contextImage.hidden = true;
    contextImage.removeAttribute('src');
    listeningControls.hidden = true;
    speedTimerTrack.hidden = true;
    stopSpeedTimer();
    typingPanel.classList.remove('is-dictation');

    // Non-numeric sets can't use math-facts (needs addition) or odd-one-out
    // (needs even/odd parity) — they rotate through riddle+truefalse
    // instead. A set can override this explicitly via bonusFormats;
    // otherwise it falls back to the original three-format rotation that
    // every existing numeric set already uses unchanged.
    const activeSet = VOCAB_SETS[activeSetId];
    const formats = (activeSet && activeSet.bonusFormats) || ['mathfacts', 'truefalse', 'oddoneout'];
    state.bonusFormat = formats[Math.floor(Math.random() * formats.length)];

    if(state.bonusFormat === 'mathfacts'){
      typingInstruction.textContent = 'Resuelve:';
      const { a, b, sumEntry } = pickMathFactsQuestion();
      state.currentTypingWord = sumEntry;
      state.typingPromptKind = Math.random() < 0.5 ? 'number' : 'word';
      const equation = `${a.word} más ${b.word} son ___`;

      typingPrompt.hidden = false;
      typingPrompt.classList.add('is-sentence');
      typingPrompt.innerHTML = '';
      const canvas = createWordCanvas();
      canvas.dataset.text = equation;
      typingPrompt.appendChild(canvas);
      requestAnimationFrame(() => {
        const rect = typingPrompt.getBoundingClientRect();
        const cs = getComputedStyle(typingPrompt);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        fitSentenceCanvas(canvas, equation, rect.width - padX, rect.height - padY);
      });
    } else if(state.bonusFormat === 'riddle'){
      typingInstruction.textContent = 'Adivina:';
      const riddleWord = pickRiddleQuestion();
      state.currentTypingWord = riddleWord;
      state.typingPromptKind = 'word';
      const clue = riddleWord.riddle || `¿Qué palabra es "${riddleWord.translation}"?`;

      typingPrompt.hidden = false;
      typingPrompt.classList.add('is-sentence');
      typingPrompt.innerHTML = '';
      const canvas = createWordCanvas();
      canvas.dataset.text = clue;
      typingPrompt.appendChild(canvas);
      requestAnimationFrame(() => {
        const rect = typingPrompt.getBoundingClientRect();
        const cs = getComputedStyle(typingPrompt);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        fitSentenceCanvas(canvas, clue, rect.width - padX, rect.height - padY);
      });
    } else if(state.bonusFormat === 'truefalse'){
      typingInstruction.textContent = '¿Es correcto?';
      const { v: tfWord, displayTranslation, isTrue } = pickTrueFalseQuestion();
      state.currentTypingWord = tfWord;
      state.tfIsTrue = isTrue;
      const statement = `${tfWord.word} = ${displayTranslation}`;

      typingForm.hidden = true;
      accentRow.hidden = true;
      typingPrompt.hidden = false;
      typingPrompt.classList.remove('is-sentence');
      typingPrompt.innerHTML = '';
      const canvas = createWordCanvas();
      canvas.dataset.text = statement;
      typingPrompt.appendChild(canvas);
      requestAnimationFrame(() => {
        const rect = typingPrompt.getBoundingClientRect();
        const cs = getComputedStyle(typingPrompt);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        fitWordCanvas(canvas, statement, rect.width - padX, rect.height - padY);
      });
      tfButtons.hidden = false;
    } else {
      typingInstruction.textContent = 'Toca el que no pertenece:';
      typingForm.hidden = true;
      accentRow.hidden = true;
      typingPrompt.hidden = true;
      state.currentTypingWord = null;
      const { items, oddOneNumber } = pickOddOneOutQuestion();
      renderOddOneOutTiles(items, oddOneNumber);
      oddOneOutGrid.hidden = false;
    }
  } else if(state.mode === 'sequence'){
    // Put a shuffled handful of numbers in ascending order — a format
    // that fits numbers/days/months well, but won't suit every future
    // vocab set (per-set activity, not a "standard" one).
    contextImage.hidden = true;
    contextImage.removeAttribute('src');
    listeningControls.hidden = true;
    speedTimerTrack.hidden = true;
    stopSpeedTimer();
    typingPanel.classList.remove('is-dictation');
    typingForm.hidden = true;
    accentRow.hidden = true;
    typingPrompt.hidden = true;
    typingInstruction.textContent = 'Toca los números en orden, del más pequeño al más grande:';
    state.currentTypingWord = null;

    const sequenceWords = pickSequenceQuestion();
    state.sequenceTarget = [...sequenceWords].sort((a, b) => a.number - b.number);
    state.sequenceProgress = 0;
    state.sequenceMistakeMade = false;
    renderSequenceTiles(sequenceWords);
    sequenceRow.hidden = false;
  } else {
    contextImage.hidden = true;
    contextImage.removeAttribute('src');
    // Randomize direction per word: sometimes show the digit and ask for
    // the word, sometimes show the word and ask for the digit. Speed
    // challenge uses this same format, just with a countdown added.
    state.typingPromptKind = Math.random() < 0.5 ? 'number' : 'word';
    const promptText = state.typingPromptKind === 'number' ? String(v.number) : v.word;
    typingInstruction.textContent = state.typingPromptKind === 'number'
      ? 'Type the word for:'
      : 'Type the number for:';

    typingPrompt.hidden = false;
    typingPrompt.classList.remove('is-sentence');
    listeningControls.hidden = true;
    typingPrompt.innerHTML = '';
    const canvas = createWordCanvas();
    canvas.dataset.text = promptText;
    typingPrompt.appendChild(canvas);
    requestAnimationFrame(() => {
      const rect = typingPrompt.getBoundingClientRect();
      const cs = getComputedStyle(typingPrompt);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      fitWordCanvas(canvas, promptText, rect.width - padX, rect.height - padY);
    });

    if(state.mode === 'speed'){
      speedTimerTrack.hidden = false;
      startSpeedTimer();
    } else {
      speedTimerTrack.hidden = true;
      stopSpeedTimer();
    }
  }

  typingInput.focus();
}

function playCurrentListeningWord(){
  if(!state.currentTypingWord) return;
  btnPlayAudio.classList.add('is-playing');
  const ok = playWordAudio(state.currentTypingWord);
  setTimeout(() => btnPlayAudio.classList.remove('is-playing'), 700);
  if(!ok){
    typingFeedback.textContent = 'Audio isn\u2019t available on this device — ask your teacher for help.';
  }
}

btnPlayAudio.addEventListener('click', playCurrentListeningWord);

function normalizeAnswer(str){
  return str.trim().toLowerCase();
}

// ---- Accent-mark quick-insert -------------------------------------------
// Spanish accents (á é í ó ú ñ ü) are hard to type on a standard US
// keyboard — these buttons insert the character at the cursor position
// instead of requiring keyboard shortcuts kids don't know.
const accentRow = document.getElementById('accentRow');
accentRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.accent-key');
  if(!btn || typingInput.disabled) return;

  const char = btn.dataset.char;
  const start = typingInput.selectionStart ?? typingInput.value.length;
  const end = typingInput.selectionEnd ?? typingInput.value.length;
  const current = typingInput.value;

  typingInput.value = current.slice(0, start) + char + current.slice(end);
  const newPos = start + char.length;
  typingInput.focus();
  typingInput.setSelectionRange(newPos, newPos);
});

function resolveTypingAnswer(rawGiven){
  if(typingInput.disabled) return; // already resolving previous answer
  stopSpeedTimer();

  const v = state.currentTypingWord;
  const isDictation = state.mode === 'dictation';
  const isContext = state.mode === 'context';
  const isSpeed = state.mode === 'speed';
  const expected = v.word; // shown in feedback as the "correct answer"
  const given = normalizeAnswer(rawGiven);

  // Accept the target word and its English translation always; only
  // accept the bare digit for genuinely numeric sets (a color/animal/etc.
  // set's id is a string slug, not a number, so this naturally skips there).
  const acceptableAnswers = [
    normalizeAnswer(v.word),
    normalizeAnswer(v.translation || ''),
  ];
  if(Number.isInteger(v.number)){
    acceptableAnswers.push(normalizeAnswer(String(v.number)));
  }
  const isCorrect = given.length > 0 && acceptableAnswers.includes(given);
  const s = statsFor(state.mode, v.number);
  const weight = isContext ? CONTEXT_WEIGHT
    : isDictation ? DICTATION_WEIGHT
    : isSpeed ? SPEED_WEIGHT
    : state.mode === 'bonus' ? BONUS_WEIGHT
    : MODALITY_WEIGHT[state.mode];

  if(isCorrect){
    const countsForMastery = !tabSwitchedDuringRound;
    if(countsForMastery){
      s.correct += applyReviewMultiplier(weight);
      markWordStatsChanged(state.mode, v.number);
    }
    state.correctAttempts++;
    state.streak++;
    const bonus = applyReviewMultiplier((state.streak >= 3 ? 2 : 1) * weight);
    earnCoins(bonus);
    logCompetitionActivity(true, bonus);
    typingFeedback.textContent = state.streak >= 3 ? `¡Racha! +${bonus}` : `¡Correcto! +${bonus}`;
    typingFeedback.classList.add('correct');
  } else {
    s.wrong++;
    markWordStatsChanged(state.mode, v.number);
    logCompetitionActivity(false, 0);
    state.wrongAttempts++;
    state.streak = 0;
    typingInput.classList.add('is-wrong');
    typingFeedback.textContent = given.length === 0
      ? `¡Se acabó el tiempo! Era: ${expected}`
      : `La respuesta era: ${expected}`;
    typingFeedback.classList.add('wrong');
  }

  state.typingQuestionCount++;
  if(modeAnsweredCounters[state.mode] !== undefined){
    modeAnsweredCounters[state.mode]++;
    VocabBackend.saveModeCount(activeSetId, state.mode, modeAnsweredCounters[state.mode]);
  }
  updateProgress();
  typingInput.disabled = true;

  setTimeout(() => {
    renderTypingWord();
  }, isCorrect ? 550 : 1100);
}

typingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  resolveTypingAnswer(typingInput.value);
});

btnFinishTyping.addEventListener('click', () => finishRound());

// ---- Initial state on page load ------------------------------------------
// Sign in (anonymous, persistent per device), get or create the student's
// profile, then hydrate all local state from what's actually saved —
// this is what makes progress survive a refresh instead of resetting.
async function initApp(){
  await VocabBackend.ensureSignedIn();

  const fetchedSets = await VocabBackend.loadAllVocabContent();
  if(Object.keys(fetchedSets).length > 0){
    VOCAB_SETS = fetchedSets;
  } else {
    console.warn('Could not load vocab content from Supabase — using built-in fallback content.');
  }
  // activeSetId still defaults to DEFAULT_SET_ID; make sure VOCAB points
  // at that set's real word list now that VOCAB_SETS may have changed.
  if(VOCAB_SETS[activeSetId]) VOCAB = VOCAB_SETS[activeSetId].words;

  let profile = await VocabBackend.getStudentProfile();

  if(!profile){
    profile = await promptForStudentSetup();
  }

  assignedSetId = await VocabBackend.getAssignedSetForClassPeriod(profile.class_period, profile.class_level);
  if(assignedSetId && VOCAB_SETS[assignedSetId] && assignedSetId !== activeSetId){
    activeSetId = assignedSetId;
    VOCAB = VOCAB_SETS[assignedSetId].words;
  }

  await hydrateFromBackend();
  await updateReviewStatus();
  await renderSetSelect();
  showScreen('start');
}

function promptForStudentSetup(){
  return new Promise((resolve) => {
    showScreen('setup');
    const form = document.getElementById('setupForm');
    const nameInput = document.getElementById('setupNameInput');
    const periodInput = document.getElementById('setupPeriodInput');
    const levelInput = document.getElementById('setupLevelInput');
    const errorEl = document.getElementById('setupError');

    form.addEventListener('submit', async function onSubmit(e){
      e.preventDefault();
      const name = nameInput.value.trim();
      if(!name) return;
      const created = await VocabBackend.createStudentProfile(name, periodInput.value.trim(), levelInput.value.trim());
      if(!created){
        errorEl.textContent = 'Something went wrong saving your name — try again.';
        return;
      }
      form.removeEventListener('submit', onSubmit);
      resolve(created);
    });
  });
}

async function hydrateFromBackend(){
  const progress = await VocabBackend.loadStudentProgress(activeSetId);

  wordStatsByMode = progress.wordStatsByMode || {};
  coins = progress.coins || 0;
  coinValueEl.textContent = coins;

  const modeCounts = progress.modeCounts || {};
  Object.keys(modeAnsweredCounters).forEach(mode => {
    modeAnsweredCounters[mode] = modeCounts[mode] || 0;
  });

  const collectibles = await VocabBackend.loadCollectibles();
  earnedBadges = new Set(collectibles.badgeIds);
  earnedPuzzlePieces = new Set(collectibles.puzzlePieceIds);

  const mascots = await VocabBackend.loadMascots();
  earnedMascots = new Set(mascots.map(m => m.mascot_id));
  earnedExclusivos = mascots.filter(m => m.rarity === 'exclusivo');

  updateLevelSelect();
  checkPuzzlePieces();
}

initApp();
