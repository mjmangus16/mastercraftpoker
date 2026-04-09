import { useState, useCallback, useEffect, useRef } from 'react';
import { practiceApi, competitiveApi } from '../api';
import Card from './Card';

const LEVELS = Array.from({ length: 40 }, (_, i) => ({
  number: i + 1,
  hands: (i + 1) * 25,
}));

const POSITION_COLORS = {
  BTN: '#c0392b', SB: '#d35400', BB: '#27ae60',
  CO: '#2980b9', HJ: '#5b6eae', LJ: '#6c7a89',
  UTG: '#7f8c8d', MP: '#7f8c8d',
};

const ACTION_LABELS = { raise: 'Raise', allin: 'All-In', call: 'Call', fold: 'Fold' };

// ── Shared level grid ─────────────────────────────────────────────────────────

function LevelGrid({ maxUnlocked, leaderboard, playerName, selectedLevel, onSelect, activeLevel }) {
  function playerBest(lvl) {
    const entries = leaderboard[String(lvl)] || [];
    const mine = entries.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
    return mine.length ? mine[0] : null;
  }

  return (
    <div className="comp-grid">
      {LEVELS.map(lvl => {
        const locked  = lvl.number > maxUnlocked;
        const best    = playerBest(lvl.number);
        const perfect = best?.pct === 100;
        const isActive = activeLevel?.number === lvl.number;
        return (
          <button
            key={lvl.number}
            className={[
              'level-btn',
              locked    ? 'level-btn--locked'   : '',
              perfect   ? 'level-btn--complete'  : '',
              isActive  ? 'level-btn--active'    : '',
              selectedLevel === lvl.number ? 'level-btn--selected' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !locked && onSelect(lvl.number)}
            title={locked
              ? `Complete level ${lvl.number - 1} with 100% to unlock`
              : `Level ${lvl.number} — ${lvl.hands} hands`}
          >
            <span className="level-num">{lvl.number}</span>
            <span className="level-hands">{lvl.hands}h</span>
            {perfect && <span className="level-star">★</span>}
            {!locked && !perfect && best && <span className="level-best">{best.pct}%</span>}
            {locked && <span className="level-lock">🔒</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Leaderboard table ─────────────────────────────────────────────────────────

function LeaderboardPanel({ lbLevel, leaderboard, playerName, maxUnlocked, onPlay }) {
  const lbEntries = lbLevel ? (leaderboard[String(lbLevel)] || []) : [];
  const locked = lbLevel > maxUnlocked;

  return (
    <div className="comp-lb-panel">
      <div className="comp-lb-header">
        <span className="comp-lb-title">
          Level {lbLevel} — {LEVELS[lbLevel - 1].hands} hands
        </span>
        {onPlay && !locked && (
          <button
            className="btn btn--start"
            style={{ background: '#922b21', fontSize: 13, padding: '7px 18px' }}
            onClick={() => onPlay(LEVELS[lbLevel - 1])}
          >
            Play →
          </button>
        )}
      </div>
      {lbEntries.length === 0 ? (
        <p className="comp-lb-empty">No scores yet. Be the first!</p>
      ) : (
        <table className="comp-lb-table">
          <thead>
            <tr><th>#</th><th>Name</th><th>Score</th><th>Date</th></tr>
          </thead>
          <tbody>
            {lbEntries.map((e, i) => (
              <tr key={i} className={e.name.toLowerCase() === playerName.toLowerCase() ? 'lb-row--mine' : ''}>
                <td>{i + 1}</td>
                <td>{e.name}</td>
                <td>
                  <span className={`lb-score lb-score--${e.pct === 100 ? 'perfect' : e.pct >= 80 ? 'good' : 'ok'}`}>
                    {e.correct}/{e.total} ({e.pct}%)
                  </span>
                </td>
                <td>{e.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Name entry ────────────────────────────────────────────────────────────────

function NameEntry({ onSubmit, onExit }) {
  const [name, setName] = useState('');
  return (
    <div className="comp-screen">
      <div className="practice-card">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <h2 className="practice-title" style={{ color: '#e74c3c' }}>Competitive Mode</h2>
        <p className="practice-desc">
          No charts. No hints. Just you and the cards.<br />
          Complete each level with 100% to unlock the next.
        </p>
        <label className="comp-name-label">Your name</label>
        <input
          className="comp-name-input"
          placeholder="Enter name…"
          maxLength={24}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
          autoFocus
        />
        <button
          className="btn btn--start"
          style={{ background: '#922b21' }}
          disabled={!name.trim()}
          onClick={() => onSubmit(name.trim())}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ── Level select ──────────────────────────────────────────────────────────────

function LevelSelect({ playerName, maxUnlocked, leaderboard, onPlay, onExit }) {
  const [lbLevel, setLbLevel] = useState(1);

  return (
    <div className="comp-screen comp-screen--levels">
      <div className="comp-levels-header">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <span className="practice-title" style={{ color: '#e74c3c' }}>Competitive Mode</span>
        <span className="comp-player-name">Playing as: <strong>{playerName}</strong></span>
      </div>

      <div className="comp-levels-body">
        <LevelGrid
          maxUnlocked={maxUnlocked}
          leaderboard={leaderboard}
          playerName={playerName}
          selectedLevel={lbLevel}
          onSelect={setLbLevel}
          activeLevel={null}
        />
        <LeaderboardPanel
          lbLevel={lbLevel}
          leaderboard={leaderboard}
          playerName={playerName}
          maxUnlocked={maxUnlocked}
          onPlay={onPlay}
        />
      </div>
    </div>
  );
}

// ── Playing ───────────────────────────────────────────────────────────────────

function Playing({ level, playerName, maxUnlocked, leaderboard, onComplete, onExit }) {
  const [hand, setHand]         = useState(null);
  const [handNum, setHandNum]   = useState(1);
  const [correct, setCorrect]   = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [lbLevel, setLbLevel]   = useState(level.number);

  const dealNext = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    const data = await practiceApi.deal('all');
    setHand(data);
    setLoading(false);
  }, []);

  useEffect(() => { dealNext(); }, [dealNext]);

  const handleAnswer = useCallback(async (action) => {
    if (feedback || loading) return;
    const result = await practiceApi.evaluate(action);
    setCorrect(c => c + (result.correct ? 1 : 0));
    setFeedback({ isCorrect: result.correct, gtoActions: result.gtoActions, chosen: action });
  }, [feedback, loading]);

  const isLastHand = handNum === level.hands;
  const answeredCount = feedback ? handNum : handNum - 1;
  const pct = answeredCount > 0 ? Math.round(correct / answeredCount * 100) : 100;

  const handleNext = () => {
    const finalCorrect = correct + (feedback?.isCorrect ? 0 : 0); // already updated by handleAnswer
    if (isLastHand) {
      onComplete(correct);
      return;
    }
    setHandNum(n => n + 1);
    dealNext();
  };

  return (
    <div className="comp-screen comp-screen--playing">
      {/* Top bar */}
      <div className="comp-play-header">
        <button className="practice-exit" onClick={onExit}>✕ Quit</button>
        <div className="comp-progress">
          <span className="comp-hand-count">Hand <strong>{handNum}</strong> / {level.hands}</span>
          <div className="comp-progress-bar">
            <div className="comp-progress-fill" style={{ width: `${((handNum - 1) / level.hands) * 100}%` }} />
          </div>
        </div>
        <div className="comp-score-display">
          <span className="comp-score-num">{correct}</span>
          <span className="comp-score-denom">/{answeredCount || 0}</span>
          {answeredCount > 0 && <span className="comp-score-pct">({pct}%)</span>}
        </div>
      </div>

      {/* Three-column body: level grid | play area | leaderboard */}
      <div className="comp-play-body">

        {/* Left: level grid */}
        <div className="comp-play-sidebar comp-play-sidebar--left">
          <div className="comp-sidebar-title">Levels</div>
          <LevelGrid
            maxUnlocked={maxUnlocked}
            leaderboard={leaderboard}
            playerName={playerName}
            selectedLevel={lbLevel}
            onSelect={setLbLevel}
            activeLevel={level}
          />
        </div>

        {/* Center: cards + actions */}
        <div className="comp-play-center">
          {loading ? (
            <div className="comp-loading">Dealing…</div>
          ) : (
            <>
              <div
                className="practice-position-banner comp-play-banner"
                style={{ background: POSITION_COLORS[hand?.position] ?? '#4a5568' }}
              >
                <span className="banner-position">{hand?.position}</span>
                <span className="banner-scenario">{hand?.scenarioLabel}</span>
              </div>

              <div className="practice-context">{hand?.contextDesc}</div>

              <div className="comp-play-cards">
                {hand?.holeCards.map((c, i) => <Card key={i} card={c} xlarge />)}
              </div>

              {!feedback ? (
                <div className="comp-action-buttons">
                  {['raise', 'allin', 'call', 'fold'].map(a => (
                    <button key={a} className={`btn btn--${a === 'allin' ? 'allin' : a} comp-action-btn`} onClick={() => handleAnswer(a)}>
                      {ACTION_LABELS[a]}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`comp-play-feedback comp-feedback--${feedback.isCorrect ? 'correct' : 'wrong'}`}>
                  {feedback.isCorrect ? (
                    <div className="comp-feedback-correct">✓ Correct!</div>
                  ) : (
                    <>
                      <div className="comp-feedback-wrong">✗ Incorrect</div>
                      <div className="comp-feedback-answer-label">Correct answer</div>
                      <div className="comp-feedback-answer">
                        {feedback.gtoActions.map(a => ACTION_LABELS[a] || a).join(' or ')}
                      </div>
                      <div className="comp-feedback-chosen">You chose: {ACTION_LABELS[feedback.chosen]}</div>
                    </>
                  )}
                  <button
                    className="btn btn--start"
                    style={{ background: '#922b21', marginTop: 8 }}
                    onClick={handleNext}
                  >
                    {isLastHand ? 'See Results →' : 'Next Hand →'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: leaderboard */}
        <div className="comp-play-sidebar comp-play-sidebar--right">
          <div className="comp-sidebar-title">Leaderboard</div>
          <LeaderboardPanel
            lbLevel={lbLevel}
            leaderboard={leaderboard}
            playerName={playerName}
            maxUnlocked={maxUnlocked}
            onPlay={null}
          />
        </div>

      </div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({ level, correct, playerName, onSaved, onRetry, onLevels }) {
  const total   = level.hands;
  const pct     = Math.round(correct / total * 100);
  const perfect = pct === 100;
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const save = async () => {
    setSaving(true);
    await competitiveApi.saveScore(playerName, level.number, correct, total);
    setSaved(true);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="comp-screen">
      <div className="practice-card" style={{ maxWidth: 480 }}>
        <div className={`comp-result-banner ${perfect ? 'comp-result-banner--perfect' : ''}`}>
          {perfect ? '🏆 Perfect Score!' : 'Level Complete'}
        </div>
        <div className="comp-result-score">
          <span className="comp-result-num">{correct}</span>
          <span className="comp-result-total">/{total}</span>
          <span className={`comp-result-pct ${perfect ? 'comp-result-pct--perfect' : ''}`}>{pct}%</span>
        </div>
        {perfect && level.number < 40 && (
          <div className="comp-result-unlock">
            Level {level.number + 1} unlocked! ({(level.number + 1) * 25} hands)
          </div>
        )}
        {!perfect && (
          <div className="comp-result-note">
            You need 100% to unlock the next level.
          </div>
        )}
        <div className="comp-result-actions">
          {!saved ? (
            <button className="btn btn--call" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : `Save Score as "${playerName}"`}
            </button>
          ) : (
            <span className="comp-saved-msg">✓ Score saved</span>
          )}
          <button className="btn btn--raise" onClick={onRetry}>Try Again</button>
          <button className="btn btn--secondary" onClick={onLevels}>Level Select</button>
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function CompetitiveMode({ onExit }) {
  const [screen, setScreen]           = useState('name');
  const [playerName, setPlayerName]   = useState('');
  const [maxUnlocked, setMaxUnlocked] = useState(1);
  const [leaderboard, setLeaderboard] = useState({});
  const [activeLevel, setActiveLevel] = useState(null);
  const [finalCorrect, setFinalCorrect] = useState(0);

  const refresh = useCallback(async (name) => {
    const [lb, ul] = await Promise.all([
      competitiveApi.leaderboard(),
      competitiveApi.unlocks(name),
    ]);
    setLeaderboard(lb);
    setMaxUnlocked(ul.maxUnlocked);
  }, []);

  const handleName = async (name) => {
    setPlayerName(name);
    await refresh(name);
    setScreen('levels');
  };

  const handlePlay = (level) => {
    setActiveLevel(level);
    setScreen('playing');
  };

  const handleComplete = (correct) => {
    setFinalCorrect(correct);
    setScreen('done');
  };

  const handleSaved = () => refresh(playerName);

  return (
    <>
      {screen === 'name' && (
        <NameEntry onSubmit={handleName} onExit={onExit} />
      )}
      {screen === 'levels' && (
        <LevelSelect
          playerName={playerName}
          maxUnlocked={maxUnlocked}
          leaderboard={leaderboard}
          onPlay={handlePlay}
          onExit={onExit}
        />
      )}
      {screen === 'playing' && (
        <Playing
          level={activeLevel}
          playerName={playerName}
          maxUnlocked={maxUnlocked}
          leaderboard={leaderboard}
          onComplete={handleComplete}
          onExit={() => setScreen('levels')}
        />
      )}
      {screen === 'done' && (
        <Results
          level={activeLevel}
          correct={finalCorrect}
          playerName={playerName}
          onSaved={handleSaved}
          onRetry={() => handlePlay(activeLevel)}
          onLevels={async () => { await refresh(playerName); setScreen('levels'); }}
        />
      )}
    </>
  );
}
