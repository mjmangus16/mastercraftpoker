import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { api } from "./api";
import Card from "./components/Card";
import PlayerSeat from "./components/PlayerSeat";
import ActionBar from "./components/ActionBar";
import HandResult from "./components/HandResult";
import PreflopPractice from "./components/PreflopPractice";
import CompetitiveMode from "./components/CompetitiveMode";
import HandLookup from "./components/HandLookup";
import RangeBuilder from "./components/RangeBuilder";
import "./App.css";

// ── Setup screen ───────────────────────────────────────────────────────────────

function SetupScreen({
  onStart,
  onPractice,
  onCompetitive,
  onLookup,
  playerName,
  onClearName,
  loading,
}) {
  const [opponents, setOpponents] = useState(2);

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-logo">
          <span className="suit red">♥</span>
          <span className="suit">♠</span>
          <span className="suit red">♦</span>
          <span className="suit">♣</span>
        </div>
        <h1 className="setup-title">Mastercraft Poker</h1>
        <p className="setup-sub">Texas Hold&apos;em</p>

        <div className="setup-field">
          <label className="setup-label">Number of opponents</label>
          <div className="opponent-picker">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                className={`opp-btn${opponents === n ? " opp-btn--active" : ""}`}
                onClick={() => setOpponents(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="setup-info">
          <span>
            Each player starts with <strong>$2,000</strong>
          </span>
          <span>
            Blinds: <strong>$10 / $20</strong>
          </span>
        </div>

        <button
          className="btn btn--start"
          onClick={() => onStart(opponents)}
          disabled={loading}
        >
          {loading ? "Dealing…" : "Deal In"}
        </button>
        <button
          className="btn btn--practice-mode"
          onClick={onPractice}
          disabled={loading}
        >
          Preflop Practice
        </button>
        <button
          className="btn btn--lookup-mode"
          onClick={onLookup}
          disabled={loading}
        >
          Hand Lookup
        </button>

        <button
          className="btn btn--competitive-mode"
          onClick={onCompetitive}
          disabled={loading}
        >
          Competitive Mode
        </button>
        {playerName && (
          <div className="setup-player">
            <span>👤 {playerName}</span>
            <button className="setup-player-clear" onClick={onClearName}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pot odds ──────────────────────────────────────────────────────────────────

function PotOddsInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pot-odds-info-wrap">
      <button
        className="pot-odds-info-btn"
        onClick={() => setOpen((o) => !o)}
        title="How pot odds work"
      >
        ?
      </button>
      {open && (
        <div className="pot-odds-info-popup">
          <button
            className="pot-odds-info-close"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
          <h4 className="poi-title">How Pot Odds Work</h4>

          <p className="poi-text">
            <strong>Pot odds</strong> tell you how much of the final pot you
            need to win to break even on a call.
          </p>

          <div className="poi-section-label">The formula</div>
          <div className="poi-formula">Equity needed = Call ÷ (Pot + Call)</div>

          <div className="poi-section-label">Example</div>
          <p className="poi-text">
            Pot is <strong>$100</strong>, opponent bets <strong>$50</strong>.
            <br />
            You must call $50 into a $150 total pot.
            <br />
            Equity needed = 50 ÷ 150 = <strong>33.3%</strong>
          </p>
          <p className="poi-text">
            If your hand wins more than 33% of the time, calling is profitable
            long-term.
          </p>

          <div className="poi-section-label">Counting outs</div>
          <p className="poi-text">
            An <strong>out</strong> is a card that completes your hand. Use the
            rule of 2 and 4:
          </p>
          <ul className="poi-list">
            <li>
              On the <strong>flop</strong>: outs × 4 ≈ your equity %
            </li>
            <li>
              On the <strong>turn</strong>: outs × 2 ≈ your equity %
            </li>
          </ul>
          <p className="poi-text">
            Example: open-ended straight draw = 8 outs.
            <br />
            On the flop: 8 × 4 = <strong>~32% equity</strong>.
          </p>

          <div className="poi-section-label">Decision rule</div>
          <ul className="poi-list">
            <li>
              Your equity <strong>&gt;</strong> equity needed →{" "}
              <span className="poi-call">call is profitable</span>
            </li>
            <li>
              Your equity <strong>&lt;</strong> equity needed →{" "}
              <span className="poi-fold">call loses money</span>
            </li>
          </ul>

          <div className="poi-section-label">No active bet</div>
          <p className="poi-text">
            When no one has bet, the panel shows the current pot size. A{" "}
            <strong>pot-sized bet</strong> always forces the caller to need 50%
            equity — a common sizing used to deny draws.
          </p>
        </div>
      )}
    </div>
  );
}

function EquityInfo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="pot-odds-info-wrap">
      <button
        className="pot-odds-info-btn"
        onClick={() => setOpen((o) => !o)}
        title="How equity is calculated"
      >
        ?
      </button>
      {open && (
        <div className="pot-odds-info-popup pot-odds-info-popup--right">
          <button
            className="pot-odds-info-close"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
          <h4 className="poi-title">Your Equity</h4>

          <p className="poi-text">
            <strong>Equity</strong> is your probability of winning the hand
            right now, expressed as a percentage.
          </p>

          <div className="poi-section-label">How it's calculated</div>
          <ul className="poi-list">
            <li>
              <strong>Preflop</strong> — Monte Carlo simulation: 900 random
              runouts are dealt and your win rate is measured across all of them
              (~±2% accuracy)
            </li>
            <li>
              <strong>Flop</strong> — Exact: every possible two-card turn+river
              combination is enumerated
            </li>
            <li>
              <strong>Turn</strong> — Exact: every possible river card is
              checked
            </li>
            <li>
              <strong>River</strong> — Exact: the board is complete, result is
              certain
            </li>
          </ul>

          <div className="poi-section-label">What counts as a win</div>
          <p className="poi-text">
            Your hand beats all active opponents' best 5-card hand. Ties count
            as half a win (split pot).
          </p>

          <div className="poi-section-label">Outs</div>
          <p className="poi-text">
            An <strong>out</strong> is a specific remaining deck card that would
            improve your hand rank on the next street. Shown on flop and turn
            only.
          </p>
          <p className="poi-text">
            Use the <strong>rule of 2 and 4</strong> to estimate equity from
            outs quickly:
          </p>
          <ul className="poi-list">
            <li>
              On the <strong>flop</strong>: outs × 4 ≈ equity %
            </li>
            <li>
              On the <strong>turn</strong>: outs × 2 ≈ equity %
            </li>
          </ul>

          <div className="poi-section-label">Using equity vs pot odds</div>
          <ul className="poi-list">
            <li>
              <span className="poi-call">Equity &gt; needed %</span> → calling
              is profitable (+EV)
            </li>
            <li>
              <span className="poi-fold">Equity &lt; needed %</span> → calling
              loses money long-term (–EV)
            </li>
          </ul>
          <p className="poi-text">
            Even a –EV call can sometimes be correct when{" "}
            <strong>implied odds</strong> are factored in — the extra chips you
            expect to win on future streets if you hit your draw.
          </p>
        </div>
      )}
    </div>
  );
}

function PotOdds({ pot, toCall, equity, outs }) {
  if (!pot && !toCall) return null;

  const hasBet = toCall > 0;
  const total = pot + toCall;
  const oddsEquity = hasBet ? ((toCall / total) * 100).toFixed(1) : null;
  const ratio = hasBet ? (pot / toCall).toFixed(1).replace(/\.0$/, "") : null;
  const potBetEquity = !hasBet && pot > 0 ? "50" : null;

  // Equity comparison when we have both numbers
  const hasEquityVsOdds = hasBet && equity !== null;
  const profitable = hasEquityVsOdds && equity >= parseFloat(oddsEquity);

  return (
    <div className="pot-odds">
      {/* Row 1: pot odds + equity side by side */}
      <div className="pot-odds-row">
        <div className="pot-odds-col">
          <div className="pot-odds-main">
            <span className="pot-odds-label">Pot Odds</span>
            <PotOddsInfo />
            {hasBet ? (
              <>
                <span className="pot-odds-ratio">{ratio}:1</span>
                <span className="pot-odds-equity">need {oddsEquity}%</span>
              </>
            ) : (
              <>
                <span className="pot-odds-pot-size">
                  ${pot.toLocaleString()}
                </span>
                <span className="pot-odds-no-bet">no active bet</span>
              </>
            )}
          </div>
          {hasBet && (
            <div className="pot-odds-hint">
              Call ${toCall} into ${pot} pot · break even at ≥{oddsEquity}%
            </div>
          )}
          {!hasBet && pot > 0 && (
            <div className="pot-odds-hint">
              Pot-sized bet forces caller to need {potBetEquity}% equity
            </div>
          )}
        </div>

        {equity !== null && (
          <div className="pot-odds-col pot-odds-col--equity">
            <div className="pot-odds-main">
              <span className="pot-odds-label">Your Equity</span>
              <EquityInfo />
              <span
                className={`pot-odds-ratio ${profitable ? "pot-odds-ratio--good" : hasBet ? "pot-odds-ratio--bad" : ""}`}
              >
                {equity}%
              </span>
              {hasEquityVsOdds && (
                <span
                  className={`pot-odds-verdict ${profitable ? "pot-odds-verdict--call" : "pot-odds-verdict--fold"}`}
                >
                  {profitable ? "▲ +EV call" : "▼ –EV call"}
                </span>
              )}
            </div>
            {hasEquityVsOdds && (
              <div className="pot-odds-hint">
                {profitable
                  ? `+${(equity - parseFloat(oddsEquity)).toFixed(1)}% edge over odds`
                  : `${(parseFloat(oddsEquity) - equity).toFixed(1)}% short of needed`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Combined bar: equity vs needed */}
      {hasBet && equity !== null && (
        <div className="pot-odds-bar pot-odds-bar--dual">
          <div
            className="pot-odds-bar-needed"
            style={{ width: `${oddsEquity}%` }}
          />
          <div
            className="pot-odds-bar-equity"
            style={{ width: `${equity}%` }}
          />
        </div>
      )}
      {hasBet && equity === null && (
        <div className="pot-odds-bar">
          <div
            className="pot-odds-bar-call"
            style={{ width: `${oddsEquity}%` }}
          />
        </div>
      )}

      {/* Outs count */}
      {outs !== null && (
        <div className="pot-odds-outs">
          <span className="pot-odds-outs-label">
            ~{outs} effective out{outs !== 1 ? "s" : ""}
          </span>
          <span className="pot-odds-outs-hint">(rule of 2&amp;4)</span>
        </div>
      )}
    </div>
  );
}

// ── Oval table helpers ─────────────────────────────────────────────────────────

// With border-radius:50% (true ellipse), SEAT_RX/RY = 50 puts seats exactly on the rail.
// Slightly inside (48) keeps them from being too far outside on narrow screens.
const SEAT_RX = 48;
const SEAT_RY = 48;

const HUMAN_ANGLE = 90; // human at bottom (y-down = positive in CSS)

function getOpponentAngles(n) {
  if (n === 0) return [];
  if (n === 1) return [270];
  // Scale arc with count: small games stay near top, full tables fill the sides
  // Always leave a 45° gap either side of the human (90°)
  const maxArc = n === 2 ? 140 : n === 3 ? 200 : 270;
  const arcStart = 90 + (360 - maxArc) / 2; // symmetrical around human
  const step = maxArc / (n - 1);
  return Array.from(
    { length: n },
    (_, i) => (((arcStart + step * i) % 360) + 360) % 360,
  );
}

function angleToPos(angle, rx, ry) {
  const rad = (angle * Math.PI) / 180;
  return { left: 50 + rx * Math.cos(rad), top: 50 + ry * Math.sin(rad) };
}

// ── Chip stack ─────────────────────────────────────────────────────────────────

const CHIP_RX = 30;
// CHIP_RY is responsive: landscape tables (2:1) are short relative to their width
// so 30% of height lands much closer to the large desktop seats than on portrait.
// 22 keeps chips clearly in the gap on landscape; 30 is used on portrait (5:6).

function ChipStack({ amount, angle, ry, collecting }) {
  const pos = angleToPos(angle, CHIP_RX, ry);
  return (
    <div
      className={`chip-stack${collecting ? " chip-stack--collect" : " chip-stack--show"}`}
      style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
    >
      <div className="chip-token" />
      <span className="chip-amount">${amount}</span>
    </div>
  );
}

// ── Game table ─────────────────────────────────────────────────────────────────

function GameTable({
  state,
  onAction,
  onNextHand,
  loading,
  revealBots,
  onToggleReveal,
  onQuit,
}) {
  const {
    players,
    community,
    pot,
    sidePots,
    currentBet,
    phase,
    handNumber,
    humanIndex,
    isHumanTurn,
    validActions,
    gtoHint,
    currentPlayerIndex,
    handResult,
    awaitingNewHand,
    gameOver,
    gameWinner,
    smallBlind,
    bigBlind,
    equity,
    outs,
  } = state;

  const human = players[humanIndex];
  const opponents = players.filter((_, i) => i !== humanIndex);
  const showOverlay = awaitingNewHand || gameOver;

  const PHASE_LABEL = {
    preflop: "Pre-Flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Showdown",
  };

  const opponentAngles = useMemo(
    () => getOpponentAngles(opponents.length),
    [opponents.length],
  );

  // Responsive chip vertical radius: landscape (desktop 2:1) uses a smaller value
  // so chips stay clear of the taller desktop seat boxes.
  const [chipRY, setChipRY] = useState(() =>
    window.matchMedia("(min-width: 641px)").matches ? 22 : 30,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 641px)");
    const handler = (e) => setChipRY(e.matches ? 22 : 30);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Chip animation
  const prevBetsRef = useRef({});
  const [chipState, setChipState] = useState({});

  useEffect(() => {
    const newChips = {};
    const newCollecting = new Set();
    players.forEach((p) => {
      const prev = prevBetsRef.current[p.name] ?? 0;
      if (p.currentBet > 0) {
        newChips[p.name] = { amount: p.currentBet, collecting: false };
      } else if (prev > 0) {
        newChips[p.name] = { amount: prev, collecting: true };
        newCollecting.add(p.name);
      }
      prevBetsRef.current[p.name] = p.currentBet;
    });
    const t1 = setTimeout(() => setChipState(newChips), 0);
    if (newCollecting.size > 0) {
      const t2 = setTimeout(() => {
        setChipState((curr) => {
          const next = { ...curr };
          newCollecting.forEach((n) => delete next[n]);
          return next;
        });
      }, 450);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    return () => clearTimeout(t1);
  }, [players]);

  // Angle map for chip positioning
  const angleMap = { [human.name]: HUMAN_ANGLE };
  opponents.forEach((p, i) => {
    angleMap[p.name] = opponentAngles[i];
  });
  const chipStacks = Object.entries(chipState)
    .filter(([name]) => angleMap[name] !== undefined)
    .map(([name, { amount, collecting }]) => ({
      name,
      amount,
      angle: angleMap[name],
      collecting,
    }));

  const isShowdown = handResult?.type === "showdown";
  const winnerSet = isShowdown
    ? new Set(handResult.winners.map((w) => w.name))
    : new Set();
  const winAmountMap = isShowdown
    ? Object.fromEntries(handResult.winners.map((w) => [w.name, w.amount]))
    : {};
  const handNameMap = isShowdown
    ? Object.fromEntries(
        (handResult.hands ?? []).map((h) => [h.name, h.handName]),
      )
    : {};

  return (
    <div className="game-layout">
      <header className="game-header">
        <div className="header-left">
          <button
            className="btn--back-menu"
            onClick={onQuit}
            title="Back to menu"
          >
            ← Menu
          </button>
          <span className="header-brand">♠ Mastercraft Poker</span>
        </div>
        <div className="header-center">
          <span className="header-hand">Hand #{handNumber}</span>
          <span className="header-phase">{PHASE_LABEL[phase] || phase}</span>
          <span className="header-blinds">
            {smallBlind}/{bigBlind}
          </span>
        </div>
        <div className="header-right">
          <button
            className={`btn--peek${revealBots ? " btn--peek--on" : ""}`}
            onClick={onToggleReveal}
          >
            {revealBots ? "👁 Hide" : "👁 Peek"}
          </button>
          {isHumanTurn && <span className="your-turn-badge">Your Turn</span>}
        </div>
      </header>

      <div className="table-wrap">
        <div className="table-felt">
          {/* Opponents — compact, positioned around the top arc */}
          {opponents.map((p, i) => {
            const pos = angleToPos(opponentAngles[i], SEAT_RX, SEAT_RY);
            const won = winnerSet.has(p.name);
            return (
              <div
                key={p.name}
                className="seat-anchor"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              >
                <PlayerSeat
                  player={p}
                  isCurrent={
                    !awaitingNewHand &&
                    players.indexOf(p) === currentPlayerIndex
                  }
                  showdownWinner={won}
                  inShowdown={isShowdown && !p.folded && !p.eliminated}
                  handName={handNameMap[p.name] ?? null}
                  winAmount={won ? winAmountMap[p.name] : null}
                  revealBots={revealBots}
                  compact
                />
              </div>
            );
          })}

          {/* Human — bottom centre */}
          {(() => {
            const pos = angleToPos(HUMAN_ANGLE, SEAT_RX, SEAT_RY);
            const won = winnerSet.has(human.name);
            return (
              <div
                className="seat-anchor"
                style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              >
                <PlayerSeat
                  player={human}
                  isCurrent={!awaitingNewHand && isHumanTurn}
                  showdownWinner={won}
                  inShowdown={isShowdown && !human.folded && !human.eliminated}
                  handName={handNameMap[human.name] ?? null}
                  winAmount={won ? winAmountMap[human.name] : null}
                />
              </div>
            );
          })()}

          {/* Chip stacks */}
          {chipStacks.map(({ name, amount, angle, collecting }) => (
            <ChipStack
              key={name}
              amount={amount}
              angle={angle}
              ry={chipRY}
              collecting={collecting}
            />
          ))}

          {/* Board — centred */}
          <div className="board-area">
            <div className="community-cards">
              {[0, 1, 2, 3, 4].map((i) => (
                <Card
                  key={i}
                  card={community[i] ?? null}
                  faceDown={!community[i]}
                  large
                />
              ))}
            </div>
            <div className="pot-display">
              {sidePots?.length > 0 ? (
                sidePots.map((sp, i) => (
                  <span key={i} className="pot-amount pot-amount--side">
                    <span className="pot-label">
                      {i === 0 ? "MAIN" : `SIDE ${i}`}
                    </span>
                    ${sp.amount.toLocaleString()}
                  </span>
                ))
              ) : (
                <>
                  <span className="pot-label">POT</span>
                  <span className="pot-amount">${pot.toLocaleString()}</span>
                </>
              )}
              {currentBet > 0 && (
                <span className="pot-bet">to call: ${currentBet}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="controls-row">
        <PotOdds pot={pot} toCall={currentBet} equity={equity} outs={outs} />
        {!awaitingNewHand && !gameOver && (
          <ActionBar
            validActions={isHumanTurn ? validActions : null}
            gtoHint={gtoHint}
            onAction={onAction}
            loading={loading}
            bigBlind={bigBlind}
            pot={pot}
            phase={phase}
            humanCurrentBet={human.currentBet}
          />
        )}
      </div>

      {showOverlay && (
        <HandResult
          handResult={handResult}
          onNextHand={onNextHand}
          gameOver={gameOver}
          gameWinner={gameWinner}
          loading={loading}
        />
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [revealBots, setRevealBots] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [competitiveMode, setCompetitiveMode] = useState(false);
  const [lookupMode, setLookupMode] = useState(false);
  const [rangeBuilderMode, setRangeBuilderMode] = useState(false);
  const [playerName, setPlayerName] = useState(
    () => sessionStorage.getItem("mc-poker-name") || "",
  );

  const handlePlayerNameChange = useCallback((name) => {
    setPlayerName(name);
    sessionStorage.setItem("mc-poker-name", name);
  }, []);

  const handleClearName = useCallback(() => {
    setPlayerName("");
    sessionStorage.removeItem("mc-poker-name");
  }, []);

  const abortRef = useRef(false);

  async function call(fn) {
    abortRef.current = false;
    setLoading(true);
    setError(null);
    try {
      let s = await fn();
      if (abortRef.current) return;
      setState(s);
      // Run bot turns inline — each setState + await sleep lets React render
      // the intermediate state (thinking dots) before the next bot acts.
      // All-in runouts use a shorter fixed delay so each street is revealed
      // one at a time without waiting for simulated "thinking" time.
      while (!s.isHumanTurn && !s.awaitingNewHand && !s.gameOver) {
        const delay = s.allInRunout ? 2000 : 2000 + Math.random() * 3000;
        await sleep(delay);
        if (abortRef.current) return;
        s = await api.botStep();
        if (abortRef.current) return;
        setState(s);
      }
    } catch (e) {
      if (!abortRef.current) setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleStart = useCallback((n) => call(() => api.newGame(n)), []);
  const handleAction = useCallback(
    (action, raiseBy) => call(() => api.action(action, raiseBy)),
    [],
  );
  const handleNextHand = useCallback(() => {
    if (state?.gameOver) setState(null);
    else call(() => api.newHand());
  }, [state]);

  // Auto-advance to next hand after a short delay
  useEffect(() => {
    if (!state?.awaitingNewHand || state?.gameOver) return;
    const t = setTimeout(() => call(() => api.newHand()), 3000);
    return () => clearTimeout(t);
  }, [state?.awaitingNewHand, state?.gameOver]);

  if (practiceMode) {
    return (
      <PreflopPractice
        onExit={() => setPracticeMode(false)}
        playerName={playerName}
      />
    );
  }

  if (lookupMode) {
    return <HandLookup onExit={() => setLookupMode(false)} />;
  }

  if (rangeBuilderMode) {
    return (
      <RangeBuilder
        onExit={() => setRangeBuilderMode(false)}
        playerName={playerName}
        onPlayerNameChange={handlePlayerNameChange}
      />
    );
  }

  if (competitiveMode) {
    return (
      <CompetitiveMode
        onExit={() => setCompetitiveMode(false)}
        playerName={playerName}
        onPlayerNameChange={handlePlayerNameChange}
      />
    );
  }

  if (!state) {
    return (
      <>
        <SetupScreen
          onStart={handleStart}
          onPractice={() => setPracticeMode(true)}
          onLookup={() => setLookupMode(true)}
          onCompetitive={() => setCompetitiveMode(true)}
          playerName={playerName}
          onClearName={handleClearName}
          loading={loading}
        />
        {error && <div className="error-toast">{error}</div>}
      </>
    );
  }

  return (
    <>
      <GameTable
        state={state}
        onAction={handleAction}
        onNextHand={handleNextHand}
        loading={loading}
        revealBots={revealBots}
        onToggleReveal={() => setRevealBots((r) => !r)}
        onQuit={() => {
          abortRef.current = true;
          setState(null);
        }}
      />
      {error && <div className="error-toast">{error}</div>}
    </>
  );
}
