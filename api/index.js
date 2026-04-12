const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Player } = require("./game/player");
const { TexasHoldem } = require("./game/game");
const { botDecide, getGtoHint, getPosition, handKey } = require("./game/bot");
const { Deck } = require("./game/deck");
const { charts } = require("./gto");
const { bestHand, compareScores, handName } = require("./game/evaluator");

// ── Equity & outs calculator ──────────────────────────────────────────────────

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function buildFullDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ rank, suit, value: RANK_VALUES[rank] });
  return deck;
}

function cardId(c) { return c.rank + c.suit; }

// Score the best 5-card hand from hole + board
function scoreHand(hole, board) {
  const h = bestHand([...hole, ...board]);
  return h ? h.score : [0];
}

// Returns { equity, outs } for the human player.
// Opponents' cards are treated as unknown — equity is calculated against
// random hands from the remaining deck, matching real poker conditions.
function calcEquityAndOuts(game, humanIndex) {
  const human = game.players[humanIndex];
  const board = game.community;
  const phase = game.phase;

  if (!human.holeCards.length || phase === 'showdown') return null;

  // Only remove YOUR cards and community from the deck — opponents' cards unknown
  const usedIds = new Set();
  for (const c of board) usedIds.add(cardId(c));
  for (const c of human.holeCards) usedIds.add(cardId(c));

  const remaining = buildFullDeck().filter(c => !usedIds.has(cardId(c)));

  const numOpponents = game.players.filter(
    (p, i) => i !== humanIndex && !p.folded && p.holeCards.length
  ).length;

  if (!numOpponents) return { equity: 100, outs: null };

  // Monte Carlo for all streets — deal random hands to opponents each sample
  const SAMPLES = phase === 'river' ? 600 : 900;
  let wins = 0, total = 0;

  for (let s = 0; s < SAMPLES; s++) {
    const deck = [...remaining].sort(() => Math.random() - 0.5);
    let idx = 0;

    // Deal 2 unknown cards to each opponent
    const oppHands = [];
    let valid = true;
    for (let o = 0; o < numOpponents; o++) {
      if (idx + 2 > deck.length) { valid = false; break; }
      oppHands.push([deck[idx++], deck[idx++]]);
    }
    if (!valid) continue;

    // Complete the board with random runout cards
    const runoutNeeded = 5 - board.length;
    if (idx + runoutNeeded > deck.length) continue;
    const runBoard = [...board, ...deck.slice(idx, idx + runoutNeeded)];

    const myScore = scoreHand(human.holeCards, runBoard);
    let iWin = true;
    let isTie = false;
    for (const oppHole of oppHands) {
      const cmp = compareScores(scoreHand(oppHole, runBoard), myScore);
      if (cmp > 0) { iWin = false; isTie = false; break; }
      if (cmp === 0) isTie = true;
    }

    if (iWin && !isTie) wins += 1;
    else if (isTie)     wins += 0.5;
    total++;
  }

  const equity = total ? Math.round((wins / total) * 100) : 50;

  // Effective outs derived from equity via rule of 2 & 4.
  // This automatically discounts "dirty" outs (e.g. pairing the board) because
  // equity is already simulated against random opponent hands.
  let outs = null;
  if (phase === 'flop')      outs = Math.round(equity / 4);
  else if (phase === 'turn') outs = Math.round(equity / 2);

  return { equity, outs };
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── In-memory session ─────────────────────────────────────────────────────────

let session = null;

function createSession(numOpponents) {
  const startChips = 2000;
  const botNames = [
    "Alice",
    "Bob",
    "Charlie",
    "Diana",
    "Eve",
    "Frank",
    "Grace",
    "Hank",
  ];
  const players = [new Player("You", startChips, true)];
  for (let i = 0; i < numOpponents; i++) {
    players.push(new Player(botNames[i], startChips));
  }

  session = {
    game: new TexasHoldem(players),
    humanIndex: 0,
    lastActions: [],
    handResult: null,
    awaitingNewHand: false,
  };
}

function serializeCard(card) {
  if (!card) return null;
  return {
    rank: card.rank === "T" ? "10" : card.rank,
    suit: card.suit,
    value: card.value,
  };
}

// Compute side pots from each player's total contribution this hand.
//
// Tier breaks are created only at the totalBet levels of non-folded all-in
// players. Folded players' partial contributions roll into whichever tier
// covers their amount — they don't create extra tiers.
//
// Amounts use actual totalBet (always sums to the real pot).
// Eligibility uses effectiveBet (totalBet + pending call for the current
// street) so side pots don't disappear mid-betting-round.
//
// Returns [] when no real contested side pot exists.
function computeSidePots(game) {
  const hasAllIn = game.players.some((p) => p.allIn);
  if (!hasAllIn) return [];

  const contributors = game.players.filter((p) => p.totalBet > 0);
  if (!contributors.length) return [];

  // How much a player would have committed if they called the current bet
  const effectiveBet = (p) => {
    if (p.folded || p.allIn) return p.totalBet;
    return p.totalBet + Math.max(0, game.currentBet - p.currentBet);
  };

  // Tier breaks: all-in levels of active (non-folded) players only
  const allInLevels = [
    ...new Set(
      game.players.filter((p) => p.allIn && !p.folded).map((p) => p.totalBet),
    ),
  ].sort((a, b) => a - b);

  const maxBet = Math.max(...contributors.map((p) => effectiveBet(p)));
  const levels = allInLevels.includes(maxBet)
    ? allInLevels
    : [...allInLevels, maxBet];

  const pots = [];
  let prevLevel = 0;

  for (const level of levels) {
    // Amount: use actual totalBet so the sum always equals game.pot
    let amount = 0;
    for (const p of contributors) {
      amount += Math.max(0, Math.min(p.totalBet, level) - prevLevel);
    }
    // Eligibility: use effectiveBet so players mid-action still count
    const eligible = contributors.filter(
      (p) => !p.folded && effectiveBet(p) >= level,
    ).length;
    if (amount > 0) pots.push({ amount, eligible });
    prevLevel = level;
  }

  // A real side pot only exists when 2+ players contest a tier beyond the main pot
  const contestedSides = pots.slice(1).filter((p) => p.eligible >= 2);
  if (contestedSides.length === 0) return [];

  return [pots[0], ...contestedSides];
}

function buildState() {
  const { game, humanIndex, lastActions, handResult, awaitingNewHand } =
    session;

  const alive = game.activePlayers();
  const humanPlayer = game.players[humanIndex];
  // Treat the human as eliminated as soon as the hand ends with them at 0 chips,
  // or if they somehow have no cards and no chips (already skipped by startHand).
  const humanOut = humanPlayer.chips === 0 &&
    (awaitingNewHand || !humanPlayer.holeCards.length);
  const gameOver = alive.length <= 1 || humanOut;
  const gameWinner = gameOver && alive.length === 1 ? alive[0].name : null;

  const humanAlive = game.players[humanIndex].chips > 0;

  const isHumanTurn =
    !awaitingNewHand &&
    !gameOver &&
    humanAlive &&
    game.currentPlayerIndex === humanIndex &&
    game.phase !== "showdown";

  const players = game.players.map((p, i) => {
    // Always send real card values — the client decides what to show face-down
    const holeCards = p.holeCards.map(serializeCard);
    const active = p.chips > 0 || p.holeCards.length > 0;

    return {
      name: p.name,
      chips: p.chips,
      currentBet: p.currentBet,
      folded: p.folded,
      allIn: p.allIn,
      isHuman: i === humanIndex,
      isDealer: i === game.dealerIndex,
      isSB: i === game.sbIndex,
      isBB: i === game.bbIndex,
      position: active ? getPosition(i, game) : null,
      styleLabel: null,
      holeCards,
      eliminated: p.chips === 0 && !p.holeCards.length,
    };
  });

  const equityData = (!awaitingNewHand && !gameOver && game.phase !== null)
    ? calcEquityAndOuts(game, humanIndex)
    : null;

  const allInRunout = !awaitingNewHand && !gameOver &&
    game.phase !== 'showdown' && game.phase !== null &&
    game.currentPlayerIndex === -1;

  return {
    phase: game.phase,
    pot: game.pot,
    sidePots: computeSidePots(game),
    currentBet: game.currentBet,
    handNumber: game.handNumber,
    community: game.community.map(serializeCard),
    players,
    humanIndex,
    isHumanTurn,
    validActions: isHumanTurn ? game.getValidActions() : null,
    gtoHint: isHumanTurn && game.phase === 'preflop'
      ? getGtoHint(game.players[humanIndex], game)
      : null,
    lastActions: [...lastActions],
    currentPlayerIndex: game.currentPlayerIndex,
    handResult,
    awaitingNewHand,
    gameOver,
    gameWinner,
    smallBlind: game.smallBlind,
    bigBlind: game.bigBlind,
    equity: equityData?.equity ?? null,
    outs: equityData?.outs ?? null,
    allInRunout,
  };
}

function doShowdown() {
  const { game } = session;
  const winners = game.determineWinners();

  const hands = game.players
    .filter((p) => !p.folded && p.holeCards.length > 0)
    .map((p) => {
      const best = bestHand([...p.holeCards, ...game.community]);
      return {
        name: p.name,
        holeCards: p.holeCards.map(serializeCard),
        handName: best ? handName(best.score) : null,
      };
    });

  session.handResult = {
    type: "showdown",
    winners: winners.map((w) => ({
      name: w.player.name,
      handName: w.handName,
      amount: w.amount,
    })),
    hands,
  };
  session.awaitingNewHand = true;
}

function recordAction(player, action, raiseBy) {
  session.lastActions.push({
    player: player.name,
    action,
    raiseBy: raiseBy || 0,
    isHuman: !!player.isHuman,
  });
  if (session.lastActions.length > 20) session.lastActions.shift();

}

// Advance exactly one bot action; returns true if a step was taken
function advanceOneStep() {
  const { game } = session;

  if (session.awaitingNewHand || game.phase === "showdown") return false;

  // All-in runout: no one can bet this street — advance to the next street
  if (game.currentPlayerIndex === -1) {
    game.advancePhase();
    if (game.phase === "showdown") {
      doShowdown();
    }
    return true;
  }

  if (game.currentPlayerIndex === session.humanIndex) return false;

  const current = game.players[game.currentPlayerIndex];
  if (current.folded || current.allIn) return false;

  const { action, raiseBy } = botDecide(current, game);
  recordAction(current, action, raiseBy);

  const potBefore = game.pot;
  const result = game.act(action, raiseBy || 0);

  if (result.handOver) {
    session.handResult = {
      type: "fold-win",
      winners: result.winners.map((w) => ({
        name: w.player.name,
        amount: potBefore,
      })),
      hands: null,
    };
    session.awaitingNewHand = true;
    return true;
  }

  if (result.phaseChange) {
    game.advancePhase();
    if (game.phase === "showdown") {
      doShowdown();
    }
  }

  return true;
}

function applyHumanAction(action, raiseBy) {
  const { game } = session;
  const human = game.players[session.humanIndex];

  recordAction(human, action, raiseBy);

  const potBefore = game.pot;
  const result = game.act(action, raiseBy || 0);

  if (result.handOver) {
    session.handResult = {
      type: "fold-win",
      winners: result.winners.map((w) => ({
        name: w.player.name,
        amount: potBefore,
      })),
      hands: null,
    };
    session.awaitingNewHand = true;
    return;
  }

  if (result.phaseChange) {
    game.advancePhase();
    if (game.phase === "showdown") {
      doShowdown();
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────


app.post("/api/game/new", (req, res) => {
  const numOpponents = Math.max(
    1,
    Math.min(8, parseInt(req.body.numOpponents) || 1),
  );
  createSession(numOpponents);

  const info = session.game.startHand();
  if (!info) return res.status(500).json({ error: "Could not start hand" });

  session.lastActions = [];
  res.json(buildState());
});

app.post("/api/game/new-hand", (_req, res) => {
  if (!session) return res.status(400).json({ error: "No active game" });

  const info = session.game.startHand();
  session.lastActions = [];
  session.handResult = null;
  session.awaitingNewHand = false;

  if (!info) return res.json({ ...buildState(), gameOver: true });

  res.json(buildState());
});

app.post("/api/game/action", (req, res) => {
  if (!session) return res.status(400).json({ error: "No active game" });
  if (session.awaitingNewHand)
    return res.status(400).json({ error: "Start a new hand first" });

  const { action, raiseBy } = req.body;
  if (!["fold", "check", "call", "raise"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  applyHumanAction(action, raiseBy ? parseInt(raiseBy) : 0);
  res.json(buildState());
});

app.get("/api/game/state", (_req, res) => {
  if (!session) return res.status(404).json({ error: "No active game" });
  res.json(buildState());
});

app.post("/api/game/bot-step", (_req, res) => {
  if (!session) return res.status(400).json({ error: "No active game" });
  advanceOneStep();
  res.json(buildState());
});

// ── Preflop Practice ──────────────────────────────────────────────────────────

// All available practice scenarios, grouped by category.
// Each entry: { key, position, category, scenarioLabel, contextDesc }
//   category: 'rfi' | 'iso' | 'vs-open' | 'vs-3bet' | 'vs-4bet'
//   scenarioLabel: short name shown in the position banner
//   contextDesc: one-line situation description
const PRACTICE_SCENARIOS = [
  // RFI — weight 4 (most common situation)
  { key: 'UTG-RFI',           position: 'UTG', category: 'rfi',     weight: 4, scenarioLabel: 'Raise First In',    contextDesc: 'First to act — no action before you' },
  { key: 'MP-RFI',            position: 'MP',  category: 'rfi',     weight: 4, scenarioLabel: 'Raise First In',    contextDesc: 'First to act — UTG folded' },
  { key: 'CO-RFI',            position: 'CO',  category: 'rfi',     weight: 4, scenarioLabel: 'Raise First In',    contextDesc: 'First to act — UTG & MP folded' },
  { key: 'BTN-RFI',           position: 'BTN', category: 'rfi',     weight: 4, scenarioLabel: 'Raise First In',    contextDesc: 'First to act — all earlier positions folded' },
  { key: 'SB-RFI',            position: 'SB',  category: 'rfi',     weight: 4, scenarioLabel: 'Raise First In',    contextDesc: 'Everyone folded to you, BB left to act' },
  // ISO — weight 3
  { key: 'MP-ISO',            position: 'MP',  category: 'iso',     weight: 3, scenarioLabel: 'Isolation vs Limper', contextDesc: 'UTG limped in, action on you' },
  { key: 'CO-ISO',            position: 'CO',  category: 'iso',     weight: 3, scenarioLabel: 'Isolation vs Limper', contextDesc: 'One player limped, action on you' },
  { key: 'BTN-ISO',           position: 'BTN', category: 'iso',     weight: 3, scenarioLabel: 'Isolation vs Limper', contextDesc: 'One player limped, action on you' },
  { key: 'SB-ISO',            position: 'SB',  category: 'iso',     weight: 3, scenarioLabel: 'Isolation vs Limper', contextDesc: 'One player limped, action on you' },
  { key: 'BB-ISO',            position: 'BB',  category: 'iso',     weight: 3, scenarioLabel: 'Isolation vs Limper', contextDesc: 'One player limped, action on you' },
  // vs Open — weight 3
  { key: 'BTN-vs-open-UTG',  position: 'BTN', category: 'vs-open', weight: 3, scenarioLabel: 'vs UTG Open',       contextDesc: 'UTG raised, action on you at BTN' },
  { key: 'BTN-vs-open-MP',   position: 'BTN', category: 'vs-open', weight: 3, scenarioLabel: 'vs MP Open',        contextDesc: 'MP raised, action on you at BTN' },
  { key: 'BTN-vs-open-CO',   position: 'BTN', category: 'vs-open', weight: 3, scenarioLabel: 'vs CO Open',        contextDesc: 'CO raised, action on you at BTN' },
  { key: 'SB-vs-open-UTG',   position: 'SB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs UTG Open',       contextDesc: 'UTG raised, action on you at SB' },
  { key: 'SB-vs-open-MP',    position: 'SB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs MP Open',        contextDesc: 'MP raised, action on you at SB' },
  { key: 'SB-vs-open-CO',    position: 'SB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs CO Open',        contextDesc: 'CO raised, action on you at SB' },
  { key: 'SB-vs-open-BTN',   position: 'SB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs BTN Open',       contextDesc: 'BTN raised, action on you at SB' },
  { key: 'BB-vs-open-UTG',   position: 'BB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs UTG Open',       contextDesc: 'UTG raised, action on you at BB' },
  { key: 'BB-vs-open-MP',    position: 'BB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs MP Open',        contextDesc: 'MP raised, action on you at BB' },
  { key: 'BB-vs-open-CO',    position: 'BB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs CO Open',        contextDesc: 'CO raised, action on you at BB' },
  { key: 'BB-vs-open-SB',    position: 'BB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs SB Open',        contextDesc: 'SB raised, action on you at BB' },
  { key: 'BB-vs-open-BTN',   position: 'BB',  category: 'vs-open', weight: 3, scenarioLabel: 'vs BTN Open',       contextDesc: 'BTN raised, action on you at BB' },
  // vs 3-bet — weight 1 (uncommon)
  { key: 'UTG-vs-3bet-MP',   position: 'UTG', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from MP',  contextDesc: 'You opened UTG, MP 3-bet' },
  { key: 'UTG-vs-3bet-CO',   position: 'UTG', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from CO',  contextDesc: 'You opened UTG, CO 3-bet' },
  { key: 'UTG-vs-3bet-BTN',  position: 'UTG', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BTN', contextDesc: 'You opened UTG, BTN 3-bet' },
  { key: 'UTG-vs-3bet-SB',   position: 'UTG', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from SB',  contextDesc: 'You opened UTG, SB 3-bet' },
  { key: 'UTG-vs-3bet-BB',   position: 'UTG', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BB',  contextDesc: 'You opened UTG, BB 3-bet' },
  { key: 'MP-vs-3bet-CO',    position: 'MP',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from CO',  contextDesc: 'You opened MP, CO 3-bet' },
  { key: 'MP-vs-3bet-BTN',   position: 'MP',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BTN', contextDesc: 'You opened MP, BTN 3-bet' },
  { key: 'MP-vs-3bet-SB',    position: 'MP',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from SB',  contextDesc: 'You opened MP, SB 3-bet' },
  { key: 'MP-vs-3bet-BB',    position: 'MP',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BB',  contextDesc: 'You opened MP, BB 3-bet' },
  { key: 'CO-vs-3bet-BTN',   position: 'CO',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BTN', contextDesc: 'You opened CO, BTN 3-bet' },
  { key: 'CO-vs-3bet-SB',    position: 'CO',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from SB',  contextDesc: 'You opened CO, SB 3-bet' },
  { key: 'CO-vs-3bet-BB',    position: 'CO',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BB',  contextDesc: 'You opened CO, BB 3-bet' },
  { key: 'BTN-vs-3bet-SB',   position: 'BTN', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from SB',  contextDesc: 'You opened BTN, SB 3-bet' },
  { key: 'BTN-vs-3bet-BB',   position: 'BTN', category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BB',  contextDesc: 'You opened BTN, BB 3-bet' },
  { key: 'SB-vs-3bet-BB',    position: 'SB',  category: 'vs-3bet', weight: 1, scenarioLabel: 'vs 3-bet from BB',  contextDesc: 'You opened SB, BB 3-bet' },
  // vs 4-bet — weight 1 (uncommon)
  { key: 'BB-vs-4bet-UTG',   position: 'BB',  category: 'vs-4bet', weight: 1, scenarioLabel: 'vs 4-bet from UTG', contextDesc: 'You 3-bet from BB, UTG 4-bet' },
  { key: 'BB-vs-4bet-MP',    position: 'BB',  category: 'vs-4bet', weight: 1, scenarioLabel: 'vs 4-bet from MP',  contextDesc: 'You 3-bet from BB, MP 4-bet' },
  { key: 'BB-vs-4bet-CO',    position: 'BB',  category: 'vs-4bet', weight: 1, scenarioLabel: 'vs 4-bet from CO',  contextDesc: 'You 3-bet from BB, CO 4-bet' },
  { key: 'BB-vs-4bet-SB',    position: 'BB',  category: 'vs-4bet', weight: 1, scenarioLabel: 'vs 4-bet from SB',  contextDesc: 'You 3-bet from BB, SB 4-bet' },
  { key: 'BB-vs-4bet-BTN',   position: 'BB',  category: 'vs-4bet', weight: 1, scenarioLabel: 'vs 4-bet from BTN', contextDesc: 'You 3-bet from BB, BTN 4-bet' },
];

let practiceState = null;

function weightedPick(pool) {
  const total = pool.reduce((s, p) => s + (p.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const item of pool) {
    r -= (item.weight ?? 1);
    if (r <= 0) return item;
  }
  return pool[pool.length - 1];
}

app.post("/api/practice/deal", (req, res) => {
  const { category } = req.body || {};
  const pool = category && category !== 'all'
    ? PRACTICE_SCENARIOS.filter(s => s.category === category)
    : PRACTICE_SCENARIOS;
  const scenario = weightedPick(pool);

  const deck = new Deck();
  const holeCards = [deck.deal(), deck.deal()];
  const hand = handKey(holeCards);
  const chart = charts[scenario.key] || {};
  const raw = chart[hand];
  const correctActions = !raw ? ['fold'] : Array.isArray(raw) ? raw : [raw];

  practiceState = { hand, correctActions };

  res.json({
    holeCards: holeCards.map(serializeCard),
    position: scenario.position,
    category: scenario.category,
    scenarioLabel: scenario.scenarioLabel,
    contextDesc: scenario.contextDesc,
    hand,
    chart,
    gtoActions: correctActions,
  });
});

app.post("/api/practice/evaluate", (req, res) => {
  if (!practiceState) return res.status(400).json({ error: "No active practice hand" });
  const { action } = req.body;
  const { correctActions } = practiceState;
  const correct = correctActions.includes(action);
  res.json({ correct, gtoActions: correctActions });
});

// ── Competitive Mode ──────────────────────────────────────────────────────────

const LEADERBOARD_PATH = path.join(__dirname, 'leaderboard.json');

function loadLeaderboard() {
  try { return JSON.parse(fs.readFileSync(LEADERBOARD_PATH, 'utf8')); }
  catch { return {}; }
}

function saveLeaderboardFile(data) {
  fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(data, null, 2));
}

app.get('/api/competitive/leaderboard', (_req, res) => {
  res.json(loadLeaderboard());
});

// Returns the highest level number this player may play (1-based, max 40).
// Level 1 is always available. Level N+1 unlocks when the player has a 100%
// entry in level N (checked sequentially — must not skip levels).
app.get('/api/competitive/unlocks/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  const lb = loadLeaderboard();
  let maxUnlocked = 1;
  for (let lvl = 1; lvl <= 39; lvl++) {
    const entries = lb[String(lvl)] || [];
    const perfect = entries.some(e => e.name.toLowerCase() === name && e.pct === 100);
    if (perfect) maxUnlocked = lvl + 1;
    else break;
  }
  res.json({ maxUnlocked });
});

app.post('/api/competitive/score', (req, res) => {
  const { name, level, correct, total } = req.body;
  if (!name || !level || correct == null || !total) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const lb = loadLeaderboard();
  const key = String(level);
  if (!lb[key]) lb[key] = [];
  lb[key].push({
    name: String(name).trim().slice(0, 24),
    correct: Number(correct),
    total:   Number(total),
    pct:     Math.round(Number(correct) / Number(total) * 100),
    date:    new Date().toISOString().slice(0, 10),
  });
  // Sort: best pct first, then most correct, then most recent date
  lb[key].sort((a, b) => b.pct - a.pct || b.correct - a.correct || b.date.localeCompare(a.date));
  lb[key] = lb[key].slice(0, 20); // top 20 per level
  saveLeaderboardFile(lb);
  res.json({ ok: true });
});

// ── Ranges ────────────────────────────────────────────────────────────────────

const RANGES_PATH = path.join(__dirname, 'ranges.json');

function loadRanges() {
  try { return JSON.parse(fs.readFileSync(RANGES_PATH, 'utf8')); }
  catch { return {}; }
}
function saveRangesFile(data) {
  fs.writeFileSync(RANGES_PATH, JSON.stringify(data, null, 2));
}

// GET /api/ranges/:name  — load all saved ranges for a player
app.get('/api/ranges/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  res.json(loadRanges()[name] || {});
});

// POST /api/ranges/:name  — merge/update scenarios for a player
app.post('/api/ranges/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name).trim().toLowerCase();
  const updates = req.body; // { scenarioKey: chartObj, ... }
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'Invalid body' });
  const all = loadRanges();
  if (!all[name]) all[name] = {};
  Object.assign(all[name], updates);
  saveRangesFile(all);
  res.json({ ok: true });
});

// ── Hand Lookup ───────────────────────────────────────────────────────────────

app.get('/api/lookup/scenarios', (_req, res) => {
  res.json(PRACTICE_SCENARIOS.map(({ key, position, category, scenarioLabel, contextDesc }) => ({
    key, position, category, scenarioLabel, contextDesc,
  })));
});

app.get('/api/lookup/chart/:key', (req, res) => {
  const chart = charts[req.params.key];
  if (!chart) return res.status(404).json({ error: 'Chart not found' });
  res.json({ chart });
});

// Serve built React app in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../client/dist")));
  app.get(/(.*)/, (_req, res) => {
    res.sendFile(path.join(__dirname, "../client/dist/index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
