const readline = require("readline");
const { Player } = require("./game/player");
const { TexasHoldem } = require("./game/game");
const { bestHand, handName } = require("./game/evaluator");
const { botDecide, STYLES } = require("./game/bot");

// ─── Display helpers ──────────────────────────────────────────────────────────

const SUIT_COLORS = {
  "♠": "\x1b[37m",
  "♣": "\x1b[32m",
  "♥": "\x1b[31m",
  "♦": "\x1b[31m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function colorCard(card) {
  const col = SUIT_COLORS[card.suit] || RESET;
  return `${col}${card}${RESET}`;
}

function colorCards(cards) {
  return cards.map(colorCard).join(" ");
}

function sep(char = "─", len = 50) {
  return DIM + char.repeat(len) + RESET;
}

function printBanner() {
  console.log(`\n${BOLD}${YELLOW}  ♠ ♥  MASTERCRAFT POKER  ♦ ♣${RESET}`);
  console.log(sep("═"));
}

function printState(game, humanIdx) {
  const human = game.players[humanIdx];
  console.log(`\n${sep()}`);
  console.log(
    `${BOLD}Hand #${game.handNumber}  |  Phase: ${game.phase.toUpperCase()}${RESET}`,
  );
  console.log(
    `${YELLOW}Pot: $${game.pot}${RESET}  |  Current bet: $${game.currentBet}`,
  );

  // Community cards
  if (game.community.length > 0) {
    console.log(`\nBoard: ${colorCards(game.community)}`);
  }

  // Opponents (hide cards)
  console.log("\nPlayers:");
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    if (i === humanIdx) continue;
    const status = p.folded
      ? DIM + "FOLDED" + RESET
      : p.allIn
        ? CYAN + "ALL-IN" + RESET
        : `$${p.chips}`;
    const dealer = i === game.dealerIndex ? " [D]" : "";
    const blind =
      i === game.sbIndex ? " [SB]" : i === game.bbIndex ? " [BB]" : "";
    const styleTag = p.style ? DIM + ` (${STYLES[p.style].label})` + RESET : "";
    console.log(
      `  ${p.name}${styleTag}${dealer}${blind}: ${status}  (bet: $${p.currentBet})`,
    );
  }

  // Human hand
  console.log(`\n${BOLD}Your hand: ${colorCards(human.holeCards)}${RESET}`);
  if (game.community.length > 0 && human.holeCards.length > 0) {
    const best = bestHand([...human.holeCards, ...game.community]);
    console.log(`  → ${CYAN}${handName(best.score)}${RESET}`);
  }
  const dealer = humanIdx === game.dealerIndex ? " [D]" : "";
  const blind =
    humanIdx === game.sbIndex
      ? " [SB]"
      : humanIdx === game.bbIndex
        ? " [BB]"
        : "";
  console.log(
    `  Chips: $${human.chips}${dealer}${blind}  (bet: $${human.currentBet})`,
  );
}

// ─── Bot AI ──────────────────────────────────────────────────────────────────
// Logic lives in game/bot.js; STYLES/botDecide/handStrength are imported above.

// ─── CLI helpers ─────────────────────────────────────────────────────────────

