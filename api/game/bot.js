// GTO preflop decision engine.
// Uses chart data from gto.js for all preflop decisions.
// Postflop uses simple hand-strength heuristics.

const { bestHand } = require('./evaluator');
const { charts } = require('../gto');

// ── Hand key ──────────────────────────────────────────────────────────────────
// Converts two hole cards to GTO notation: 'AKs', 'QJo', 'TT', etc.

function handKey(holeCards) {
  const [c1, c2] = holeCards;
  if (c1.value === c2.value) return `${c1.rank}${c2.rank}`;
  const [hi, lo] = c1.value > c2.value ? [c1, c2] : [c2, c1];
  return `${hi.rank}${lo.rank}${hi.suit === lo.suit ? 's' : 'o'}`;
}

// ── Position ──────────────────────────────────────────────────────────────────
// Full display labels for each seat count between BB and BTN (exclusive).
// Max 6 seats between = 9-max table: UTG UTG+1 UTG+2 LJ HJ CO
const BETWEEN_SEQUENCES = [
  [],                                           // 0 between
  ['UTG'],                                      // 1
  ['UTG', 'CO'],                                // 2
  ['UTG', 'HJ', 'CO'],                          // 3
  ['UTG', 'LJ', 'HJ', 'CO'],                   // 4
  ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],          // 5
  ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO'],// 6
];

function getPosition(playerIdx, game) {
  if (playerIdx === game.dealerIndex) return 'BTN';
  if (playerIdx === game.sbIndex)     return 'SB';
  if (playerIdx === game.bbIndex)     return 'BB';

  const n = game.players.length;
  const between = [];
  let i = (game.bbIndex + 1) % n;
  while (i !== game.dealerIndex) {
    if (game.players[i].holeCards.length > 0) between.push(i);
    i = (i + 1) % n;
  }

  const pos   = between.indexOf(playerIdx);
  const total = between.length;
  const seq   = BETWEEN_SEQUENCES[Math.min(total, 6)];
  return seq[Math.min(pos, seq.length - 1)] || 'UTG';
}

// Maps display positions to the chart keys used in gto.js.
// UTG+1, UTG+2 → UTG (early position chart)
// LJ, HJ       → MP  (middle position chart)
function toChartPos(pos) {
  if (pos === 'UTG+1' || pos === 'UTG+2') return 'UTG';
  if (pos === 'LJ'    || pos === 'HJ')    return 'MP';
  return pos; // BTN, SB, BB, UTG, CO pass through unchanged
}

// ── Chart lookup ──────────────────────────────────────────────────────────────
// Returns the resolved action for a hand from a named chart.
// Mixed strategies like ['raise','fold'] are resolved randomly (50/50).
// Any hand not listed in the chart defaults to 'fold'.

function lookupAction(chartKey, hand) {
  const chart = charts[chartKey];
  if (!chart) return 'fold';
  const action = chart[hand];
  if (!action) return 'fold';
  if (Array.isArray(action)) return action[Math.floor(Math.random() * action.length)];
  return action;
}

// Returns the raw chart entry (before random resolution) as an array of strings.
// Used to show GTO hints to the human player.
function lookupRaw(chartKey, hand) {
  const chart = charts[chartKey];
  if (!chart) return ['fold'];
  const action = chart[hand];
  if (!action) return ['fold'];
  if (Array.isArray(action)) return action;
  return [action];
}

// ── Preflop helpers ───────────────────────────────────────────────────────────

// Find the chart position of the player who made the current bet/raise.
function findRaiserPosition(game) {
  if (game.currentBet <= game.bigBlind) return null;
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    if (!p.folded && p.currentBet === game.currentBet) {
      return toChartPos(getPosition(i, game));
    }
  }
  return 'UTG'; // fallback
}

// Count players who called the big blind without raising (limpers).
function countLimpers(game) {
  return game.players.filter((p, i) =>
    !p.folded &&
    i !== game.bbIndex &&
    p.currentBet === game.bigBlind &&
    p.currentBet > 0
  ).length;
}

// Compute raise size based on scenario and position.
function raiseSize(scenario, position, game) {
  const bb  = game.bigBlind;
  const bet = game.currentBet;
  const ip  = position === 'BTN' || position === 'CO' || position === 'HJ';

  switch (scenario) {
    case 'rfi':
      return ip ? Math.round(2.5 * bb) : Math.round(3 * bb);
    case 'iso': {
      const limpers = countLimpers(game);
      return Math.round((4 + limpers) * bb);
    }
    case 'facing-raise':
      // 3-bet: 3× in position, 3.5× out of position
      return ip ? Math.round(3 * bet) : Math.round(3.5 * bet);
    case 'facing-3bet':
      // 4-bet: ~2.5× the 3-bet
      return Math.round(2.5 * bet);
    default:
      return Math.round(2.5 * bb);
  }
}

// ── Postflop ──────────────────────────────────────────────────────────────────
// Simple hand-strength heuristic since GTO charts only cover preflop.

