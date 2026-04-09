const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function cellKey(i, j) {
  if (i === j) return RANKS[i] + RANKS[j];        // pair
  if (i < j)  return RANKS[i] + RANKS[j] + 's';   // suited (upper-right)
  return RANKS[j] + RANKS[i] + 'o';               // offsuit (lower-left)
}

function cellColor(action) {
  if (!action) return null; // fold = default dark bg
  const arr = Array.isArray(action) ? action : [action];
  const hasRaise = arr.includes('raise') || arr.includes('allin');
  const hasCall  = arr.includes('call');
  const hasFold  = arr.includes('fold');
  if (hasRaise && hasFold && !hasCall) return 'mixed-rf';
  if (hasRaise && hasCall)             return 'mixed-rc';
  if (hasRaise)  return 'raise';
  if (hasCall)   return 'call';
  return null; // fold
}

export default function HandRangeChart({ chart, highlightHand }) {
  return (
    <div className="range-chart">
      <div className="range-grid">
        {RANKS.map((_, i) =>
          RANKS.map((_, j) => {
            const key   = cellKey(i, j);
            const color = cellColor(chart[key]);
            const hi    = key === highlightHand;
            return (
              <div
                key={key}
                className={[
                  'range-cell',
                  color ? `range-cell--${color}` : '',
                  hi ? 'range-cell--highlight' : '',
                ].filter(Boolean).join(' ')}
                title={key}
              >
                {key.replace(/[so]$/, '')}
              </div>
            );
          })
        )}
      </div>
      <div className="range-legend">
        <span className="legend-item legend-item--raise">Raise</span>
        <span className="legend-item legend-item--mixed-rf">Mixed R/F</span>
        <span className="legend-item legend-item--mixed-rc">Mixed R/C</span>
        <span className="legend-item legend-item--call">Call</span>
        <span className="legend-item legend-item--fold">Fold</span>
      </div>
    </div>
  );
}
