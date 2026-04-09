export default function Card({ card, faceDown = false, large = false, xlarge = false }) {
  const cls = `card${xlarge ? ' card--xlarge' : large ? ' card--large' : ''}`;

  if (faceDown || !card) {
    return <div className={`${cls} card--back`}><span>🂠</span></div>;
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  return (
    <div className={`${cls} ${isRed ? 'card--red' : 'card--black'}`}>
      <span className="card-rank">{card.rank}</span>
      <span className="card-suit">{card.suit}</span>
    </div>
  );
}
