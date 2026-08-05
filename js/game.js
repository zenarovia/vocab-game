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
  { number: 0,  word: 'cero',   audio: 'assets/audio/cero.mp3?v=2',   context: 'Cinco menos cinco son ___.' },
  { number: 1,  word: 'uno',    audio: 'assets/audio/uno.mp3?v=2',    context: 'Tres menos dos son ___.' },
  { number: 2,  word: 'dos',    audio: 'assets/audio/dos.mp3?v=2',    context: 'Tengo ___ manzanas en la mesa.', contextImage: 'assets/context/dos.png' },
  { number: 3,  word: 'tres',   audio: 'assets/audio/tres.mp3?v=2',   context: 'Hay ___ libros en la mesa.', contextImage: 'assets/context/tres.png' },
  { number: 4,  word: 'cuatro', audio: 'assets/audio/cuatro.mp3?v=2', context: 'Mi casa tiene ___ ventanas.', contextImage: 'assets/context/cuatro.png' },
  { number: 5,  word: 'cinco',  audio: 'assets/audio/cinco.mp3?v=2',  context: 'Tengo ___ dólares en mi mochila.', contextImage: 'assets/context/cinco.png' },
  { number: 6,  word: 'seis',   audio: 'assets/audio/seis.mp3?v=2',   context: 'Hay ___ pelotas en la caja.', contextImage: 'assets/context/seis.png' },
  { number: 7,  word: 'siete',  audio: 'assets/audio/siete.mp3?v=2',  context: 'La semana tiene ___ días.' },
  { number: 8,  word: 'ocho',   audio: 'assets/audio/ocho.mp3?v=2',   context: 'La araña tiene ___ patas.' },
  { number: 9,  word: 'nueve',  audio: 'assets/audio/nueve.mp3?v=2',  context: 'Cuatro más cinco son ___.' },
  { number: 10, word: 'diez',   audio: 'assets/audio/diez.mp3?v=2',   context: 'Tengo ___ dedos en las manos.' },
];

const VOCAB_SET_2 = [
  { number: 11, word: 'once',       audio: 'assets/audio/once.mp3',       context: 'Cinco más seis son ___.' },
  { number: 12, word: 'doce',       audio: 'assets/audio/doce.mp3',       context: 'Una docena tiene ___ huevos.' },
  { number: 13, word: 'trece',      audio: 'assets/audio/trece.mp3',      context: 'Seis más siete son ___.' },
  { number: 14, word: 'catorce',    audio: 'assets/audio/catorce.mp3',    context: 'El día de San Valentín es el ___ de febrero.' },
  { number: 15, word: 'quince',     audio: 'assets/audio/quince.mp3',     context: 'Siete más ocho son ___.' },
  { number: 16, word: 'dieciséis',  audio: 'assets/audio/dieciseis.mp3',  context: 'Ocho más ocho son ___.' },
  { number: 17, word: 'diecisiete', audio: 'assets/audio/diecisiete.mp3', context: 'Diez más siete son ___.' },
  { number: 18, word: 'dieciocho',  audio: 'assets/audio/dieciocho.mp3',  context: 'A los ___ años, puedes votar en Estados Unidos.' },
  { number: 19, word: 'diecinueve', audio: 'assets/audio/diecinueve.mp3', context: 'Diez más nueve son ___.' },
  { number: 20, word: 'veinte',     audio: 'assets/audio/veinte.mp3',     context: 'Diez más diez son ___.' },
];

