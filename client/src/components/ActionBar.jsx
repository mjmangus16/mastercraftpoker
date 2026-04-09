import { useState } from 'react';

export default function ActionBar({ validActions, gtoHint, onAction, loading }) {
  const [raiseAmount, setRaiseAmount] = useState('');
  const [showRaise, setShowRaise] = useState(false);

  if (!validActions) return null;

  const { actions, toCall, minRaise, chips } = validActions;
  const maxRaise = chips - toCall;
  const canRaise = actions.includes('raise');
  const canCall  = actions.includes('call');
  const canCheck = actions.includes('check');

  // Map GTO hint actions to button categories
  const hint = new Set(gtoHint ?? []);
  const gtoRaise = hint.has('raise') || hint.has('allin');
  const gtoCall  = hint.has('call');
  const gtoCheck = hint.has('call') || hint.has('check');
  const gtoFold  = hint.has('fold');

  function submit(action, rb) {
    setShowRaise(false);
    setRaiseAmount('');
    onAction(action, rb);
  }

  function handleRaise() {
    const amt = parseInt(raiseAmount);
    if (isNaN(amt) || amt < minRaise) return;
    submit('raise', Math.min(amt, maxRaise));
  }

  const raiseVal = parseInt(raiseAmount) || minRaise;
  const clampedRaise = Math.max(minRaise, Math.min(raiseVal, maxRaise));

  return (
    <div className="action-bar">
      {showRaise && canRaise && (
        <div className="raise-panel">
          <label className="raise-label">
            Raise by: <strong>${clampedRaise}</strong>
            <span className="raise-range"> (min ${minRaise} · max ${maxRaise})</span>
          </label>
          <input
            type="range"
            min={minRaise}
            max={maxRaise}
            step={minRaise}
            value={clampedRaise}
            onChange={e => setRaiseAmount(e.target.value)}
            className="raise-slider"
          />
          <div className="raise-inputs">
            <input
              type="number"
              min={minRaise}
              max={maxRaise}
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              placeholder={`min ${minRaise}`}
              className="raise-input"
            />
            <button className="btn btn--raise" onClick={handleRaise} disabled={loading}>
              Confirm Raise
            </button>
            <button className="btn btn--secondary" onClick={() => setShowRaise(false)} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="action-buttons">
        <div className="btn-wrap">
          <button
            className="btn btn--fold"
            onClick={() => submit('fold')}
            disabled={loading}
          >
            Fold
          </button>
          {gtoFold && <span className="gto-badge">GTO</span>}
        </div>

        {canCheck && (
          <div className="btn-wrap">
            <button
              className="btn btn--check"
              onClick={() => submit('check')}
              disabled={loading}
            >
              Check
            </button>
            {gtoCheck && <span className="gto-badge">GTO</span>}
          </div>
        )}

        {canCall && (
          <div className="btn-wrap">
            <button
              className="btn btn--call"
              onClick={() => submit('call')}
              disabled={loading}
            >
              {toCall >= chips ? `All-in $${toCall}` : `Call $${toCall}`}
            </button>
            {gtoCall && <span className="gto-badge">GTO</span>}
          </div>
        )}

        {canRaise && !showRaise && (
          <div className="btn-wrap">
            <button
              className="btn btn--raise"
              onClick={() => { setRaiseAmount(String(minRaise)); setShowRaise(true); }}
              disabled={loading}
            >
              Raise
            </button>
            {gtoRaise && <span className="gto-badge">GTO</span>}
          </div>
        )}
      </div>
    </div>
  );
}
