# Número Nest — vocab practice prototype

This is the **first build slice** from the full vocabulary-program spec —
not the whole system. It proves out the core loop everything else will be
layered on top of:

**What's in this slice:**
- Two modalities: matching (word ↔ digit) and typing (recall), Batch 1
  content (numbers 0–10)
- Round-level adaptive step — once a word is answered right more than
  wrong in matching, it "graduates" into typing rounds instead (recall is
  meaningfully harder than recognition). A simplified stand-in for the
  full per-word adaptive engine described in the spec.
- Vocab rendered as canvas images, not selectable text — defeats browser
  translate extensions and copy/paste, per the cheating-prevention design
- Coin economy — matches/correct answers earn coins, streaks earn bonus coins
- Tab-switch detection — leaving the tab still lets the round resolve
  (participation), but flags that round's answers as not counting toward
  mastery, closing the screenshot → Google Lens loophole
- Visual identity: jungle-canopy palette + alebrije-inspired card backs,
  Baloo 2 / Nunito type, papercut-unfold card flip as the signature motif

**Deliberately NOT in this slice yet** (next layers to build):
- The other 3 modalities (listening, fill-in-context, speed challenge)
- Persisted per-student data (currently all state is in-browser, resets on
  refresh — needs a real backend/database, e.g. Supabase)
- Dual dashboards (student-facing display + teacher-facing flags)
- Class-vs-class competition, grading export, CSV content upload
- Mascot mystery-egg system, rarity tiers, teacher-defined bonus rewards
- Per-student differentiation overrides, teacher reset/notes tools

## File structure
```
vocab-app/
├── index.html       — screens: start / game / complete
├── css/style.css     — design tokens + all styling
├── js/game.js        — game engine (well-commented, notes future backend hooks)
└── README.md
```

## Running it locally
No build step — just open `index.html` in a browser, or serve the folder
with any static server (e.g. `npx serve .`).

## Deploying (GitHub + Vercel, as decided)
1. Create a new repository on your GitHub account (e.g. `numero-nest`)
2. Push this folder's contents to that repo
3. Go to vercel.com (or netlify.com), sign in with your GitHub account,
   and import the repo — no build settings needed, it's a static site
4. Vercel/Netlify gives you a live URL immediately, and auto-redeploys
   every time new code is pushed to the repo

Once that one-time connection exists, every future update just needs a
`git push` — no repeated setup.
