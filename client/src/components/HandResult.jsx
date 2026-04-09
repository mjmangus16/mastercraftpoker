export default function HandResult({ handResult, onNextHand, gameOver, gameWinner, loading }) {
  if (!handResult && !gameOver) return null;

  if (gameOver) {
    return (
      <div className="overlay">
        <div className="modal modal--gameover">
          <div className="modal-title">🏆 Game Over</div>
          <p className="modal-subtitle">
            {gameWinner === 'You' ? 'You win the tournament!' : `${gameWinner} wins the tournament!`}
          </p>
          <button className="btn btn--call" onClick={onNextHand} disabled={loading}>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // Showdown is displayed on the table itself — no modal needed
  if (handResult.type === 'showdown') return null;

  const winner = handResult.winners?.[0];

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-title">Hand Over</div>
        <p className="modal-subtitle">
          <strong>{winner?.name}</strong> wins ${winner?.amount} — everyone else folded
        </p>
        <button className="btn btn--call" onClick={onNextHand} disabled={loading}>
          Next Hand
        </button>
      </div>
    </div>
  );
}
