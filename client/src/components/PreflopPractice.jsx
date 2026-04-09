import { useState, useCallback } from 'react';
import { practiceApi } from '../api';
import Card from './Card';
import HandRangeChart from './HandRangeChart';

const POSITION_COLORS = {
  BTN: '#c0392b', SB: '#d35400', BB: '#27ae60',
  CO: '#2980b9', HJ: '#5b6eae', LJ: '#6c7a89',
  UTG: '#7f8c8d', MP: '#7f8c8d',
};

const ACTION_LABELS = { raise: 'Raise', allin: 'All-In', call: 'Call', fold: 'Fold' };

const CATEGORIES = [
  { id: 'all',     label: 'All Scenarios' },
  { id: 'rfi',     label: 'Raise First In' },
  { id: 'iso',     label: 'Isolation' },
  { id: 'vs-open', label: 'vs Open' },
  { id: 'vs-3bet', label: 'vs 3-Bet' },
  { id: 'vs-4bet', label: 'vs 4-Bet' },
];

export default function PreflopPractice({ onExit }) {
  const [hand, setHand]         = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [category, setCategory] = useState('all');
  const [stats, setStats]       = useState({ correct: 0, total: 0 });

  const deal = useCallback(async (cat) => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await practiceApi.deal(cat ?? category);
      setHand(data);
    } finally {
      setLoading(false);
    }
  }, [category]);

  const evaluate = useCallback(async (action) => {
    if (!hand || feedback) return;
    const result = await practiceApi.evaluate(action);
    setFeedback({ ...result, chosen: action });
    setStats(s => ({
      correct: s.correct + (result.correct ? 1 : 0),
      total: s.total + 1,
    }));
  }, [hand, feedback]);

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    setHand(null);
    setFeedback(null);
  };

  // Start / category selection screen
  if (!hand && !loading) {
    return (
      <div className="practice-screen">
        <div className="practice-card">
          <button className="practice-exit" onClick={onExit}>← Back</button>
          <h2 className="practice-title">Preflop Practice</h2>
          <p className="practice-desc">
            Study the GTO chart for your position, then choose the correct action.
          </p>

          <div className="practice-cat-label">Choose a scenario</div>
          <div className="practice-categories">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                className={`cat-btn${category === c.id ? ' cat-btn--active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {stats.total > 0 && (
            <div className="practice-stats-block">
              Session: <strong>{stats.correct}/{stats.total}</strong> correct
              &nbsp;({Math.round(stats.correct / stats.total * 100)}%)
            </div>
          )}

          <button className="btn btn--start" onClick={() => deal()} disabled={loading}>
            {loading ? 'Dealing…' : 'Deal Hand'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-screen practice-screen--active">
      <div className="practice-header">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <span className="practice-title">Preflop Practice</span>
        <span className="practice-header-cat">
          {CATEGORIES.find(c => c.id === category)?.label}
        </span>
        {stats.total > 0 && (
          <span className="practice-stats">
            {stats.correct}/{stats.total} ({Math.round(stats.correct / stats.total * 100)}%)
          </span>
        )}
      </div>

      <div className="practice-body">
        {/* Left: GTO chart */}
        <div className="practice-left">
          <div className="practice-chart-label">
            {hand?.position} — {hand?.scenarioLabel}
          </div>
          {hand && (
            <HandRangeChart chart={hand.chart} highlightHand={hand.hand} />
          )}
        </div>

        {/* Center: cards + actions */}
        <div className="practice-center">
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
            <>
              <p className="practice-prompt">What is the GTO play?</p>
              <div className="comp-action-buttons">
                {['raise', 'allin', 'call', 'fold'].map(a => (
                  <button
                    key={a}
                    className={`btn btn--${a === 'allin' ? 'allin' : a} comp-action-btn`}
                    onClick={() => evaluate(a)}
                    disabled={loading}
                  >
                    {ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className={`comp-play-feedback comp-feedback--${feedback.correct ? 'correct' : 'wrong'}`}>
              {feedback.correct ? (
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
              <button className="btn btn--start" onClick={() => deal()} disabled={loading} style={{ marginTop: 8 }}>
                {loading ? 'Dealing…' : 'Next Hand →'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