function ask(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function pause(rl) {
  return ask(rl, "\nPress Enter to continue...");
}

// ─── Main game loop ───────────────────────────────────────────────────────────

async function humanAction(rl, game) {
  const { actions, toCall, minRaise, chips } = game.getValidActions();

  const opts = actions.map((a) => {
    if (a === "call") return `call $${toCall}`;
    if (a === "raise") return `raise`;
    return a;
  });

  console.log(`\nActions: ${BOLD}${opts.join(" / ")}${RESET}`);

  while (true) {
    const input = (await ask(rl, "> ")).trim().toLowerCase();
    const parts = input.split(/\s+/);
    const cmd = parts[0];

    if (cmd === "fold" && actions.includes("fold")) {
      return { action: "fold" };
    }
    if (cmd === "check" && actions.includes("check")) {
      return { action: "check" };
    }
    if ((cmd === "call" || cmd === "c") && actions.includes("call")) {
      return { action: "call" };
    }
    if ((cmd === "raise" || cmd === "r") && actions.includes("raise")) {
      let amount = parseInt(parts[1]);
      if (isNaN(amount) || amount < minRaise) {
        const maxRaise = chips - toCall;
        amount = parseInt(
          await ask(
            rl,
            `  Raise by how much? (min $${minRaise}, max $${maxRaise}): `,
          ),
        );
        if (isNaN(amount) || amount < minRaise) {
          console.log(`  Must raise at least $${minRaise}.`);
          continue;
        }
      }
      return { action: "raise", raiseBy: Math.min(amount, chips - toCall) };
    }
    console.log(`  Invalid input. Options: ${opts.join(" / ")}`);
  }
}

async function playHand(rl, game, humanIdx) {
  const info = game.startHand();
  if (!info) {
    console.log("\nNot enough players with chips to continue.");
    return false;
  }

  console.log(`\n${sep("═")}`);
  console.log(`${BOLD}  Hand #${game.handNumber}${RESET}`);

  let result = null;

  // Betting rounds loop
  while (game.phase !== "showdown") {
    // If only all-ins + folds remain, skip straight to showdown
    const canBet = game.players.filter((p) => !p.folded && !p.allIn);
    if (canBet.length <= 1 && game.phase !== "preflop") {
      // advancePhase already ran out the board
      break;
    }

    // If current player is human
    const current = game.players[game.currentPlayerIndex];

    if (!current.folded && !current.allIn) {
      printState(game, humanIdx);

      let playerResult;
      if (game.currentPlayerIndex === humanIdx) {
        const { action, raiseBy } = await humanAction(rl, game);
        playerResult = game.act(action, raiseBy);
      } else {
        // Bot
        const { action, raiseBy } = botDecide(current, game);
        const actionStr = action === "raise" ? `raise $${raiseBy}` : action;
        console.log(`\n  ${current.name} → ${CYAN}${actionStr}${RESET}`);
        playerResult = game.act(action, raiseBy);
      }

      if (playerResult.handOver) {
        result = playerResult;
        break;
      }

      if (playerResult.phaseChange) {
        game.advancePhase();
        if (game.phase === "showdown") break;
        console.log(`\n${BOLD}--- ${game.phase.toUpperCase()} ---${RESET}`);
      }
    } else {
      // Skip players who can't act
      const playerResult = game.act("check"); // shouldn't happen but safeguard
      if (playerResult.phaseChange) {
        game.advancePhase();
        if (game.phase === "showdown") break;
      }
    }
  }

  // Showdown / resolve
  console.log(`\n${sep()}`);
  if (result && result.noShowdown) {
    const winner = result.winners[0].player;
    console.log(
      `\n  ${BOLD}${YELLOW}${winner.name} wins $${game.pot - (result ? 0 : 0)} (everyone folded)${RESET}`,
    );
  } else {
    const winners = game.determineWinners();
    console.log(`\n${BOLD}SHOWDOWN${RESET}`);
    // Show all non-folded hands
    for (const p of game.players.filter((pp) => !pp.folded)) {
      const best =
        p.holeCards.length > 0
          ? bestHand([...p.holeCards, ...game.community])
          : null;
      const hn = best ? handName(best.score) : "";
      console.log(
        `  ${p.name}: ${colorCards(p.holeCards)}  →  ${CYAN}${hn}${RESET}`,
      );
    }
    console.log(`\nBoard: ${colorCards(game.community)}\n`);
    for (const w of winners) {
      console.log(
        `  ${BOLD}${YELLOW}${w.player.name} wins $${w.amount} with ${w.handName}${RESET}`,
      );
    }
  }

  // Show chip counts
  console.log(`\nChip counts:`);
  for (const p of game.players) {
    const out = p.chips === 0 ? DIM + " (eliminated)" + RESET : "";
    console.log(`  ${p.name}: $${p.chips}${out}`);
  }

  await pause(rl);
  return true;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  printBanner();
  console.log("\nWelcome to Texas Hold'em Poker!\n");

  const numBots = parseInt(await ask(rl, "How many opponents? (1-5): "));
  const count = Math.max(1, Math.min(5, isNaN(numBots) ? 1 : numBots));

  const startChips = 2000;
  const players = [new Player("You", startChips, true)];
  const botNames = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
  const styleKeys = Object.keys(STYLES);
  for (let i = 0; i < count; i++) {
    const bot = new Player(botNames[i], startChips);
    bot.style = styleKeys[i % styleKeys.length];
    players.push(bot);
  }

  const game = new TexasHoldem(players);
  const humanIdx = 0;

  console.log(
    `\nStarting game with ${players.length} players. Each starts with $${startChips}.`,
  );
  console.log(`Blinds: $${game.smallBlind}/$${game.bigBlind}\n`);
  console.log("Your opponents:");
  for (const p of players.filter((p) => !p.isHuman)) {
    console.log(`  ${p.name} — ${STYLES[p.style].label}`);
  }
  console.log(`\nCommands: fold | check | call | raise [amount]\n`);

  await pause(rl);

  // Main game loop
  while (true) {
    const alive = game.activePlayers();
    if (alive.length < 2) break;

    const human = players[humanIdx];
    if (human.chips === 0) {
      console.log(`\n${BOLD}You've been eliminated. Game over!${RESET}`);
      break;
    }

    const ok = await playHand(rl, game, humanIdx);
    if (!ok) break;
  }

  const alive = game.activePlayers();
  if (alive.length === 1) {
    console.log(
      `\n${BOLD}${YELLOW}  🏆  ${alive[0].name} wins the game!  🏆${RESET}\n`,
    );
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