// ---- Set registry -------------------------------------------------------
// Each set has its own id (matches the Supabase vocab_sets.id), a display
// name, and its own word list. Sets are sequential, same as levels — a
// set only unlocks once the one before it has been fully graduated in
// Matching. previousSetId is null for the first set (always unlocked).
const VOCAB_SETS = {
  'numbers-0-10':  { id: 'numbers-0-10',  name: 'Numbers 0-10',  words: VOCAB_SET_1, order: 0, previousSetId: null },
  'numbers-11-20': { id: 'numbers-11-20', name: 'Numbers 11-20', words: VOCAB_SET_2, order: 1, previousSetId: 'numbers-0-10' },
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

// English number words 0-10 — accepted as equivalent to the digit when the
// expected answer is a number (e.g. typing "one" counts the same as "1").
const ENGLISH_NUMBER_WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];

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
// rather than the system deciding automatically. Strictly sequential:
// Matching → Typing → Listening → Dictation → Context → Speed → Bonus →
// Sequence. Each level requires the previous one to be both unlocked AND
// genuinely practiced (not just unlocked a second ago) before the next
// one opens up.
const GRADUATION_THRESHOLD_COUNT = 3; // words needed before Typing unlocks
let totalTypingAnswered = 0;    // practice done in Typing — gates Listening
let totalListeningAnswered = 0; // practice done in Listening — gates Dictation
let totalDictationAnswered = 0; // practice done in Dictation — gates Fill-in-context
let totalContextAnswered = 0;   // practice done in Context — gates Speed
let totalSpeedAnswered = 0;     // practice done in Speed — gates Bonus
let totalBonusAnswered = 0;     // practice done in Bonus — gates Sequence

function masteryScore(number){
  const s = statsFor('matching', number);
  return s.correct - s.wrong;
}
function getGraduatedWords(){
  return VOCAB.filter(v => masteryScore(v.number) >= 1);
}
function isModeUnlocked(mode){
  if(teacherOverrideActive) return true; // whole-class activity — bypasses individual progress
  if(mode === 'matching') return true;
  if(mode === 'typing') return getGraduatedWords().length >= GRADUATION_THRESHOLD_COUNT;
  if(mode === 'listening') return isModeUnlocked('typing') && totalTypingAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'dictation') return isModeUnlocked('listening') && totalListeningAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'context') return isModeUnlocked('dictation') && totalDictationAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'speed') return isModeUnlocked('context') && totalContextAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'bonus') return isModeUnlocked('speed') && totalSpeedAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'sequence') return isModeUnlocked('bonus') && totalBonusAnswered >= MIN_TYPING_QUESTIONS;
  return false;
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
  bonusFormat: null,  // 'mathfacts' | 'truefalse' | 'oddoneout' — current bonus sub-format
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
  Object.entries(levelButtons).forEach(([mode, btn]) => {
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
  totalTypingAnswered = 0;
  totalListeningAnswered = 0;
  totalDictationAnswered = 0;
  totalContextAnswered = 0;
  totalSpeedAnswered = 0;
  totalBonusAnswered = 0;
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
  await renderLeaderboard();
});
btnCloseLeaderboard.addEventListener('click', () => showScreen('start'));

