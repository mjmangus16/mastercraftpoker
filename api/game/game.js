const { Deck } = require('./deck');
const { bestHand, compareScores, handName } = require('./evaluator');

class TexasHoldem {
  constructor(players) {
    this.players = players;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.dealerIndex = players.length - 1; // will be incremented on startHand
    this.handNumber = 0;
    this._resetHand();
  }

  _resetHand() {
    this.deck = null;
    this.community = [];
    this.pot = 0;
    this.phase = null;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.currentPlayerIndex = -1;
    this.sbIndex = -1;
    this.bbIndex = -1;
    this.acted = new Set(); // indices of players who have acted since last bet/raise
  }

  // Returns indices of players who can still participate (have chips)
  _activeSeatIndices() {
    return this.players.reduce((acc, p, i) => {
      if (p.chips > 0) acc.push(i);
      return acc;
    }, []);
  }

  _nextSeatAfter(from) {
    let i = (from + 1) % this.players.length;
    while (i !== from && this.players[i].chips === 0) {
      i = (i + 1) % this.players.length;
    }
    return i;
  }

  // Next player who hasn't folded and isn't all-in, starting after `from`
  _nextToAct(from) {
    let i = (from + 1) % this.players.length;
    let checked = 0;
    while (checked < this.players.length) {
      const p = this.players[i];
      if (!p.folded && !p.allIn) return i;
      i = (i + 1) % this.players.length;
      checked++;
    }
    return -1; // no one left to act
  }

  startHand() {
    this.handNumber++;
    this._resetHand();
    this.deck = new Deck();

    for (const p of this.players) {
      p.reset();
      if (p.chips === 0) p.folded = true; // eliminated players sit out
    }

    // Advance dealer to next active seat
    this.dealerIndex = this._nextSeatAfter(this.dealerIndex);

    const seats = this._activeSeatIndices();
    if (seats.length < 2) return null; // game over

    // In heads-up dealer is SB; otherwise dealer+1 is SB
    if (seats.length === 2) {
      this.sbIndex = this.dealerIndex;
      this.bbIndex = this._nextSeatAfter(this.dealerIndex);
    } else {
      this.sbIndex = this._nextSeatAfter(this.dealerIndex);
      this.bbIndex = this._nextSeatAfter(this.sbIndex);
    }

    this._postBlind(this.sbIndex, this.smallBlind);
    this._postBlind(this.bbIndex, this.bigBlind);
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    // Deal 2 hole cards to each active player
    for (let i = 0; i < 2; i++) {
      for (const idx of seats) {
        this.players[idx].holeCards.push(this.deck.deal());
      }
    }

    // Pre-flop: first to act is after BB (or BB in heads-up, but _nextToAct handles it)
    this.currentPlayerIndex = this._nextToAct(this.bbIndex);
    this.phase = 'preflop';

    return { sbIndex: this.sbIndex, bbIndex: this.bbIndex };
  }

  _postBlind(index, amount) {
    const player = this.players[index];
    const paid = Math.min(amount, player.chips);
    player.chips -= paid;
    player.currentBet += paid;
    player.totalBet += paid;
    this.pot += paid;
    if (player.chips === 0) player.allIn = true;
  }

  getValidActions() {
    const player = this.players[this.currentPlayerIndex];
    const toCall = Math.min(this.currentBet - player.currentBet, player.chips);
    const actions = [];

    actions.push('fold');

    if (toCall === 0) {
      actions.push('check');
    } else {
      actions.push('call');
    }

    if (player.chips > toCall) {
      actions.push('raise');
    }

    return { actions, toCall, minRaise: this.minRaise, chips: player.chips };
  }

  // action: 'fold' | 'check' | 'call' | 'raise'
  // raiseBy: raise amount on top of call (only for 'raise')
  // Returns: { handOver, winner } | { phaseChange } | { continue }
  act(action, raiseBy = 0) {
    const player = this.players[this.currentPlayerIndex];
    const idx = this.currentPlayerIndex;

    switch (action) {
      case 'fold':
        player.folded = true;
        break;

      case 'check':
        // no chips move
        break;

      case 'call': {
        const toCall = Math.min(this.currentBet - player.currentBet, player.chips);
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalBet += toCall;
        this.pot += toCall;
        if (player.chips === 0) player.allIn = true;
        break;
      }

      case 'raise': {
        const toCall = this.currentBet - player.currentBet;
        const total = Math.min(toCall + raiseBy, player.chips);
        player.chips -= total;
        player.currentBet += total;
        player.totalBet += total;
        this.pot += total;
        if (player.chips === 0) player.allIn = true;
        this.minRaise = raiseBy;
        this.currentBet = player.currentBet;
        // Reset acted — everyone must act again after a raise
        this.acted = new Set([idx]);
        break;
      }
    }

    this.acted.add(idx);

    // Check if only one non-folded player remains
    const nonFolded = this.players.filter(p => !p.folded);
    if (nonFolded.length === 1) {
      nonFolded[0].chips += this.pot;
      return { handOver: true, noShowdown: true, winners: [{ player: nonFolded[0] }] };
    }

    // Check if betting round is over
    if (this._isBettingRoundOver()) {
      this._returnUncalledBet();
      return { phaseChange: true };
    }

    this.currentPlayerIndex = this._nextToAct(this.currentPlayerIndex);
    return { continue: true };
  }

