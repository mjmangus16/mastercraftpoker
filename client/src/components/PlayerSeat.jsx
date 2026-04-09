import Card from './Card';

export default function PlayerSeat({ player, isCurrent, showdownWinner, inShowdown, handName, winAmount, revealBots }) {
  const { name, chips, currentBet, folded, allIn, isHuman, isDealer, isSB, isBB, position, styleLabel, holeCards, eliminated } = player;

  let statusTag = null;
  if (showdownWinner)   statusTag = <span className="tag tag--winner">WINNER</span>;
  else if (eliminated)  statusTag = <span className="tag tag--out">OUT</span>;
  else if (folded)      statusTag = <span className="tag tag--fold">FOLD</span>;
  else if (allIn)       statusTag = <span className="tag tag--allin">ALL-IN</span>;
  else if (isCurrent && !inShowdown) statusTag = <span className="tag tag--acting">ACTING</span>;

  const badges = [];
  if (isDealer) badges.push(<span key="d" className="badge badge--dealer">D</span>);

  let seatClass = 'seat';
  if (isHuman)                    seatClass += ' seat--human';
  if (isCurrent && !inShowdown)   seatClass += ' seat--current';
  if (showdownWinner)             seatClass += ' seat--winner';
  if (folded || eliminated) seatClass += ' seat--inactive';

  return (
    <div className={seatClass}>
      {isCurrent && !isHuman && !inShowdown && (
        <div className="thinking-dots">
          <span /><span /><span />
        </div>
      )}
      <div className="seat-header">
        <span className="seat-name">{name}</span>
        {badges}
        {statusTag}
      </div>
      {position && !eliminated && (
        <div className="seat-position" data-pos={position}>{position}</div>
      )}

      {styleLabel && !isHuman && (
        <div className="seat-style">{styleLabel}</div>
      )}

      <div className="seat-cards">
        {holeCards.length > 0
          ? holeCards.map((card, i) => (
              <Card
                key={i}
                card={card}
                faceDown={card === null || (!isHuman && !revealBots && !inShowdown)}
                xlarge={showdownWinner}
                large={!showdownWinner && (isHuman || inShowdown || revealBots)}
              />
            ))
          : <div className="seat-cards-empty" />
        }
      </div>

      {handName && (
        <div className="seat-hand-name">{handName}</div>
      )}

      <div className="seat-chips">
        <span className="chip-count">${chips.toLocaleString()}</span>
        {winAmount != null && <span className="seat-win-amount">+${winAmount.toLocaleString()}</span>}
        {!winAmount && currentBet > 0 && <span className="current-bet">bet ${currentBet}</span>}
      </div>
    </div>
  );
}
