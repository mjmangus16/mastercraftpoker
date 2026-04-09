import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { api } from "./api";
import Card from "./components/Card";
import PlayerSeat from "./components/PlayerSeat";
import ActionBar from "./components/ActionBar";
import HandResult from "./components/HandResult";
import PreflopPractice from "./components/PreflopPractice";
import CompetitiveMode from "./components/CompetitiveMode";
import "./App.css";

// ── Setup screen ───────────────────────────────────────────────────────────────

function SetupScreen({ onStart, onPractice, onCompetitive, loading }) {
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
          className="btn btn--competitive-mode"
          onClick={onCompetitive}
          disabled={loading}
        >
          Competitive Mode
        </button>
      </div>
    </div>
  );
}

// ── Action log ─────────────────────────────────────────────────────────────────

function ActionLog({ actions }) {
  if (!actions?.length) return null;
  const LABELS = {
    fold: "folds",
    check: "checks",
    call: "calls",
    raise: "raises",
  };
  return (
    <div className="action-log">
      {[...actions].reverse().map((a, i) => (
        <div
          key={i}
          className={`log-entry${a.isHuman ? " log-entry--human" : ""}`}
        >
          <span className="log-player">{a.player}</span>
          <span className="log-action">{LABELS[a.action] || a.action}</span>
          {a.action === "raise" && a.raiseBy > 0 && (
            <span className="log-amount">${a.raiseBy}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Oval table helpers ─────────────────────────────────────────────────────────

const SEAT_RX = 42; // % of table width from center
const SEAT_RY = 35; // % of table height from center
const CHIP_RX = 26;
const CHIP_RY = 21;

// Human sits at bottom (90° in CSS coords where y-down = positive)
const HUMAN_ANGLE = 90;

function getOpponentAngles(n) {
  if (n === 0) return [];
  if (n === 1) return [270];
  // Arc centered at top (270°), scaled with player count
  const maxArc = Math.min(240, 90 + n * 20);
  const arcStart = 270 - maxArc / 2;
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

function ChipStack({ amount, angle, collecting }) {
  const pos = angleToPos(angle, CHIP_RX, CHIP_RY);
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
    lastActions,
    handResult,
    awaitingNewHand,
    gameOver,
    gameWinner,
    smallBlind,
    bigBlind,
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

  // Seat positions around the oval
  const opponentAngles = useMemo(
    () => getOpponentAngles(opponents.length),
    [opponents.length],
  );

  // Chip animation: track bets and animate when collected
  const prevBetsRef = useRef({});
  const [chipState, setChipState] = useState({}); // { playerName: { amount, collecting } }

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

    const t1 = setTimeout(() => {
      setChipState(newChips);
    }, 0);

    if (newCollecting.size > 0) {
      const t = setTimeout(() => {
        setChipState((curr) => {
          const next = { ...curr };
          newCollecting.forEach((name) => delete next[name]);
          return next;
        });
      }, 450);
      return () => {
        clearTimeout(t1);
        clearTimeout(t);
      };
    }

    return () => clearTimeout(t1);
  }, [players]);

  // Showdown info — used to size/highlight seats
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

  // Build angle map for chip positioning
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

  return (
    <div className="game-layout">
      <header className="game-header">
        <div className="header-left">
          <button className="btn--back-menu" onClick={onQuit} title="Back to menu">← Menu</button>
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
          {/* Opponent seats — absolute around oval */}
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
                />
              </div>
            );
          })}

          {/* Human seat — bottom center */}
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

          {/* Board — centered */}
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
                <>
                  {sidePots.map((sp, i) => (
                    <span key={i} className="pot-amount pot-amount--side">
                      <span className="pot-label">
                        {i === 0 ? "MAIN" : `SIDE ${i}`}
                      </span>
                      ${sp.amount.toLocaleString()}
                    </span>
                  ))}
                </>
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

          {/* Chip stacks */}
          {chipStacks.map(({ name, amount, angle, collecting }) => (
            <ChipStack
              key={name}
              amount={amount}
              angle={angle}
              collecting={collecting}
            />
          ))}
        </div>
      </div>

      <div className="controls-row">
        <ActionLog actions={lastActions} />
        {isHumanTurn && !showOverlay && (
          <ActionBar
            validActions={validActions}
            gtoHint={gtoHint}
            onAction={onAction}
            loading={loading}
          />
        )}
        {awaitingNewHand && !gameOver && (
          <div className="action-bar">
            <div className="action-buttons">
              <button
                className="btn btn--call"
                onClick={onNextHand}
                disabled={loading}
              >
                {loading ? "Dealing…" : "Next Hand →"}
              </button>
            </div>
          </div>
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

  async function call(fn) {
    setLoading(true);
    setError(null);
    try {
      let s = await fn();
      setState(s);
      // Run bot turns inline — each setState + await sleep lets React render
      // the intermediate state (thinking dots) before the next bot acts
      while (!s.isHumanTurn && !s.awaitingNewHand && !s.gameOver) {
        await sleep(2000 + Math.random() * 3000);
        s = await api.botStep();
        setState(s);
      }
    } catch (e) {
      setError(e.message);
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

  if (practiceMode) {
    return <PreflopPractice onExit={() => setPracticeMode(false)} />;
  }

  if (competitiveMode) {
    return <CompetitiveMode onExit={() => setCompetitiveMode(false)} />;
  }

  if (!state) {
    return (
      <>
        <SetupScreen onStart={handleStart} onPractice={() => setPracticeMode(true)} onCompetitive={() => setCompetitiveMode(true)} loading={loading} />
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
        onQuit={() => setState(null)}
      />
      {error && <div className="error-toast">{error}</div>}
    </>
  );
}