  // If the last aggressor bet more than anyone else could match (because all
  // others are all-in for less), return the uncalled portion to them.
  _returnUncalledBet() {
    const nonFolded = this.players.filter(p => !p.folded);
    if (nonFolded.length < 2) return;

    const sortedBets = nonFolded.map(p => p.currentBet).sort((a, b) => b - a);
    const excess = sortedBets[0] - sortedBets[1];
    if (excess <= 0) return;

    const overBetter = nonFolded.find(p => p.currentBet === sortedBets[0]);
    overBetter.chips += excess;
    overBetter.currentBet -= excess;
    overBetter.totalBet -= excess;
    this.pot -= excess;
    this.currentBet = sortedBets[1];
  }

  _isBettingRoundOver() {
    // Anyone who still needs to put chips in?
    const mustCall = this.players.filter(p => !p.folded && !p.allIn && p.currentBet < this.currentBet);
    if (mustCall.length > 0) return false;

    // Everyone who is eligible has acted?
    const eligible = this.players.filter(p => !p.folded && !p.allIn);
    return eligible.every(p => this.acted.has(this.players.indexOf(p)));
  }

  // Advance to next phase (call after phaseChange result)
  advancePhase() {
    // Reset per-round bet tracking
    for (const p of this.players) p.currentBet = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.acted = new Set();

    if (this.phase === 'preflop') {
      this.community.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
      this.phase = 'flop';
    } else if (this.phase === 'flop') {
      this.community.push(this.deck.deal());
      this.phase = 'turn';
    } else if (this.phase === 'turn') {
      this.community.push(this.deck.deal());
      this.phase = 'river';
    } else if (this.phase === 'river') {
      this.phase = 'showdown';
      return;
    }

    // Post-flop: first to act is first active player after dealer
    this.currentPlayerIndex = this._nextToAct(this.dealerIndex);

    // If only one player can bet (all others all-in or folded), skip betting
    const canBet = this.players.filter(p => !p.folded && !p.allIn);
    if (canBet.length <= 1) {
      // Run out remaining community cards without betting
      while (this.phase !== 'showdown') {
        if (this.phase === 'flop') {
          this.community.push(this.deck.deal());
          this.phase = 'turn';
        } else if (this.phase === 'turn') {
          this.community.push(this.deck.deal());
          this.phase = 'river';
        } else if (this.phase === 'river') {
          this.phase = 'showdown';
        }
      }
    }
  }

  determineWinners() {
    const active = this.players.filter(p => !p.folded);
    if (active.length === 1) {
      active[0].chips += this.pot;
      return [{ player: active[0], handName: null, amount: this.pot }];
    }

    // ── Build side pots ───────────────────────────────────────────────────────
    // Each player's totalBet caps how much they can win from any single pot.
    // We peel off layers from smallest totalBet upward, assigning each layer
    // to only the players who contributed that much.

    const contributors = this.players.filter(p => p.totalBet > 0);
    const sorted = [...contributors].sort((a, b) => a.totalBet - b.totalBet);

    const sidePots = []; // [{ amount, eligible }]
    let prevLevel = 0;
    let remaining = [...sorted];

    while (remaining.length > 0) {
      const level = remaining[0].totalBet;
      const tierAmount = (level - prevLevel) * remaining.length;
      if (tierAmount > 0) {
        const eligible = remaining.filter(p => !p.folded);
        sidePots.push({ amount: tierAmount, eligible });
      }
      prevLevel = level;
      remaining = remaining.filter(p => p.totalBet > level);
    }

    // ── Evaluate each active player's best hand ───────────────────────────────
    const handEval = new Map();
    for (const p of active) {
      handEval.set(p, bestHand([...p.holeCards, ...this.community]));
    }

    // ── Distribute each side pot to its winner(s) ────────────────────────────
    const winnings = new Map(); // player → total chips won

    for (const { amount, eligible } of sidePots) {
      if (eligible.length === 0) continue;

      const evalEligible = eligible
        .map(p => ({ player: p, best: handEval.get(p) }))
        .filter(e => e.best);

      evalEligible.sort((a, b) => compareScores(b.best.score, a.best.score));

      const topScore = evalEligible[0].best.score;
      const potWinners = evalEligible.filter(e => compareScores(e.best.score, topScore) === 0);

      const share = Math.floor(amount / potWinners.length);
      const remainder = amount - share * potWinners.length;

      potWinners.forEach((w, i) => {
        const won = share + (i === 0 ? remainder : 0);
        w.player.chips += won;
        winnings.set(w.player, (winnings.get(w.player) ?? 0) + won);
      });
    }

    // ── Return summary ────────────────────────────────────────────────────────
    return [...winnings.entries()].map(([player, amount]) => {
      const best = handEval.get(player);
      return {
        player,
        handName: best ? handName(best.score) : null,
        cards: best?.cards ?? [],
        amount,
      };
    });
  }

  // Returns player indices with chips remaining
  activePlayers() {
    return this.players.filter(p => p.chips > 0);
  }
}

module.exports = { TexasHoldem };
