class Player {
  constructor(name, chips, isHuman = false) {
    this.name = name;
    this.chips = chips;
    this.isHuman = isHuman;
    this.holeCards = [];
    this.currentBet = 0; // amount bet this round
    this.totalBet = 0;   // total bet this hand (for side pots)
    this.folded = false;
    this.allIn = false;
    // Opponent modeling stats — persist across hands, never reset
    this.stats = { handsDealt: 0, vpipCount: 0, pfrCount: 0, aggrCount: 0, passiveCount: 0 };
  }

  reset() {
    this.holeCards = [];
    this.currentBet = 0;
    this.totalBet = 0;
    this.folded = false;
    this.allIn = false;
  }
}

module.exports = { Player };
