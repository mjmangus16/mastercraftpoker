import { useState, useCallback, useEffect } from 'react';
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
    if (!playerName) return null;
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
              locked   ? 'level-btn--locked'  : '',
              perfect  ? 'level-btn--complete' : '',
              isActive ? 'level-btn--active'   : '',
              selectedLevel === lvl.number ? 'level-btn--selected' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelect(lvl.number)}
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
        {onPlay && locked && (
          <span className="comp-lb-locked-msg">🔒 Complete level {lbLevel - 1} with 100% to unlock</span>
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
              <tr key={i} className={playerName && e.name.toLowerCase() === playerName.toLowerCase() ? 'lb-row--mine' : ''}>
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

// ── Level select (public — no name required) ──────────────────────────────────

function LevelSelect({ playerName, maxUnlocked, leaderboard, onPlay, onExit }) {
  const [lbLevel, setLbLevel] = useState(1);

  return (
    <div className="comp-screen comp-screen--levels">
      <div className="comp-levels-header">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <span className="practice-title" style={{ color: '#e74c3c' }}>Competitive Mode</span>
        {playerName
          ? <span className="comp-player-name">Playing as: <strong>{playerName}</strong></span>
          : <span className="comp-player-name comp-player-name--anon">Enter your name to play</span>
        }
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

// ── Name entry modal (shown over level select when Play is clicked) ────────────

function NameModal({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 360 }}>
        <h3 style={{ color: '#e74c3c', margin: 0, fontSize: 20 }}>Enter your name</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: 0 }}>
          Your progress and scores will be saved under this name.
        </p>
        <input
          className="comp-name-input"
          placeholder="Your name…"
          maxLength={24}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn--start"
            style={{ background: '#922b21', flex: 1, marginTop: 0 }}
            disabled={!name.trim()}
            onClick={() => onSubmit(name.trim())}
          >
            Play →
          </button>
          <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        </div>
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
    if (isLastHand) { onComplete(correct); return; }
    setHandNum(n => n + 1);
    dealNext();
  };

  return (
    <div className="comp-screen comp-screen--playing">
      <div className="comp-play-header">
        <button className="practice-exit" onClick={onExit}>✕ Quit</button>
        <span className="comp-level-badge">Lv {level.number}</span>
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

      <div className="comp-play-body">
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
                  <button className="btn btn--start" style={{ background: '#922b21', marginTop: 8 }} onClick={handleNext}>
                    {isLastHand ? 'See Results →' : 'Next Hand →'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

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
          <div className="comp-result-note">You need 100% to unlock the next level.</div>
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

export default function CompetitiveMode({ onExit, playerName, onPlayerNameChange }) {
  const [screen, setScreen]           = useState('levels');
  const [maxUnlocked, setMaxUnlocked] = useState(1);
  const [leaderboard, setLeaderboard]   = useState({});
  const [activeLevel, setActiveLevel]   = useState(null);
  const [pendingLevel, setPendingLevel] = useState(null); // level clicked before name entered
  const [finalCorrect, setFinalCorrect] = useState(0);

  // Load leaderboard on mount (no name needed)
  const loadLeaderboard = useCallback(async () => {
    const lb = await competitiveApi.leaderboard();
    setLeaderboard(lb);
  }, []);

  // Refresh leaderboard + unlocks for a named player
  const refresh = useCallback(async (name) => {
    const [lb, ul] = await Promise.all([
      competitiveApi.leaderboard(),
      competitiveApi.unlocks(name),
    ]);
    setLeaderboard(lb);
    setMaxUnlocked(ul.maxUnlocked);
  }, []);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  // Called when user clicks Play on a level
  const handlePlayRequest = (level) => {
    if (playerName) {
      // Already have a name — check lock and go
      if (level.number > maxUnlocked) return;
      setActiveLevel(level);
      setScreen('playing');
    } else {
      // Need a name first
      setPendingLevel(level);
      setScreen('name-modal');
    }
  };

  // Called when name is submitted from modal
  const handleNameSubmit = async (name) => {
    onPlayerNameChange(name);
    const [lb, ul] = await Promise.all([
      competitiveApi.leaderboard(),
      competitiveApi.unlocks(name),
    ]);
    setLeaderboard(lb);
    setMaxUnlocked(ul.maxUnlocked);
    // Check the pending level is now unlocked
    if (pendingLevel && pendingLevel.number <= ul.maxUnlocked) {
      setActiveLevel(pendingLevel);
      setPendingLevel(null);
      setScreen('playing');
    } else {
      setPendingLevel(null);
      setScreen('levels');
    }
  };

  const handleComplete = (correct) => {
    setFinalCorrect(correct);
    setScreen('done');
  };

  const handleSaved = () => refresh(playerName);

  return (
    <>
      {(screen === 'levels' || screen === 'name-modal') && (
        <LevelSelect
          playerName={playerName}
          maxUnlocked={maxUnlocked}
          leaderboard={leaderboard}
          onPlay={handlePlayRequest}
          onExit={onExit}
        />
      )}
      {screen === 'name-modal' && (
        <NameModal
          onSubmit={handleNameSubmit}
          onCancel={() => { setPendingLevel(null); setScreen('levels'); }}
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
          onRetry={() => handlePlayRequest(activeLevel)}
          onLevels={async () => { await refresh(playerName); setScreen('levels'); }}
        />
      )}
    </>
  );
}
