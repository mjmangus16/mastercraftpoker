import { useState } from 'react';

export default function ActionBar({ validActions, gtoHint, onAction, loading, bigBlind, pot, phase, humanCurrentBet = 0 }) {
  const [raiseAmount, setRaiseAmount] = useState('');
  const [bbMultiplier, setBbMultiplier] = useState(2);

  const isActive = !!validActions;
  const { actions = [], toCall = 0, minRaise = 1, chips = 0 } = validActions || {};
  const maxRaise = chips > toCall ? chips - toCall : 1;
  const canRaise = actions.includes('raise');
  const canCall  = actions.includes('call');
  const canCheck = actions.includes('check');

  const hint     = new Set(gtoHint ?? []);
  const gtoRaise = hint.has('raise') || hint.has('allin');
  const gtoCall  = hint.has('call');
  const gtoCheck = hint.has('call') || hint.has('check');
  const gtoFold  = hint.has('fold');

  const raiseVal     = parseInt(raiseAmount) || minRaise;
  const clampedRaise = Math.max(minRaise, Math.min(raiseVal, maxRaise));
  // Total chips this player will have bet this street (already in + call + raise)
  const raiseTo      = humanCurrentBet + toCall + clampedRaise;
  // If checking is available, this is an opening bet, not a raise
  const isBet        = isActive && canCheck;

  function clamp(n) { return Math.max(minRaise, Math.min(Math.round(n), maxRaise)); }
  function raiseToTotal(raiseBy) { return humanCurrentBet + toCall + raiseBy; }

  function submit(action, rb) {
    setRaiseAmount('');
    onAction(action, rb);
  }

  // BB stepper: always visible when there's a big blind defined
  const showBbStepper = !!bigBlind;
  const bbRaiseValue = bigBlind ? clamp(bbMultiplier * bigBlind - humanCurrentBet - toCall) : minRaise;

  function adjustBbMulti(delta) {
    const newMulti = Math.max(2, bbMultiplier + delta);
    setBbMultiplier(newMulti);
    if (bigBlind) {
      setRaiseAmount(String(clamp(newMulti * bigBlind - humanCurrentBet - toCall)));
    }
  }

  // Pot-fraction buttons
  const potButtons = pot
    ? [
        { label: '⅓ Pot', value: clamp(pot / 3) },
        { label: '½ Pot', value: clamp(pot / 2) },
        { label: 'Pot',   value: clamp(pot) },
      ]
    : [];

  const showCheck = isActive && canCheck;
  const showCall  = isActive && canCall;

  return (
    <div className="action-bar">
      {/* Raise sizing panel — always visible, disabled when can't act */}
      <div className="raise-panel">
        <div className="raise-quick-row">
          {showBbStepper && (
            <>
              <div className="bb-stepper">
                <button
                  className="raise-quick-btn raise-quick-btn--stepper-dec"
                  onClick={() => adjustBbMulti(-1)}
                  disabled={loading || !isActive || !canRaise || bbMultiplier <= 2}
                >−</button>
                <button
                  className="raise-quick-btn raise-quick-btn--stepper-label"
                  onClick={() => setRaiseAmount(String(bbRaiseValue))}
                  disabled={loading || !isActive || !canRaise}
                >
                  {bbMultiplier}x BB
                  <span className="raise-quick-amt">${raiseToTotal(bbRaiseValue)}</span>
                </button>
                <button
                  className="raise-quick-btn raise-quick-btn--stepper-inc"
                  onClick={() => adjustBbMulti(1)}
                  disabled={loading || !isActive || !canRaise}
                >+</button>
              </div>
              <span className="raise-quick-divider" />
            </>
          )}
          {potButtons.map(b => (
            <button
              key={b.label}
              className="raise-quick-btn"
              onClick={() => setRaiseAmount(String(b.value))}
              disabled={loading || !isActive || !canRaise}
            >
              {b.label}
              <span className="raise-quick-amt">${raiseToTotal(b.value)}</span>
            </button>
          ))}
          <button
            className="raise-quick-btn raise-quick-btn--allin"
            onClick={() => setRaiseAmount(String(maxRaise))}
            disabled={loading || !isActive || !canRaise}
          >
            All In
            <span className="raise-quick-amt">${raiseToTotal(maxRaise)}</span>
          </button>
        </div>

        <div className="raise-slider-row">
          <label className="raise-label">
            {isBet ? 'Bet:' : 'Raise to:'} <strong>${raiseTo}</strong>
            <span className="raise-range"> (min ${humanCurrentBet + toCall + minRaise} · max ${humanCurrentBet + toCall + maxRaise})</span>
          </label>
          <input
            type="range"
            min={minRaise}
            max={maxRaise}
            step={1}
            value={clampedRaise}
            onChange={e => setRaiseAmount(e.target.value)}
            disabled={loading || !isActive || !canRaise}
            className="raise-slider"
          />
          <input
            type="number"
            min={humanCurrentBet + toCall + minRaise}
            max={humanCurrentBet + toCall + maxRaise}
            value={raiseAmount ? humanCurrentBet + toCall + parseInt(raiseAmount) : ''}
            onChange={e => {
              const total = parseInt(e.target.value);
              if (!isNaN(total)) setRaiseAmount(String(Math.max(0, total - humanCurrentBet - toCall)));
              else setRaiseAmount('');
            }}
            placeholder={`min $${humanCurrentBet + toCall + minRaise}`}
            disabled={loading || !isActive || !canRaise}
            className="raise-input raise-input--inline"
          />
        </div>
      </div>

      {/* Action row — always visible */}
      <div className="action-buttons">
        <div className="btn-wrap">
          <button
            className={`btn btn--fold${gtoFold ? ' btn--gto' : ''}`}
            onClick={() => submit('fold')}
            disabled={loading || !isActive}
          >
            Fold
          </button>
        </div>

        <div className="btn-wrap">
          {showCall ? (
            <button
              className={`btn btn--call${gtoCall ? ' btn--gto' : ''}`}
              onClick={() => submit('call')}
              disabled={loading}
            >
              {toCall >= chips ? `All-in $${toCall}` : `Call $${toCall}`}
            </button>
          ) : (
            <button
              className={`btn btn--check${showCheck && gtoCheck ? ' btn--gto' : ''}`}
              onClick={() => submit('check')}
              disabled={loading || !showCheck}
            >
              Check
            </button>
          )}
        </div>

        <div className="btn-wrap">
          <button
            className={`btn btn--raise${isActive && canRaise && gtoRaise ? ' btn--gto' : ''}`}
            onClick={() => submit('raise', clampedRaise)}
            disabled={loading || !isActive || !canRaise}
          >
            {isActive && canRaise ? (isBet ? `Bet $${raiseTo}` : `Raise To $${raiseTo}`) : 'Raise'}
          </button>
        </div>
      </div>
    </div>
  );
}
