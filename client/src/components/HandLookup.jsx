import { useState, useEffect } from 'react';
import { lookupApi } from '../api';
import HandRangeChart from './HandRangeChart';

const DISPLAY_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const MP_POSITIONS = new Set(['UTG+1', 'UTG+2', 'LJ', 'HJ']);

function toChartPos(pos) {
  return MP_POSITIONS.has(pos) ? 'MP' : pos;
}

const CATEGORIES = [
  { id: 'rfi',     label: 'RFI' },
  { id: 'iso',     label: 'ISO' },
  { id: 'vs-open', label: 'vs Open' },
  { id: 'vs-3bet', label: 'vs 3-Bet' },
  { id: 'vs-4bet', label: 'vs 4-Bet' },
];

const ACTION_STYLE = {
  raise: { bg: '#1a6b3a', label: 'Raise' },
  allin: { bg: '#6c3483', label: 'All-In' },
  call:  { bg: '#1a4a7a', label: 'Call' },
  fold:  { bg: '#2c3e50', label: 'Fold' },
};

export default function HandLookup({ onExit }) {
  const [scenarios, setScenarios]       = useState([]);
  const [dispPos, setDispPos]           = useState('BTN');
  const [category, setCategory]         = useState(null);
  const [scenarioKey, setScenarioKey]   = useState(null);
  const [chart, setChart]               = useState(null);
  const [selectedHand, setSelectedHand] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);

  const chartPos = toChartPos(dispPos);
  const showMPNote = MP_POSITIONS.has(dispPos);

  // Load scenario metadata once
  useEffect(() => {
    lookupApi.scenarios().then(setScenarios);
  }, []);

  // Categories available for the current chart position
  const availCats = CATEGORIES.filter(c =>
    scenarios.some(s => s.position === chartPos && s.category === c.id)
  );

  // Reset category + scenario when chart position changes
  useEffect(() => {
    if (!scenarios.length) return;
    const first = CATEGORIES.find(c =>
      scenarios.some(s => s.position === chartPos && s.category === c.id)
    );
    setCategory(first?.id ?? null);
    setScenarioKey(null);
    setChart(null);
    setSelectedHand(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPos, scenarios.length]);

  // Scenarios for current position + category
  const filteredScens = scenarios.filter(
    s => s.position === chartPos && s.category === category
  );

  // Auto-select first scenario when category changes
  useEffect(() => {
    if (!filteredScens.length) { setScenarioKey(null); return; }
    setScenarioKey(filteredScens[0].key);
    setSelectedHand(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, chartPos]);

  // Fetch chart when scenario changes
  useEffect(() => {
    if (!scenarioKey) { setChart(null); return; }
    setLoadingChart(true);
    setSelectedHand(null);
    lookupApi.chart(scenarioKey)
      .then(d => { setChart(d.chart); setLoadingChart(false); })
      .catch(() => setLoadingChart(false));
  }, [scenarioKey]);

  // Resolve GTO actions for selected hand
  const raw = selectedHand && chart ? (chart[selectedHand] ?? null) : null;
  const gtoActions = selectedHand
    ? (!raw ? ['fold'] : Array.isArray(raw) ? raw : [raw])
    : null;

  const isMixed = gtoActions && gtoActions.length > 1;

  const currentScenario = scenarios.find(s => s.key === scenarioKey);

  return (
    <div className="practice-screen practice-screen--active">
      <div className="practice-header">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <span className="practice-title" style={{ color: '#5b9bd5' }}>Hand Lookup</span>
        {currentScenario && (
          <span className="practice-header-cat">{currentScenario.scenarioLabel}</span>
        )}
      </div>

      <div className="practice-body">

        {/* ── Left sidebar: selectors ── */}
        <div className="lookup-sidebar">

          <div className="lookup-section">
            <div className="lookup-section-label">Position</div>
            <div className="lookup-pos-grid">
              {DISPLAY_POSITIONS.map(pos => (
                <button
                  key={pos}
                  className={`lookup-pos-btn${dispPos === pos ? ' lookup-pos-btn--active' : ''}`}
                  onClick={() => setDispPos(pos)}
                >
                  {pos}
                </button>
              ))}
            </div>
            {showMPNote && (
              <div className="lookup-mp-note">Showing MP chart</div>
            )}
          </div>

          <div className="lookup-section">
            <div className="lookup-section-label">Scenario</div>
            <div className="lookup-cat-pills">
              {availCats.map(c => (
                <button
                  key={c.id}
                  className={`cat-btn${category === c.id ? ' cat-btn--active' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {filteredScens.length > 1 && (
            <div className="lookup-section">
              <div className="lookup-section-label">Matchup</div>
              <div className="lookup-scenario-list">
                {filteredScens.map(s => (
                  <button
                    key={s.key}
                    className={`lookup-scenario-btn${scenarioKey === s.key ? ' lookup-scenario-btn--active' : ''}`}
                    onClick={() => { setScenarioKey(s.key); setSelectedHand(null); }}
                  >
                    {s.scenarioLabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentScenario?.contextDesc && (
            <div className="lookup-context">{currentScenario.contextDesc}</div>
          )}
        </div>

        {/* ── Right: chart + result ── */}
        <div className="practice-center">
          {loadingChart ? (
            <div className="comp-loading">Loading chart…</div>
          ) : chart ? (
            <>
              <HandRangeChart
                chart={chart}
                highlightHand={selectedHand}
                onSelectHand={setSelectedHand}
              />

              {gtoActions ? (
                <div className={`lookup-result lookup-result--${isMixed ? 'mixed' : gtoActions[0]}`}>
                  <span className="lookup-result-hand">
                    {selectedHand}
                    {selectedHand?.endsWith('s') && <span className="lookup-so-badge lookup-so-badge--suited">suited</span>}
                    {selectedHand?.endsWith('o') && <span className="lookup-so-badge lookup-so-badge--offsuit">offsuit</span>}
                  </span>
                  <span className="lookup-result-action">
                    {isMixed ? (
                      <>
                        {gtoActions.map((a, i) => (
                          <span key={a} className={`lookup-action-word lookup-action-word--${a}`}>
                            {i > 0 && <span className="lookup-action-sep"> / </span>}
                            {ACTION_STYLE[a]?.label ?? a}
                          </span>
                        ))}
                        <span className="lookup-mixed-tag">Mixed</span>
                      </>
                    ) : (
                      <span
                        className="lookup-action-pill"
                        style={{ background: ACTION_STYLE[gtoActions[0]]?.bg ?? '#2c3e50' }}
                      >
                        {ACTION_STYLE[gtoActions[0]]?.label ?? gtoActions[0]}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="lookup-prompt">↑ Click any hand on the chart</div>
              )}
            </>
          ) : (
            <div className="lookup-prompt">Select a position and scenario to load the chart</div>
          )}
        </div>

      </div>
    </div>
  );
}
