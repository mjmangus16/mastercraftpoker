import { useRef, useEffect } from 'react';

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

function cellKey(i, j) {
  if (i === j) return RANKS[i] + RANKS[j];        // pair
  if (i < j)  return RANKS[i] + RANKS[j] + 's';   // suited (upper-right)
  return RANKS[j] + RANKS[i] + 'o';               // offsuit (lower-left)
}

function cellColor(action) {
  if (!action) return null;
  const arr = Array.isArray(action) ? action : [action];
  const hasRaise = arr.includes('raise') || arr.includes('allin');
  const hasCall  = arr.includes('call');
  const hasFold  = arr.includes('fold');
  if (hasRaise && hasFold && !hasCall) return 'mixed-rf';
  if (hasRaise && hasCall)             return 'mixed-rc';
  if (hasRaise)  return 'raise';
  if (hasCall)   return 'call';
  return null;
}

function normAction(v) {
  if (v == null) return 'fold';
  if (Array.isArray(v)) return [...v].sort().join(',');
  return v;
}

// onPaintCell(hand) — paint mode (drag to paint multiple cells)
// onSelectHand(hand) — select mode (click only, for Hand Lookup)
// baseChart — GTO chart for diff dot comparison
export default function HandRangeChart({ chart, highlightHand, onSelectHand, onPaintCell, baseChart }) {
  const dragging = useRef(false);

  useEffect(() => {
    if (!onPaintCell) return;
    const stop = () => { dragging.current = false; };
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchend', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchend', stop);
    };
  }, [onPaintCell]);

  return (
    <div className="range-chart">
      <div className="range-grid-wrap">
        <span className="range-so-label range-so-suited">suited ↗</span>
        <div
          className="range-grid"
          style={onPaintCell ? { userSelect: 'none', WebkitUserSelect: 'none' } : undefined}
        >
          {RANKS.map((_, i) =>
            RANKS.map((_, j) => {
              const key    = cellKey(i, j);
              const color  = cellColor(chart[key]);
              const hi     = key === highlightHand;
              const isDiff = baseChart !== undefined &&
                normAction(chart?.[key]) !== normAction(baseChart?.[key]);
              return (
                <div
                  key={key}
                  className={[
                    'range-cell',
                    color ? `range-cell--${color}` : '',
                    hi        ? 'range-cell--highlight'  : '',
                    isDiff    ? 'range-cell--diff'       : '',
                    onSelectHand ? 'range-cell--clickable'  : '',
                    onPaintCell  ? 'range-cell--paintable'  : '',
                  ].filter(Boolean).join(' ')}
                  title={key}
                  onMouseDown={onPaintCell ? (e) => {
                    e.preventDefault();
                    dragging.current = true;
                    onPaintCell(key);
                  } : undefined}
                  onMouseEnter={onPaintCell ? () => {
                    if (dragging.current) onPaintCell(key);
                  } : undefined}
                  onClick={onSelectHand ? () => onSelectHand(key) : undefined}
                >
                  {key.replace(/[so]$/, '')}
                </div>
              );
            })
          )}
        </div>
        <span className="range-so-label range-so-offsuit">↙ offsuit</span>
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
