import { useState, useEffect, useCallback } from 'react';
import { lookupApi, rangesApi } from '../api';
import HandRangeChart from './HandRangeChart';

const DISPLAY_POSITIONS = ['UTG', 'UTG+1', 'UTG+2', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const MP_POSITIONS = new Set(['UTG+1', 'UTG+2', 'LJ', 'HJ']);
const toChartPos = (pos) => MP_POSITIONS.has(pos) ? 'MP' : pos;

const CATEGORIES = [
  { id: 'rfi',     label: 'RFI' },
  { id: 'iso',     label: 'ISO' },
  { id: 'vs-open', label: 'vs Open' },
  { id: 'vs-3bet', label: 'vs 3-Bet' },
  { id: 'vs-4bet', label: 'vs 4-Bet' },
];

const BRUSHES = [
  { id: 'raise',    label: 'Raise',    color: '#1a6b3a', value: 'raise' },
  { id: 'call',     label: 'Call',     color: '#1a4a7a', value: 'call' },
  { id: 'allin',    label: 'All-In',   color: '#6c3483', value: 'allin' },
  { id: 'mixed-rf', label: 'Mix R/F',  color: '#7a4a10', value: ['raise', 'fold'] },
  { id: 'mixed-rc', label: 'Mix R/C',  color: '#145a55', value: ['raise', 'call'] },
  { id: 'fold',     label: 'Fold',     color: '#2c3e50', value: null },
];

const RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];

function normAction(v) {
  if (v == null) return 'fold';
  if (Array.isArray(v)) return [...v].sort().join(',');
  return v;
}

function countDiffs(working, base) {
  let n = 0;
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      let key;
      if (i === j)      key = RANKS[i] + RANKS[j];
      else if (i < j)   key = RANKS[i] + RANKS[j] + 's';
      else              key = RANKS[j] + RANKS[i] + 'o';
      if (normAction(working?.[key]) !== normAction(base?.[key])) n++;
    }
  }
  return n;
}

// ── Name entry (when no playerName yet) ───────────────────────────────────────

