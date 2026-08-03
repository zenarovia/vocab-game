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

const VOCAB = VOCAB_SET_1;

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

// English number words 0-10 — accepted as equivalent to the digit when the
// expected answer is a number (e.g. typing "one" counts the same as "1").
const ENGLISH_NUMBER_WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];

// ---- Per-word performance memory -------------------------------------
// Persisted per student via Supabase — hydrated on load in initApp(),
// and every change is saved through markWordStatsChanged() below.
let wordStats = {}; // number -> { wrong: 0, correct: 0 }
function statsFor(n){
  if(!wordStats[n]) wordStats[n] = { wrong: 0, correct: 0 };
  return wordStats[n];
}
function markWordStatsChanged(number){
  const s = statsFor(number);
  VocabBackend.saveWordProgress(number, s.correct, s.wrong);
}

// Weighted pick: words with more wrong attempts are more likely to
// resurface. This is the "adaptive-lite" stand-in for the real
// per-word adaptive-difficulty engine described in the full spec.
function pickWordsForRound(count, pool){
  const source = pool || VOCAB;
  const weighted = source.map(v => {
    const s = statsFor(v.number);
    const weight = 1 + s.wrong * 2; // struggling words appear more often
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

// Continuous single-word picker (typing/listening) — avoids repeating any
// of the last couple of words asked, so a heavily-weighted struggling word
// can't come up several times in a row by chance. Falls back to allowing
// repeats only if the pool is too small to avoid them.
const recentContinuousWords = [];
const RECENT_AVOID_COUNT = 2;
function pickNextContinuousWord(pool){
  const source = (pool && pool.length) ? pool : VOCAB;
  const avoidSet = new Set(recentContinuousWords.slice(-RECENT_AVOID_COUNT));
  let candidates = source.filter(v => !avoidSet.has(v.number));
  if(candidates.length === 0) candidates = source; // pool too small — allow repeats

  const weighted = candidates.map(v => {
    const s = statsFor(v.number);
    const weight = 1 + s.wrong * 2;
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
// Matching → Typing → Listening → Dictation → Context → Speed → Bonus.
// Each level requires the previous one to be both unlocked AND genuinely
// practiced (not just unlocked a second ago) before the next one opens up.
const GRADUATION_THRESHOLD_COUNT = 3; // words needed before Typing unlocks
let totalTypingAnswered = 0;    // practice done in Typing — gates Listening
let totalListeningAnswered = 0; // practice done in Listening — gates Dictation
let totalDictationAnswered = 0; // practice done in Dictation — gates Fill-in-context
let totalContextAnswered = 0;   // practice done in Context — gates Speed
let totalSpeedAnswered = 0;     // practice done in Speed — gates Bonus

function masteryScore(number){
  const s = statsFor(number);
  return s.correct - s.wrong;
}
function getGraduatedWords(){
  return VOCAB.filter(v => masteryScore(v.number) >= 1);
}
function isModeUnlocked(mode){
  if(mode === 'matching') return true;
  if(mode === 'typing') return getGraduatedWords().length >= GRADUATION_THRESHOLD_COUNT;
  if(mode === 'listening') return isModeUnlocked('typing') && totalTypingAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'dictation') return isModeUnlocked('listening') && totalListeningAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'context') return isModeUnlocked('dictation') && totalDictationAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'speed') return isModeUnlocked('context') && totalContextAnswered >= MIN_TYPING_QUESTIONS;
  if(mode === 'bonus') return isModeUnlocked('speed') && totalSpeedAnswered >= MIN_TYPING_QUESTIONS;
  return false;
}
function poolForMode(mode){
  if(mode === 'matching') return VOCAB;
  const graduated = getGraduatedWords();
  return graduated.length > 0 ? graduated : VOCAB;
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
};

// ---- DOM refs ----------------------------------------------------------
const screens = {
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  complete: document.getElementById('screen-complete'),
  setup: document.getElementById('screen-setup'),
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
const levelButtons = {
  matching: document.getElementById('levelBtnMatching'),
  typing: document.getElementById('levelBtnTyping'),
  listening: document.getElementById('levelBtnListening'),
  dictation: document.getElementById('levelBtnDictation'),
  context: document.getElementById('levelBtnContext'),
  speed: document.getElementById('levelBtnSpeed'),
  bonus: document.getElementById('levelBtnBonus'),
};

function updateLevelSelect(){
  Object.entries(levelButtons).forEach(([mode, btn]) => {
    const unlocked = isModeUnlocked(mode);
    btn.disabled = !unlocked;
    btn.classList.toggle('is-active', state.mode === mode);
  });
}

Object.entries(levelButtons).forEach(([mode, btn]) => {
  btn.addEventListener('click', () => startRound(mode));
});

function showScreen(name){
  Object.entries(screens).forEach(([k, el]) => el.hidden = (k !== name));
  state.screen = name;
  // Level bar is the way to choose/re-choose a level — visible except
  // mid-round or during first-time setup.
  levelSelectEl.hidden = (name === 'game' || name === 'setup');
  if(name !== 'game' && name !== 'setup'){
    updateLevelSelect();
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

  if(mode === 'typing' || mode === 'listening' || mode === 'dictation' || mode === 'context' || mode === 'speed' || mode === 'bonus'){
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
  state.roundWords = pickWordsForRound(count, pool);
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
  const s = statsFor(number);

  // Tab-switch guard: correct answer still resolves visually and counts
  // as participation, but does not register as mastery progress.
  const countsForMastery = !tabSwitchedDuringRound;
  if(countsForMastery){
    s.correct += MODALITY_WEIGHT.matching;
    markWordStatsChanged(number);
  }
  state.correctAttempts++;
  state.streak++;

  setTimeout(() => {
    a.classList.add('is-matched');
    b.classList.add('is-matched');
    state.matchedCount++;

    const bonus = (state.streak >= 3 ? 2 : 1) * MODALITY_WEIGHT.matching;
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
  if(state.mode === 'typing' || state.mode === 'listening' || state.mode === 'dictation' || state.mode === 'context' || state.mode === 'speed' || state.mode === 'bonus'){
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

  if(state.mode === 'typing' || state.mode === 'listening' || state.mode === 'dictation' || state.mode === 'context' || state.mode === 'speed' || state.mode === 'bonus'){
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
  const modeLabels = { typing: 'Typing', listening: 'Listening', dictation: 'Dictation', context: 'Fill-in-Context', speed: 'Speed Challenge', bonus: 'Bonus' };
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
  const v = pickNextContinuousWord(state.typingPool);
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

// Shared resolver for the click-based bonus sub-formats (true/false,
// odd-one-out) — mirrors resolveTypingAnswer's bookkeeping (coins,
// streak, question count) without forcing a single-word attribution
// for formats that don't cleanly map to one word (odd-one-out).
function resolveBonusClick(isCorrect, attributedNumber, wrongFeedbackText){
  stopSpeedTimer();

  if(attributedNumber !== null && attributedNumber !== undefined){
    const s = statsFor(attributedNumber);
    if(isCorrect){
      const countsForMastery = !tabSwitchedDuringRound;
      if(countsForMastery){
        s.correct += BONUS_WEIGHT;
        markWordStatsChanged(attributedNumber);
      }
    } else {
      s.wrong++;
      markWordStatsChanged(attributedNumber);
    }
  }

  if(isCorrect){
    state.correctAttempts++;
    state.streak++;
    const bonus = (state.streak >= 3 ? 2 : 1) * BONUS_WEIGHT;
    earnCoins(bonus);
    typingFeedback.textContent = state.streak >= 3 ? `¡Racha! +${bonus}` : `¡Correcto! +${bonus}`;
    typingFeedback.className = 'typing-feedback correct';
  } else {
    state.wrongAttempts++;
    state.streak = 0;
    typingFeedback.textContent = wrongFeedbackText || 'Inténtalo la próxima vez.';
    typingFeedback.className = 'typing-feedback wrong';
  }

  state.typingQuestionCount++;
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

  // Pick one word, weighted toward ones missed more, while avoiding an
  // immediate repeat of the last couple of words asked.
  const v = pickNextContinuousWord(state.typingPool);
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
  const s = statsFor(v.number);
  const weight = isContext ? CONTEXT_WEIGHT
    : isDictation ? DICTATION_WEIGHT
    : isSpeed ? SPEED_WEIGHT
    : state.mode === 'bonus' ? BONUS_WEIGHT
    : MODALITY_WEIGHT[state.mode];

  if(isCorrect){
    const countsForMastery = !tabSwitchedDuringRound;
    if(countsForMastery){
      s.correct += weight;
      markWordStatsChanged(v.number);
    }
    state.correctAttempts++;
    state.streak++;
    const bonus = (state.streak >= 3 ? 2 : 1) * weight;
    earnCoins(bonus);
    typingFeedback.textContent = state.streak >= 3 ? `¡Racha! +${bonus}` : `¡Correcto! +${bonus}`;
    typingFeedback.classList.add('correct');
  } else {
    s.wrong++;
    markWordStatsChanged(v.number);
    state.wrongAttempts++;
    state.streak = 0;
    typingInput.classList.add('is-wrong');
    typingFeedback.textContent = given.length === 0
      ? `¡Se acabó el tiempo! Era: ${expected}`
      : `La respuesta era: ${expected}`;
    typingFeedback.classList.add('wrong');
  }

  state.typingQuestionCount++;
  if(state.mode === 'typing'){ totalTypingAnswered++; VocabBackend.saveModeCount(VocabBackend.CURRENT_SET_ID, 'typing', totalTypingAnswered); }
  if(state.mode === 'listening'){ totalListeningAnswered++; VocabBackend.saveModeCount(VocabBackend.CURRENT_SET_ID, 'listening', totalListeningAnswered); }
  if(state.mode === 'dictation'){ totalDictationAnswered++; VocabBackend.saveModeCount(VocabBackend.CURRENT_SET_ID, 'dictation', totalDictationAnswered); }
  if(state.mode === 'context'){ totalContextAnswered++; VocabBackend.saveModeCount(VocabBackend.CURRENT_SET_ID, 'context', totalContextAnswered); }
  if(state.mode === 'speed'){ totalSpeedAnswered++; VocabBackend.saveModeCount(VocabBackend.CURRENT_SET_ID, 'speed', totalSpeedAnswered); }
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

  await hydrateFromBackend();
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
  const progress = await VocabBackend.loadStudentProgress(VocabBackend.CURRENT_SET_ID);

  wordStats = progress.wordStats || {};
  coins = progress.coins || 0;
  coinValueEl.textContent = coins;

  const modeCounts = progress.modeCounts || {};
  totalTypingAnswered = modeCounts.typing || 0;
  totalListeningAnswered = modeCounts.listening || 0;
  totalDictationAnswered = modeCounts.dictation || 0;
  totalContextAnswered = modeCounts.context || 0;
  totalSpeedAnswered = modeCounts.speed || 0;

  updateLevelSelect();
}

initApp();