function postflopDecide(player, game) {
  const { toCall, minRaise, chips } = game.getValidActions();
  const pot = game.pot;

  const best = bestHand([...player.holeCards, ...game.community]);
  const handRank = best ? best.score[0] : 0;
  // handRank: 0=high card, 1=pair, 2=two pair, 3=trips, 4=straight,
  //           5=flush, 6=full house, 7=quads, 8=straight flush

  const betAmt = Math.min(Math.floor(pot * 0.6), chips);

  if (toCall === 0) {
    // Check or bet
    if (handRank >= 3 && betAmt >= minRaise) {
      return { action: 'raise', raiseBy: betAmt };
    }
    return { action: 'check' };
  }

  // Facing a bet — decide whether to call or fold
  const potOdds = toCall / (pot + toCall);
  if (handRank >= 3)                          return { action: 'call' }; // trips+: always call
  if (handRank === 2 && potOdds < 0.40)      return { action: 'call' }; // two pair: call ≤40% pot odds
  if (handRank === 1 && potOdds < 0.25)      return { action: 'call' }; // pair: call ≤25%
  if (toCall <= pot * 0.06)                  return { action: 'call' }; // never fold to tiny bets

  return { action: 'fold' };
}

// ── Main decision ─────────────────────────────────────────────────────────────

function botDecide(player, game) {
  // Delegate postflop to heuristic engine
  if (game.phase !== 'preflop') return postflopDecide(player, game);

  const { toCall, minRaise, chips } = game.getValidActions();
  const bb          = game.bigBlind;
  const currentBet  = game.currentBet;
  const playerIdx   = game.players.indexOf(player);
  const position    = getPosition(playerIdx, game);
  const chartPos    = toChartPos(position);
  const hand        = handKey(player.holeCards);
  const limpers     = countLimpers(game);

  // ── Detect scenario ────────────────────────────────────────────────────────
  let scenario, chartKey;

  if (currentBet <= bb) {
    if (limpers > 0 && position !== 'BB') {
      // Players limped in ahead — ISO raise opportunity
      scenario = 'iso';
      chartKey = charts[`${chartPos}-ISO`] ? `${chartPos}-ISO` : `${chartPos}-RFI`;
    } else {
      // No action yet — Raise First In
      scenario = 'rfi';
      chartKey = `${chartPos}-RFI`;
    }
  } else if (currentBet <= 5 * bb) {
    // Facing a single raise
    scenario = 'facing-raise';
    const raiserPos = findRaiserPosition(game);
    const key = `${chartPos}-vs-open-${raiserPos}`;
    chartKey = charts[key] ? key : null;
  } else if (currentBet <= 20 * bb) {
    // Facing a 3-bet
    scenario = 'facing-3bet';
    const raiserPos = findRaiserPosition(game);
    const key = `${chartPos}-vs-3bet-${raiserPos}`;
    chartKey = charts[key] ? key : null;
  } else {
    // Facing a 4-bet+
    scenario = 'facing-4bet';
    const raiserPos = findRaiserPosition(game);
    const key = `BB-vs-4bet-${raiserPos}`;   // use BB chart as closest proxy
    chartKey = charts[key] ? key : null;
  }

  // ── Chart lookup ───────────────────────────────────────────────────────────
  const chartAction = chartKey ? lookupAction(chartKey, hand) : 'fold';

  // ── Convert chart action to game action ────────────────────────────────────
  const raise = Math.min(raiseSize(scenario, position, game), chips);

  switch (chartAction) {
    case 'raise':
      if (raise < minRaise) {
        // Not enough chips to raise — just call or check
        return toCall === 0 ? { action: 'check' } : { action: 'call' };
      }
      return { action: 'raise', raiseBy: raise };

    case 'allin':
      return { action: 'raise', raiseBy: chips };

    case 'call':
      if (toCall === 0) return { action: 'check' };
      if (toCall >= chips) return { action: 'raise', raiseBy: chips }; // all-in call
      return { action: 'call' };

    case 'fold':
    default:
      if (toCall === 0) return { action: 'check' }; // never fold for free
      return { action: 'fold' };
  }
}

// ── GTO hint for human player ─────────────────────────────────────────────────
// Returns an array of GTO-recommended actions for the human's current hand.
// Mixed strategies return both options, e.g. ['raise', 'fold'].
// Returns null when not applicable (postflop, no chart coverage).

function getGtoHint(player, game) {
  if (game.phase !== 'preflop') return null;

  const bb         = game.bigBlind;
  const currentBet = game.currentBet;
  const playerIdx  = game.players.indexOf(player);
  const position   = getPosition(playerIdx, game);
  const chartPos   = toChartPos(position);
  const hand       = handKey(player.holeCards);
  const limpers    = countLimpers(game);

  let chartKey;

  if (currentBet <= bb) {
    if (limpers > 0 && position !== 'BB') {
      chartKey = charts[`${chartPos}-ISO`] ? `${chartPos}-ISO` : `${chartPos}-RFI`;
    } else {
      chartKey = `${chartPos}-RFI`;
    }
  } else if (currentBet <= 5 * bb) {
    const raiserPos = findRaiserPosition(game);
    const key = `${chartPos}-vs-open-${raiserPos}`;
    chartKey = charts[key] ? key : null;
  } else if (currentBet <= 20 * bb) {
    const raiserPos = findRaiserPosition(game);
    const key = `${chartPos}-vs-3bet-${raiserPos}`;
    chartKey = charts[key] ? key : null;
  } else {
    const raiserPos = findRaiserPosition(game);
    const key = `BB-vs-4bet-${raiserPos}`;
    chartKey = charts[key] ? key : null;
  }

  if (!chartKey) return ['fold'];
  return lookupRaw(chartKey, hand);
}

module.exports = { botDecide, getGtoHint, getPosition, handKey };