async function renderLeaderboard(){
  leaderboardList.innerHTML = '<p class="leaderboard-empty">Loading...</p>';
  const standings = await VocabBackend.getClassLeaderboard();

  if(standings.length === 0){
    leaderboardList.innerHTML = '<p class="leaderboard-empty">No class activity yet this week.</p>';
    return;
  }

  leaderboardList.innerHTML = '';
  standings.forEach((row, i) => {
    const el = document.createElement('div');
    el.className = 'leaderboard-row' + (i === 0 ? ' is-first' : '');
    el.innerHTML = `
      <span class="leaderboard-rank">#${i + 1}</span>
      <span class="leaderboard-info">
        <span class="leaderboard-class">${row.class_period}</span><br>
        <span class="leaderboard-detail">${Math.round(row.avg_participation_this_week)} avg questions &middot; ${Math.round(row.avg_mastery_this_week)} avg mastery pts</span>
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
  } else {
    teacherPasscodeStep.hidden = false;
    teacherActiveStep.hidden = true;
    teacherDashboardStep.hidden = true;
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

function showScreen(name){
  Object.entries(screens).forEach(([k, el]) => el.hidden = (k !== name));
  state.screen = name;
  // Level bar is the way to choose/re-choose a level — visible except
  // mid-round, first-time setup, or the leaderboard. Set-select follows
  // the same rule.
  const hideBars = (name === 'game' || name === 'setup' || name === 'leaderboard');
  levelSelectEl.hidden = hideBars;
  setSelectEl.hidden = hideBars;
  btnLeaderboard.hidden = (name === 'game' || name === 'setup' || name === 'leaderboard');
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

    const unlocked = state.typingQuestionCount >= MIN_TYPING_QUESTIONS;
    btnFinishTyping.hidden = !unlocked;
    finishHint.hidden = unlocked;
    if(!unlocked){
      const remaining = MIN_TYPING_QUESTIONS - state.typingQuestionCount;
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
  }

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
  let displayNumber = v.number;
  if(!isTrue){
    const others = VOCAB.filter(o => o.number !== v.number);
    displayNumber = others[Math.floor(Math.random() * others.length)].number;
  }
  return { v, displayNumber, isTrue };
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
  totalBonusAnswered++;
  VocabBackend.saveModeCount(activeSetId, 'bonus', totalBonusAnswered);
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

    const formats = ['mathfacts', 'truefalse', 'oddoneout'];
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
    } else if(state.bonusFormat === 'truefalse'){
      typingInstruction.textContent = '¿Es correcto?';
      const { v: tfWord, displayNumber, isTrue } = pickTrueFalseQuestion();
      state.currentTypingWord = tfWord;
      state.tfIsTrue = isTrue;
      const statement = `${tfWord.word} = ${displayNumber}`;

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

  // Accept the Spanish word, the digit, or the English word — any of the
  // three ways a student might reasonably answer, regardless of mode.
  const acceptableAnswers = [
    normalizeAnswer(v.word),
    normalizeAnswer(String(v.number)),
    normalizeAnswer(ENGLISH_NUMBER_WORDS[v.number]),
  ];
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
  if(state.mode === 'typing'){ totalTypingAnswered++; VocabBackend.saveModeCount(activeSetId, 'typing', totalTypingAnswered); }
  if(state.mode === 'listening'){ totalListeningAnswered++; VocabBackend.saveModeCount(activeSetId, 'listening', totalListeningAnswered); }
  if(state.mode === 'dictation'){ totalDictationAnswered++; VocabBackend.saveModeCount(activeSetId, 'dictation', totalDictationAnswered); }
  if(state.mode === 'context'){ totalContextAnswered++; VocabBackend.saveModeCount(activeSetId, 'context', totalContextAnswered); }
  if(state.mode === 'speed'){ totalSpeedAnswered++; VocabBackend.saveModeCount(activeSetId, 'speed', totalSpeedAnswered); }
  if(state.mode === 'bonus'){ totalBonusAnswered++; VocabBackend.saveModeCount(activeSetId, 'bonus', totalBonusAnswered); }
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
  let profile = await VocabBackend.getStudentProfile();

  if(!profile){
    profile = await promptForStudentSetup();
  }

  assignedSetId = await VocabBackend.getAssignedSetForClassPeriod(profile.class_period);
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
    const errorEl = document.getElementById('setupError');

    form.addEventListener('submit', async function onSubmit(e){
      e.preventDefault();
      const name = nameInput.value.trim();
      if(!name) return;
      const created = await VocabBackend.createStudentProfile(name, periodInput.value.trim());
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
  totalTypingAnswered = modeCounts.typing || 0;
  totalListeningAnswered = modeCounts.listening || 0;
  totalDictationAnswered = modeCounts.dictation || 0;
  totalContextAnswered = modeCounts.context || 0;
  totalSpeedAnswered = modeCounts.speed || 0;
  totalBonusAnswered = modeCounts.bonus || 0;

  updateLevelSelect();
}

initApp();
