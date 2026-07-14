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
const opponentLabel = document.getElementById('opponent-label');
const opponentStatus = document.getElementById('opponent-status');

const modeSelect = document.getElementById('mode-select');
const waitingPanel = document.getElementById('waiting-panel');
const gameSection = document.getElementById('game-section');
const modeBotBtn = document.getElementById('mode-bot-btn');
const modeMultiplayerBtn = document.getElementById('mode-multiplayer-btn');
const cancelQueueBtn = document.getElementById('cancel-queue-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const rematchBtn = document.getElementById('rematch-btn');

let mode = null; // 'bot' | 'multiplayer'
let busy = false;
let ws = null;
let currentMatchId = null;
let revealResolve = null;

function renderStats(stats) {
  if (!stats) return;
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

function resetArena() {
  playerHand.textContent = '❔';
  computerHand.textContent = '❔';
  playerHand.classList.remove('shake');
  computerHand.classList.remove('shake');
  centerDisplay.textContent = 'VS';
  resultText.textContent = '';
  resultText.className = 'result';
  opponentStatus.textContent = '';
  rematchBtn.classList.add('hidden');
  setChoicesDisabled(false);
}

function showPanel(panel) {
  [modeSelect, waitingPanel, gameSection].forEach((p) => p.classList.add('hidden'));
  panel.classList.remove('hidden');
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

/* ---------------- Bot mode ---------------- */

async function playBotRound(choice) {
  if (busy) return;
  busy = true;
  setChoicesDisabled(true);
  resultText.textContent = '';
  resultText.className = 'result';

  playerHand.textContent = ICONS[choice];
  computerHand.textContent = '❔';
  playerHand.classList.add('shake');
  computerHand.classList.add('shake');

  const playResultPromise = fetch('/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ choice })
  }).then((res) => res.json());

  await runCountdown();

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
    showResult(data.result, data.stats);
  }

  centerDisplay.textContent = 'VS';
  setChoicesDisabled(false);
  busy = false;
}

/* ---------------- Shared countdown / result ---------------- */

async function runCountdown() {
  for (const n of ['3', '2', '1']) {
    centerDisplay.textContent = n;
    await sleep(700);
  }
  centerDisplay.textContent = '✨';
}

function showResult(result, stats) {
  const labels = {
    gewonnen: ['Du hast gewonnen! 🎉', 'win'],
    verloren: ['Du hast verloren.', 'lose'],
    unentschieden: ['Unentschieden.', 'draw']
  };
  const [label, cls] = labels[result];
  resultText.textContent = label;
  resultText.classList.add(cls);
  renderStats(stats);
}

/* ---------------- Multiplayer mode ---------------- */

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    handleWsMessage(msg);
  });

  ws.addEventListener('close', () => {
    if (mode === 'multiplayer') {
      opponentStatus.textContent = 'Verbindung verloren.';
    }
  });
}

function wsSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function joinQueue() {
  mode = 'multiplayer';
  currentMatchId = null;
  resetArena();
  showPanel(waitingPanel);
  connectWebSocket();
  if (ws.readyState === WebSocket.OPEN) {
    wsSend({ type: 'join_queue' });
  } else {
    ws.addEventListener('open', () => wsSend({ type: 'join_queue' }), { once: true });
  }
}

function handleWsMessage(msg) {
  if (msg.type === 'match_found') {
    currentMatchId = msg.matchId;
    resetArena();
    opponentLabel.textContent = msg.opponent;
    showPanel(gameSection);
    return;
  }

  if (msg.type === 'opponent_locked_in') {
    opponentStatus.textContent = 'Gegner hat gewählt – jetzt bist du dran!';
    return;
  }

  if (msg.type === 'start_countdown') {
    if (msg.matchId !== currentMatchId) return;
    runMultiplayerReveal();
    return;
  }

  if (msg.type === 'reveal') {
    if (msg.matchId !== currentMatchId) return;
    if (revealResolve) {
      revealResolve(msg);
      revealResolve = null;
    }
    return;
  }

  if (msg.type === 'opponent_left') {
    if (msg.matchId !== currentMatchId) return;
    opponentStatus.textContent = 'Dein Gegner hat das Spiel verlassen.';
    setChoicesDisabled(true);
    currentMatchId = null;
    rematchBtn.classList.remove('hidden');
    busy = false;
  }
}

function waitForReveal() {
  return new Promise((resolve) => { revealResolve = resolve; });
}

async function runMultiplayerReveal() {
  opponentStatus.textContent = '';
  computerHand.textContent = '❔';
  playerHand.classList.add('shake');
  computerHand.classList.add('shake');

  const revealPromise = waitForReveal();
  await runCountdown();
  const data = await revealPromise;

  playerHand.classList.remove('shake');
  computerHand.classList.remove('shake');

  computerHand.textContent = ICONS[data.opponentChoice];
  showResult(data.result, data.stats);

  centerDisplay.textContent = 'VS';
  setChoicesDisabled(true);
  rematchBtn.classList.remove('hidden');
  busy = false;
  currentMatchId = null;
}

function playMultiplayerRound(choice) {
  if (busy || !currentMatchId) return;
  busy = true;
  setChoicesDisabled(true);
  resultText.textContent = '';
  resultText.className = 'result';
  playerHand.textContent = ICONS[choice];
  opponentStatus.textContent = 'Warte auf Gegner…';

  wsSend({ type: 'choice', matchId: currentMatchId, choice });
}

/* ---------------- Wiring ---------------- */

choiceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice;
    if (mode === 'bot') playBotRound(choice);
    else if (mode === 'multiplayer') playMultiplayerRound(choice);
  });
});

modeBotBtn.addEventListener('click', () => {
  mode = 'bot';
  opponentLabel.textContent = 'Bot';
  resetArena();
  showPanel(gameSection);
});

modeMultiplayerBtn.addEventListener('click', joinQueue);

cancelQueueBtn.addEventListener('click', () => {
  wsSend({ type: 'leave_queue' });
  mode = null;
  showPanel(modeSelect);
});

backToMenuBtn.addEventListener('click', () => {
  if (mode === 'multiplayer' && currentMatchId) {
    wsSend({ type: 'leave_match', matchId: currentMatchId });
  }
  if (mode === 'multiplayer') {
    wsSend({ type: 'leave_queue' });
  }
  mode = null;
  currentMatchId = null;
  busy = false;
  showPanel(modeSelect);
});

rematchBtn.addEventListener('click', joinQueue);

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

loadMe();
