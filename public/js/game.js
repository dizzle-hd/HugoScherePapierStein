const ICONS = { stein: '🪨', papier: '📄', schere: '✂️' };

const usernameEl = document.getElementById('current-username');
const statWins = document.getElementById('stat-wins');
const statDraws = document.getElementById('stat-draws');
const statLosses = document.getElementById('stat-losses');
const playerHand = document.getElementById('player-hand');
const computerHand = document.getElementById('computer-hand');
const centerDisplay = document.getElementById('center-display');
const resultText = document.getElementById('result-text');
const choiceButtons = document.querySelectorAll('.choice-btn');

let busy = false;

function renderStats(stats) {
  statWins.textContent = stats.wins;
  statDraws.textContent = stats.draws;
  statLosses.textContent = stats.losses;
}

function setChoicesDisabled(disabled) {
  choiceButtons.forEach((btn) => { btn.disabled = disabled; });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadMe() {
  const res = await fetch('/api/me');
  if (!res.ok) {
    window.location.href = 'index.html';
    return;
  }
  const data = await res.json();
  usernameEl.textContent = data.username;
  renderStats(data.stats);
}

async function playRound(choice) {
  if (busy) return;
  busy = true;
  setChoicesDisabled(true);
  resultText.textContent = '';
  resultText.className = 'result';

  playerHand.textContent = ICONS[choice];
  computerHand.textContent = '❔';
  playerHand.classList.add('shake');
  computerHand.classList.add('shake');

  let playResultPromise = fetch('/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice })
  }).then((res) => res.json());

  for (const n of ['3', '2', '1']) {
    centerDisplay.textContent = n;
    await sleep(700);
  }
  centerDisplay.textContent = '✨';

  const data = await playResultPromise;

  playerHand.classList.remove('shake');
  computerHand.classList.remove('shake');

  if (data.error) {
    resultText.textContent = data.error;
    if (data.error.includes('Nicht angemeldet')) {
      window.location.href = 'index.html';
      return;
    }
  } else {
    computerHand.textContent = ICONS[data.computerChoice];

    const labels = {
      gewonnen: ['Du hast gewonnen! 🎉', 'win'],
      verloren: ['Du hast verloren.', 'lose'],
      unentschieden: ['Unentschieden.', 'draw']
    };
    const [label, cls] = labels[data.result];
    resultText.textContent = label;
    resultText.classList.add(cls);
    renderStats(data.stats);
  }

  centerDisplay.textContent = 'VS';
  setChoicesDisabled(false);
  busy = false;
}

choiceButtons.forEach((btn) => {
  btn.addEventListener('click', () => playRound(btn.dataset.choice));
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

loadMe();