function NameEntry({ onSubmit, onExit }) {
  const [name, setName] = useState('');
  return (
    <div className="practice-screen">
      <div className="practice-card">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <h2 className="practice-title" style={{ color: '#e67e22' }}>Range Builder</h2>
        <p className="practice-desc">
          Build custom preflop ranges for every position and scenario. Your ranges are saved to your account and used in Practice and Competitive modes.
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
        <button
          className="btn btn--start"
          style={{ background: '#e67e22' }}
          disabled={!name.trim()}
          onClick={() => onSubmit(name.trim())}
        >
          Load My Ranges →
        </button>
      </div>
    </div>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

export default function RangeBuilder({ playerName, onPlayerNameChange, onExit }) {
  const [scenarios, setScenarios]         = useState([]);
  const [dispPos, setDispPos]             = useState('BTN');
  const [category, setCategory]           = useState(null);
  const [scenarioKey, setScenarioKey]     = useState(null);

  // workingRanges: { scenarioKey → chart } — current edits (may be unsaved)
  const [workingRanges, setWorkingRanges] = useState({});
  // savedRanges: what the server has for this player
  const [savedRanges, setSavedRanges]     = useState({});
  // gtoCharts: { scenarioKey → chart } — GTO baseline cache
  const [gtoCharts, setGtoCharts]         = useState({});
  // which scenario keys have unsaved changes vs the server
  const [dirtyKeys, setDirtyKeys]         = useState(new Set());

  const [brush, setBrush]     = useState('raise');
  const [saving, setSaving]   = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const chartPos   = toChartPos(dispPos);
  const showMPNote = MP_POSITIONS.has(dispPos);

  // Load scenarios list once
  useEffect(() => { lookupApi.scenarios().then(setScenarios); }, []);

  // Load player's saved ranges whenever playerName is set
  const loadUserRanges = useCallback(async (name) => {
    const data = await rangesApi.load(name);
    setSavedRanges(data);
    // Initialize working ranges from saved — each scenario chart is shallow-copied
    // so painting later won't mutate savedRanges
    const working = {};
    Object.keys(data).forEach(k => { working[k] = { ...data[k] }; });
    setWorkingRanges(working);
  }, []);

  useEffect(() => {
    if (playerName) loadUserRanges(playerName);
  }, [playerName, loadUserRanges]);

  // Categories available for current chart position
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPos, scenarios.length]);

  // Filtered scenarios for current position + category
  const filteredScens = scenarios.filter(
    s => s.position === chartPos && s.category === category
  );

  // Auto-select first scenario when category/position changes
  useEffect(() => {
    if (!filteredScens.length) { setScenarioKey(null); return; }
    setScenarioKey(filteredScens[0].key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, chartPos]);

  // Load GTO chart when scenario changes; initialize working range if needed
  useEffect(() => {
    if (!scenarioKey) return;

    const initWorking = (gtoChart) => {
      setWorkingRanges(prev => {
        if (scenarioKey in prev) return prev; // already initialized (from saved or prior edit)
        // No saved range → seed from GTO
        return { ...prev, [scenarioKey]: { ...gtoChart } };
      });
    };

    if (gtoCharts[scenarioKey]) {
      initWorking(gtoCharts[scenarioKey]);
      return;
    }

    setLoading(true);
    lookupApi.chart(scenarioKey)
      .then(d => {
        setGtoCharts(prev => ({ ...prev, [scenarioKey]: d.chart }));
        initWorking(d.chart);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioKey]);

  // Paint a cell with the current brush
  const handlePaint = useCallback((hand) => {
    if (!scenarioKey) return;
    const brushDef = BRUSHES.find(b => b.id === brush);
    const value = brushDef?.value ?? null; // null = fold

    setWorkingRanges(prev => {
      const current = { ...(prev[scenarioKey] || {}) };
      if (value === null) {
        delete current[hand]; // fold is represented by absence
      } else {
        current[hand] = value;
      }
      return { ...prev, [scenarioKey]: current };
    });
    setDirtyKeys(prev => new Set([...prev, scenarioKey]));
    setSaveMsg('');
  }, [scenarioKey, brush]);

  const handleResetToGto = () => {
    if (!scenarioKey || !gtoCharts[scenarioKey]) return;
    const gto = { ...gtoCharts[scenarioKey] };
    setWorkingRanges(prev => ({ ...prev, [scenarioKey]: gto }));

    // Dirty if the GTO range differs from what the server has saved
    const saved = savedRanges[scenarioKey];
    const gtoDiffsSaved = countDiffs(gto, saved || {}) > 0;
    setDirtyKeys(prev => {
      const next = new Set(prev);
      if (gtoDiffsSaved) next.add(scenarioKey);
      else next.delete(scenarioKey);
      return next;
    });
    setSaveMsg('');
  };

  const handleSave = async () => {
    if (!playerName || dirtyKeys.size === 0) return;
    setSaving(true);
    const updates = {};
    dirtyKeys.forEach(k => { updates[k] = workingRanges[k] || {}; });
    await rangesApi.save(playerName, updates);
    setSavedRanges(prev => ({ ...prev, ...updates }));
    setDirtyKeys(new Set());
    setSaving(false);
    setSaveMsg('✓ Saved');
    setTimeout(() => setSaveMsg(''), 2500);
  };

  // ── Name entry screen ──────────────────────────────────────────────────────
  if (!playerName) {
    return <NameEntry onSubmit={onPlayerNameChange} onExit={onExit} />;
  }

  const currentGto      = gtoCharts[scenarioKey];
  const currentWorking  = workingRanges[scenarioKey];
  const currentScenario = scenarios.find(s => s.key === scenarioKey);
  const diffCount       = currentGto && currentWorking ? countDiffs(currentWorking, currentGto) : 0;

  return (
    <div className="practice-screen practice-screen--active">
      <div className="practice-header">
        <button className="practice-exit" onClick={onExit}>← Back</button>
        <span className="practice-title" style={{ color: '#e67e22' }}>Range Builder</span>
        <span className="rb-player-badge">👤 {playerName}</span>
        {dirtyKeys.size > 0 && (
          <span className="rb-dirty-badge">{dirtyKeys.size} unsaved</span>
        )}
        <button
          className={`rb-save-btn${saveMsg ? ' rb-save-btn--saved' : ''}`}
          onClick={handleSave}
          disabled={saving || dirtyKeys.size === 0}
        >
          {saving ? 'Saving…' : saveMsg || 'Save Changes'}
        </button>
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
            {showMPNote && <div className="lookup-mp-note">Showing MP chart</div>}
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
                    className={[
                      'lookup-scenario-btn',
                      scenarioKey === s.key ? 'lookup-scenario-btn--active' : '',
                      dirtyKeys.has(s.key)  ? 'lookup-scenario-btn--dirty'  : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setScenarioKey(s.key)}
                  >
                    {s.scenarioLabel}
                    {dirtyKeys.has(s.key) && <span className="scenario-dirty-dot" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentScenario?.contextDesc && (
            <div className="lookup-context">{currentScenario.contextDesc}</div>
          )}
        </div>

        {/* ── Right: palette + chart ── */}
        <div className="practice-center">
          {loading ? (
            <div className="comp-loading">Loading chart…</div>
          ) : currentWorking !== undefined ? (
            <>
              {/* Brush palette */}
              <div className="rb-palette">
                {BRUSHES.map(b => (
                  <button
                    key={b.id}
                    className={`rb-brush${brush === b.id ? ' rb-brush--active' : ''}`}
                    style={{ '--rb-brush-color': b.color }}
                    onClick={() => setBrush(b.id)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <div className="rb-chart-actions">
                <span className="rb-diff-count">
                  {diffCount > 0
                    ? `${diffCount} hand${diffCount !== 1 ? 's' : ''} differ from GTO`
                    : 'Matches GTO'}
                </span>
                <button className="rb-reset-btn" onClick={handleResetToGto}>
                  ↺ Reset to GTO
                </button>
              </div>

              <HandRangeChart
                chart={currentWorking}
                baseChart={currentGto}
                onPaintCell={handlePaint}
              />
            </>
          ) : (
            <div className="lookup-prompt">Select a position and scenario to start building</div>
          )}
        </div>

      </div>
    </div>
  );
}
