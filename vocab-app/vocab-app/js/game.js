/* ============================================================
   NÚMERO NEST — core session engine (prototype slice)
   Scope of this file: ONE modality (matching), Batch 1 (0–10).
   Everything else in the full spec (other 4 modalities, dual
   dashboards, competition, mascot economy, grading export,
   teacher tools) builds on top of this same data model —
   it is intentionally NOT built into this first slice.
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
function pickWordsForRound(count){
  const weighted = VOCAB.map(v => {
    const s = statsFor(v.number);
    const weight = 1 + s.wrong * 2; // struggling words appear more often
    return { v, weight };
  });
  const pool = [];
  weighted.forEach(({v, weight}) => { for(let i=0;i<weight;i++) pool.push(v); });

  const chosen = [];
  const seen = new Set();
  while(chosen.length < count && seen.size < VOCAB.length){
    const pick = pool[Math.floor(Math.random()*pool.length)];
    if(!seen.has(pick.number)){
      seen.add(pick.number);
      chosen.push(pick);
    }
  }
  return chosen;
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
  roundWords: [],
  matchedCount: 0,
  wrongAttempts: 0,
  correctAttempts: 0,
  streak: 0,
  openCard: null, // currently flipped, unmatched card
  lock: false,    // input lock during resolve animation
};

// ---- DOM refs ----------------------------------------------------------
const screens = {
  start: document.getElementById('screen-start'),
  game: document.getElementById('screen-game'),
  complete: document.getElementById('screen-complete'),
};
const board = document.getElementById('board');
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
  state.matchedCount = 0;
  state.wrongAttempts = 0;
  state.correctAttempts = 0;
  state.streak = 0;
  state.openCard = null;
  state.lock = false;
  tabSwitchedDuringRound = false;

  state.roundWords = pickWordsForRound(PAIRS_PER_ROUND);

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

    if(state.matchedCount === PAIRS_PER_ROUND){
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
  const pct = Math.round((state.matchedCount / PAIRS_PER_ROUND) * 100);
  progressFill.style.width = pct + '%';
  const left = PAIRS_PER_ROUND - state.matchedCount;
  pairsLeftEl.textContent = left === 1 ? '1 pair left' : `${left} pairs left`;
  streakLabelEl.textContent = `Streak: ${state.streak}`;
}

function finishRound(){
  const total = state.correctAttempts + state.wrongAttempts;
  const accuracy = total > 0 ? Math.round((state.correctAttempts/total)*100) : 100;
  document.getElementById('finalAccuracy').textContent = accuracy;

  const roundCoins = state.streak >= 3 ? '+' + (PAIRS_PER_ROUND + 2) : '+' + PAIRS_PER_ROUND;
  document.getElementById('coinsEarnedThisSession').textContent = roundCoins;

  const masteryNote = document.getElementById('masteryNote');
  masteryNote.textContent = tabSwitchedDuringRound
    ? 'This round\u2019s matches counted for participation, but not mastery (left the tab).'
    : 'All matches this round counted toward mastery.';

  showScreen('complete');
}

// ---- Wire up buttons ----------------------------------------------------
document.getElementById('btnStart').addEventListener('click', startRound);
document.getElementById('btnAgain').addEventListener('click', startRound);
