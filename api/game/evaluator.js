const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'
];

// Evaluate a 5-card hand. Returns a score array for comparison: [rank, ...tiebreakers]
function evaluate5(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = values[0];
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
  }
  // Ace-low straight: A-2-3-4-5
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => [parseInt(v), c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const freq = groups.map(g => g[1]);
  const groupVals = groups.map(g => g[0]);

  if (isFlush && isStraight) return [8, straightHigh];
  if (freq[0] === 4)          return [7, ...groupVals];
  if (freq[0] === 3 && freq[1] === 2) return [6, ...groupVals];
  if (isFlush)                return [5, ...values];
  if (isStraight)             return [4, straightHigh];
  if (freq[0] === 3)          return [3, ...groupVals];
  if (freq[0] === 2 && freq[1] === 2) return [2, ...groupVals];
  if (freq[0] === 2)          return [1, ...groupVals];
  return [0, ...values];
}

function compareScores(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k),
  ];
}

// Find best 5-card hand from 5-7 cards
function bestHand(cards) {
  let best = null;
  for (const combo of combinations(cards, 5)) {
    const score = evaluate5(combo);
    if (!best || compareScores(score, best.score) > 0) {
      best = { score, cards: combo };
    }
  }
  return best;
}

function handName(score) {
  return HAND_NAMES[score[0]];
}

module.exports = { bestHand, compareScores, handName };
