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
const VOCAB = [
  { number: 0,  word: 'cero' },
  { number: 1,  word: 'uno' },
  { number: 2,  word: 'dos' },
  { number: 3,  word: 'tres' },
  { number: 4,  word: 'cuatro' },
  { number: 5,  word: 'cinco' },
  { number: 6,  word: 'seis' },
  { number: 7,  word: 'siete' },
  { number: 8,  word: 'ocho' },
  { number: 9,  word: 'nueve' },
  { number: 10, word: 'diez' },
];

const PAIRS_PER_ROUND = 6;

// ---- Per-word performance memory (adaptive-lite) ----------------------
// Real system: persisted per student across sessions. Here: in-memory
// per browser session only, as a stand-in for that future data store.
const wordStats = {}; // number -> { wrong: 0, correct: 0 }
function statsFor(n){
  if(!wordStats[n]) wordStats[n] = { wrong: 0, correct: 0 };
  return wordStats[n];
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

// ---- Round-level modality decision (simplified adaptive step) ---------
// Full spec calls for per-word modality assignment based on that word's
// own struggle history. This prototype approximates it at the round
// level: once enough words are "graduated" (answered right more than
// wrong in matching), rounds start testing them with typing instead —
// a harder modality, since typing requires recall, not recognition.
// Words still below that bar keep appearing in matching.
let roundCounter = 0;
function masteryScore(number){
  const s = statsFor(number);
  return s.correct - s.wrong;
}
function decideRoundModality(){
  roundCounter++;
  const graduated = VOCAB.filter(v => masteryScore(v.number) >= 2);
  const strugglingOrNew = VOCAB.filter(v => masteryScore(v.number) < 2);
  if(graduated.length >= 4 && strugglingOrNew.length > 0 && roundCounter % 2 === 0){
    return { mode: 'typing', pool: graduated };
  }
  if(graduated.length >= 4 && strugglingOrNew.length === 0){
    return { mode: 'typing', pool: graduated };
  }
  return { mode: 'matching', pool: strugglingOrNew.length > 0 ? strugglingOrNew : VOCAB };
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
  coinValueEl.textContent = coins;
  coinCounterEl.classList.add('bump');
  setTimeout(()=>coinCounterEl.classList.remove('bump'), 180);
}

// ---- App state -------------------------------------------------------
const state = {
  screen: 'start',
  mode: 'matching',       // 'matching' | 'typing' for the current round
  roundWords: [],
  roundTotal: 0,
  matchedCount: 0,
  wrongAttempts: 0,
  correctAttempts: 0,
  streak: 0,
  openCard: null,   // currently flipped, unmatched card (matching mode)
  lock: false,      // input lock during resolve animation
  typingIndex: 0,   // which word we're on (typing mode)
  typingPromptKind: 'number', // what's shown: 'number' -> answer word, or 'word' -> answer number
};

// ---- DOM refs ----------------------------------------------------------
const screens = {
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  complete: document.getElementById('screen-complete'),
};
const board = document.getElementById('board');
const typingPanel = document.getElementById('typingPanel');
const typingPrompt = document.getElementById('typingPrompt');
const typingInstruction = document.getElementById('typingInstruction');
const typingForm = document.getElementById('typingForm');
const typingInput = document.getElementById('typingInput');
const typingFeedback = document.getElementById('typingFeedback');
const modeLabelEl = document.getElementById('modeLabel');
const progressFill = document.getElementById('progressFill');
const pairsLeftEl = document.getElementById('pairsLeft');
const streakLabelEl = document.getElementById('streakLabel');
const toastEl = document.getElementById('toast');

function showScreen(name){
  Object.entries(screens).forEach(([k, el]) => el.hidden = (k !== name));
  state.screen = name;
}

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(()=>toastEl.classList.remove('show'), 1100);
}

// ---- Round setup --------------------------------------------------------
function startRound(){
  const decision = decideRoundModality();
  state.mode = decision.mode;
  state.wrongAttempts = 0;
  state.correctAttempts = 0;
  state.streak = 0;
  tabSwitchedDuringRound = false;

  if(state.mode === 'typing'){
    startTypingRound(decision.pool);
  } else {
    startMatchingRound(decision.pool);
  }
}

function startMatchingRound(pool){
  modeLabelEl.textContent = 'Matching';
  board.hidden = false;
  typingPanel.hidden = true;

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
    s.correct++;
  }
  state.correctAttempts++;
  state.streak++;

  setTimeout(() => {
    a.classList.add('is-matched');
    b.classList.add('is-matched');
    state.matchedCount++;

    const bonus = state.streak >= 3 ? 2 : 1;
    earnCoins(bonus);
    showToast(state.streak >= 3 ? '¡Racha! +' + bonus : '¡Correcto! +1');

    updateProgress();
    state.lock = false;

    if(state.matchedCount === state.roundTotal){
      setTimeout(finishRound, 500);
    }
  }, 350);
}

