async function request(base, path, body) {
  const opts = body !== undefined
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const res = await fetch(base + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

const game        = (path, body) => request('/api/game', path, body);
const practice    = (path, body) => request('/api/practice', path, body);
const competitive = (path, body) => request('/api/competitive', path, body);

export const api = {
  newGame: (numOpponents) => game('/new', { numOpponents }),
  newHand: () => game('/new-hand', {}),
  action: (action, raiseBy) => game('/action', { action, raiseBy }),
  botStep: () => game('/bot-step', {}),
  state: () => game('/state'),
};

export const practiceApi = {
  deal: (category) => practice('/deal', { category }),
  evaluate: (action) => practice('/evaluate', { action }),
};

export const competitiveApi = {
  leaderboard:  ()                           => competitive('/leaderboard'),
  unlocks:      (name)                       => competitive(`/unlocks/${encodeURIComponent(name)}`),
  saveScore:    (name, level, correct, total) => competitive('/score', { name, level, correct, total }),
};