function resolveWrong(a, b){
  state.lock = true;
  const number = Number(a.dataset.number);
  statsFor(number).wrong++;
  state.wrongAttempts++;
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
  const doneCount = state.mode === 'typing' ? state.typingIndex : state.matchedCount;
  const pct = Math.round((doneCount / state.roundTotal) * 100);
  progressFill.style.width = pct + '%';
  const left = state.roundTotal - doneCount;
  const unit = state.mode === 'typing' ? (left === 1 ? '1 word left' : `${left} words left`)
                                        : (left === 1 ? '1 pair left' : `${left} pairs left`);
  pairsLeftEl.textContent = unit;
  streakLabelEl.textContent = `Streak: ${state.streak}`;
}

function finishRound(){
  const total = state.correctAttempts + state.wrongAttempts;
  const accuracy = total > 0 ? Math.round((state.correctAttempts/total)*100) : 100;
  document.getElementById('finalAccuracy').textContent = accuracy;

  const roundCoins = state.streak >= 3 ? '+' + (state.roundTotal + 2) : '+' + state.roundTotal;
  document.getElementById('coinsEarnedThisSession').textContent = roundCoins;

  const masteryNote = document.getElementById('masteryNote');
  masteryNote.textContent = tabSwitchedDuringRound
    ? 'This round\u2019s answers counted for participation, but not mastery (left the tab).'
    : 'All answers this round counted toward mastery.';

  showScreen('complete');
}

// ---- Typing modality -----------------------------------------------------
// Words that "graduate" out of matching (per decideRoundModality) get
// tested here instead — recall (typing the answer) rather than
// recognition (picking from two visible options), a meaningfully
// harder modality for the adaptive system to step students up into.
function startTypingRound(pool){
  modeLabelEl.textContent = 'Typing';
  board.hidden = true;
  typingPanel.hidden = false;

  state.typingIndex = 0;
  const count = Math.min(PAIRS_PER_ROUND, pool.length);
  state.roundWords = pickWordsForRound(count, pool);
  state.roundTotal = count;

  showScreen('game');
  updateProgress();
  renderTypingWord();
}

function renderTypingWord(){
  typingFeedback.textContent = '';
  typingFeedback.className = 'typing-feedback';
  typingInput.value = '';
  typingInput.classList.remove('is-wrong');
  typingInput.disabled = false;

  const v = state.roundWords[state.typingIndex];
  // Randomize direction per word: sometimes show the digit and ask for
  // the word, sometimes show the word and ask for the digit.
  state.typingPromptKind = Math.random() < 0.5 ? 'number' : 'word';
  const promptText = state.typingPromptKind === 'number' ? String(v.number) : v.word;
  typingInstruction.textContent = state.typingPromptKind === 'number'
    ? 'Type the word for:'
    : 'Type the number for:';

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

  typingInput.focus();
}

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

typingForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if(typingInput.disabled) return; // already resolving previous answer

  const v = state.roundWords[state.typingIndex];
  const expected = state.typingPromptKind === 'number' ? v.word : String(v.number);
  const given = normalizeAnswer(typingInput.value);
  const isCorrect = given === normalizeAnswer(expected);
  const s = statsFor(v.number);

  if(isCorrect){
    const countsForMastery = !tabSwitchedDuringRound;
    if(countsForMastery) s.correct++;
    state.correctAttempts++;
    state.streak++;
    const bonus = state.streak >= 3 ? 2 : 1;
    earnCoins(bonus);
    typingFeedback.textContent = state.streak >= 3 ? `¡Racha! +${bonus}` : '¡Correcto!';
    typingFeedback.classList.add('correct');
  } else {
    s.wrong++;
    state.wrongAttempts++;
    state.streak = 0;
    typingInput.classList.add('is-wrong');
    typingFeedback.textContent = `La respuesta era: ${expected}`;
    typingFeedback.classList.add('wrong');
  }

  updateProgress();
  state.typingIndex++;
  typingInput.disabled = true;

  setTimeout(() => {
    if(state.typingIndex >= state.roundTotal){
      finishRound();
    } else {
      renderTypingWord();
    }
  }, isCorrect ? 550 : 1100);
});

// ---- Wire up buttons ----------------------------------------------------
document.getElementById('btnStart').addEventListener('click', startRound);
document.getElementById('btnAgain').addEventListener('click', startRound);
