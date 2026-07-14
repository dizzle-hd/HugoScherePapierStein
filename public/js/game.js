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
const modeJoinCodeBtn = document.getElementById('mode-join-code-btn');
const modeHostBtn = document.getElementById('mode-host-btn');
const cancelQueueBtn = document.getElementById('cancel-queue-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');
const rematchBtn = document.getElementById('rematch-btn');

const joinCodePanel = document.getElementById('join-code-panel');
const joinCodeInput = document.getElementById('join-code-input');
const joinCodeBtn = document.getElementById('join-code-btn');
const joinCodeMessage = document.getElementById('join-code-message');
const joinCodeBackBtn = document.getElementById('join-code-back-btn');

const hostSetupPanel = document.getElementById('host-setup-panel');
const hostTargetScoreInput = document.getElementById('host-target-score');
const stakeTypeButtons = document.querySelectorAll('.stake-type-btn');
const stakeMoneyFields = document.getElementById('stake-money-fields');
const stakeItemFields = document.getElementById('stake-item-fields');
const stakeAmountInput = document.getElementById('stake-amount');
const itemSearchInput = document.getElementById('item-search');
const itemSearchResults = document.getElementById('item-search-results');
const selectedItemDisplay = document.getElementById('selected-item-display');
const selectedItemName = document.getElementById('selected-item-name');
const clearSelectedItemBtn = document.getElementById('clear-selected-item-btn');
const stakeCustomLabelInput = document.getElementById('stake-custom-label');
const stakeQuantityInput = document.getElementById('stake-quantity');
const createHostMatchBtn = document.getElementById('create-host-match-btn');
const hostSetupMessage = document.getElementById('host-setup-message');
const hostSetupBackBtn = document.getElementById('host-setup-back-btn');

const hostedMatchSection = document.getElementById('hosted-match-section');
const hostedCodeBanner = document.getElementById('hosted-code-banner');
const hostedCodeDisplay = document.getElementById('hosted-code-display');
const copyJoinLinkBtn = document.getElementById('copy-join-link-btn');
const hostedStakeBanner = document.getElementById('hosted-stake-banner');
const hostedScoreBar = document.getElementById('hosted-score-bar');
const hostedStatusText = document.getElementById('hosted-status-text');
const hostedLabelA = document.getElementById('hosted-label-a');
const hostedLabelB = document.getElementById('hosted-label-b');
const hostedHandA = document.getElementById('hosted-hand-a');
const hostedHandB = document.getElementById('hosted-hand-b');
const hostedCenterDisplay = document.getElementById('hosted-center-display');
const hostedResultText = document.getElementById('hosted-result-text');
const hostedChoicesSection = document.getElementById('hosted-choices');
const hostedChoiceButtons = document.querySelectorAll('.hosted-choice-btn');
const hostedCloseBtn = document.getElementById('hosted-close-btn');
const hostedBackBtn = document.getElementById('hosted-back-btn');

const ALL_PANELS = [modeSelect, waitingPanel, gameSection, joinCodePanel, hostSetupPanel, hostedMatchSection];

let mode = null; // 'bot' | 'multiplayer' | 'join-code' | 'host-setup' | 'hosted'
let busy = false;
let ws = null;
let currentMatchId = null;
let revealResolve = null;

let myUsername = null;
let myId = null;
let amIAdmin = false;
let amIGuest = false;
let mcItems = [];
let selectedItem = null;
let stakeType = 'money';
let awaitingHostedEntry = false;
let hostedMatchId = null;
let hostedState = null;
let hostedRevealResolve = null;
let hostedMyPendingChoice = null;

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
  ALL_PANELS.forEach((p) => p.classList.add('hidden'));
  panel.classList.remove('hidden');
}

function backToStart() {
  if (amIGuest) {
    fetch('/api/logout', { method: 'POST' }).then(() => { window.location.href = 'index.html'; });
    return;
  }
  mode = null;
  showPanel(modeSelect);
}

async function loadMe() {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');

  const res = await fetch('/api/me');
  if (!res.ok) {
    window.location.href = 'index.html' + (joinCode ? `?join=${joinCode}` : '');
    return;
  }
  const data = await res.json();
  myUsername = data.username;
  myId = data.id;
  amIAdmin = Boolean(data.isAdmin);
  amIGuest = Boolean(data.isGuest);
  usernameEl.textContent = data.username;
  renderStats(data.stats);

  if (amIGuest) {
    document.querySelector('.stats').classList.add('hidden');
    if (!joinCode) {
      backToStart();
      return;
    }
  }

  if (amIAdmin) {
    modeHostBtn.classList.remove('hidden');
  }

  if (joinCode) {
    attemptAutoJoin(joinCode.trim().toUpperCase());
  }
}

async function loadMinecraftItems() {
  try {
    const res = await fetch('data/minecraft-items.json');
    mcItems = await res.json();
  } catch {
    mcItems = [];
  }
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

  await runCountdown(centerDisplay);

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

async function runCountdown(centerEl) {
  for (const n of ['3', '2', '1']) {
    centerEl.textContent = n;
    await sleep(700);
  }
  centerEl.textContent = '✨';
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

/* ---------------- WebSocket plumbing (shared) ---------------- */

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
    } else if (mode === 'hosted') {
      hostedStatusText.textContent = 'Verbindung verloren.';
    }
  });
}

function wsSend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function wsSendWhenOpen(payload) {
  connectWebSocket();
  if (ws.readyState === WebSocket.OPEN) {
    wsSend(payload);
  } else {
    ws.addEventListener('open', () => wsSend(payload), { once: true });
  }
}

function handleWsMessage(msg) {
  if (msg.type === 'match_found' || msg.type === 'opponent_locked_in' || msg.type === 'start_countdown' ||
      msg.type === 'reveal' || msg.type === 'opponent_left') {
    handleCasualMultiplayerMessage(msg);
    return;
  }

  if (msg.type === 'hosted_state') {
    onHostedState(msg);
    return;
  }

  if (msg.type === 'hosted_error') {
    handleHostedError(msg);
    return;
  }

  if (msg.type === 'hosted_closed') {
    handleHostedClosed(msg);
    return;
  }
}

/* ---------------- Casual multiplayer mode ---------------- */

function joinQueue() {
  mode = 'multiplayer';
  currentMatchId = null;
  resetArena();
  showPanel(waitingPanel);
  wsSendWhenOpen({ type: 'join_queue' });
}

function handleCasualMultiplayerMessage(msg) {
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
  await runCountdown(centerDisplay);
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

/* ---------------- Hosted matches (admin-run, code, stakes) ---------------- */

function describeStake(stake) {
  if (!stake) return '';
  if (stake.type === 'money') {
    return `${stake.amount.toFixed(2)} €`;
  }
  const label = stake.customLabel ? `${stake.itemName} (${stake.customLabel})` : stake.itemName;
  return `${stake.quantity}x ${label}`;
}

function renderHostedStakeBanner(state) {
  hostedStakeBanner.textContent = `🎯 Ziel: ${state.targetScore} Punkte  •  Einsatz: ${describeStake(state.stake)}`;
}

function buildScoreBlock(player, side) {
  const wrap = document.createElement('div');
  const nameEl = document.createElement('span');
  nameEl.className = 'score-name';
  nameEl.textContent = player ? (player.name + (player.id === myId ? ' (Du)' : '')) : 'Warte…';
  const valueEl = document.createElement('span');
  valueEl.className = 'score-value';
  valueEl.textContent = String(player ? player.score : 0);
  if (side === 'left') {
    wrap.appendChild(nameEl);
    wrap.appendChild(valueEl);
  } else {
    wrap.appendChild(valueEl);
    wrap.appendChild(nameEl);
  }
  return wrap;
}

function renderHostedScoreboard(state) {
  hostedScoreBar.textContent = '';
  const [a, b] = state.players;
  hostedScoreBar.appendChild(buildScoreBlock(a, 'left'));
  const sep = document.createElement('span');
  sep.className = 'score-sep';
  sep.textContent = ':';
  hostedScoreBar.appendChild(sep);
  hostedScoreBar.appendChild(buildScoreBlock(b, 'right'));
}

function hostedNameOf(state, id) {
  const player = state.players.find((p) => p.id === id);
  return player ? player.name : id;
}

function renderHostedLabels(state) {
  const [a, b] = state.players;
  hostedLabelA.textContent = a ? (a.name + (a.id === myId ? ' (Du)' : '')) : 'Warte auf Spieler…';
  hostedLabelB.textContent = b ? (b.name + (b.id === myId ? ' (Du)' : '')) : 'Warte auf Spieler…';
}

function renderHostedButtons(state) {
  const isPlayer = state.role === 'player';
  const me = state.players.find((p) => p.id === myId);
  const canChoose = isPlayer && state.status === 'ready' && me && !me.locked;
  hostedChoicesSection.classList.toggle('hidden', !isPlayer);
  hostedChoiceButtons.forEach((btn) => { btn.disabled = !canChoose; });
  hostedCloseBtn.classList.toggle('hidden', state.role !== 'host');
}

function renderHostedStatusLine(state) {
  if (state.abortedBy) return;
  if (state.status === 'waiting') {
    hostedStatusText.textContent = `Warte auf Spieler… (${state.players.length}/2 beigetreten)`;
    return;
  }
  if (state.status === 'ready' && state.role === 'player') {
    const me = state.players.find((p) => p.id === myId);
    hostedStatusText.textContent = me && me.locked ? 'Du hast gewählt – warte auf Gegner…' : '';
    return;
  }
  hostedStatusText.textContent = '';
}

function renderHostedHandsPreReveal(state) {
  const [a, b] = state.players;
  hostedHandA.textContent = (a && a.id === myId && hostedMyPendingChoice) ? ICONS[hostedMyPendingChoice] : '❔';
  hostedHandB.textContent = (b && b.id === myId && hostedMyPendingChoice) ? ICONS[hostedMyPendingChoice] : '❔';
}

function renderHostedReveal(state) {
  const [a, b] = state.players;
  const choices = state.lastRound.choices;
  hostedHandA.textContent = a && choices[a.id] ? ICONS[choices[a.id]] : '❔';
  hostedHandB.textContent = b && choices[b.id] ? ICONS[choices[b.id]] : '❔';

  let text;
  let cls = 'result';
  if (!state.lastRound.winner) {
    text = 'Unentschieden – nächste Runde!';
    cls += ' draw';
  } else if (state.role === 'player') {
    const iWon = state.lastRound.winner === myId;
    text = iWon ? 'Du gewinnst die Runde! 🎉' : 'Du verlierst die Runde.';
    cls += iWon ? ' win' : ' lose';
  } else {
    text = `${hostedNameOf(state, state.lastRound.winner)} gewinnt die Runde!`;
    cls += ' win';
  }
  hostedResultText.textContent = text;
  hostedResultText.className = cls;
}

function renderHostedFinal(state) {
  hostedChoicesSection.classList.add('hidden');
  let text;
  let cls = 'result';

  if (state.abortedBy) {
    const abortedByMe = state.abortedBy === myId;
    if (state.winner) {
      text = abortedByMe
        ? 'Du hast das Match verlassen – Niederlage durch Aufgabe.'
        : `${hostedNameOf(state, state.abortedBy)} hat das Match verlassen – ${hostedNameOf(state, state.winner)} gewinnt durch Aufgabe!`;
      cls += abortedByMe ? ' lose' : ' win';
    } else {
      text = 'Das Match wurde abgebrochen.';
    }
  } else if (state.winner) {
    const stakeText = describeStake(state.stake);
    if (state.role === 'player') {
      const iWon = state.winner === myId;
      text = iWon
        ? `🎉 Du hast das Match gewonnen! Einsatz: ${stakeText}`
        : `Du hast das Match verloren. Einsatz an ${hostedNameOf(state, state.winner)}: ${stakeText}`;
      cls += iWon ? ' win' : ' lose';
    } else {
      text = `🏆 ${hostedNameOf(state, state.winner)} gewinnt das Match! Einsatz: ${stakeText}`;
      cls += ' win';
    }
  }

  hostedResultText.textContent = text;
  hostedResultText.className = cls;
  hostedStatusText.textContent = '';
}

async function runHostedCountdown(state) {
  renderHostedHandsPreReveal(state);
  hostedHandA.classList.add('shake');
  hostedHandB.classList.add('shake');

  const revealPromise = new Promise((resolve) => { hostedRevealResolve = resolve; });
  await runCountdown(hostedCenterDisplay);
  const finalState = await revealPromise;

  hostedHandA.classList.remove('shake');
  hostedHandB.classList.remove('shake');
  hostedCenterDisplay.textContent = 'VS';
  hostedMyPendingChoice = null;

  renderHostedScoreboard(finalState);
  renderHostedLabels(finalState);
  renderHostedButtons(finalState);
  renderHostedStatusLine(finalState);

  if (finalState.abortedBy) {
    renderHostedFinal(finalState);
    return;
  }
  if (finalState.lastRound) {
    renderHostedReveal(finalState);
  }
  if (finalState.status === 'finished') {
    renderHostedFinal(finalState);
  }
}

function onHostedState(state) {
  const prevStatus = hostedState ? hostedState.status : null;
  const enteringCountdown = state.status === 'countdown' && prevStatus !== 'countdown';
  hostedState = state;
  hostedMatchId = state.matchId;

  if (awaitingHostedEntry) {
    awaitingHostedEntry = false;
    mode = 'hosted';
    showPanel(hostedMatchSection);
    hostedCodeBanner.classList.toggle('hidden', state.role !== 'host');
    hostedCodeDisplay.textContent = state.code;
  }

  renderHostedStakeBanner(state);

  if (hostedRevealResolve) {
    if (state.status !== 'countdown') {
      const resolve = hostedRevealResolve;
      hostedRevealResolve = null;
      resolve(state);
    }
    return;
  }

  renderHostedScoreboard(state);
  renderHostedLabels(state);
  renderHostedButtons(state);
  renderHostedStatusLine(state);

  if (state.abortedBy) {
    renderHostedFinal(state);
    return;
  }

  if (enteringCountdown) {
    runHostedCountdown(state);
    return;
  }

  if (state.lastRound) {
    renderHostedReveal(state);
  }
  if (state.status === 'finished') {
    renderHostedFinal(state);
  }
}

function handleHostedError(msg) {
  awaitingHostedEntry = false;
  if (mode === 'host-setup') {
    hostSetupMessage.textContent = msg.message;
  } else if (mode === 'join-code') {
    joinCodeMessage.textContent = msg.message;
  }
}

function handleHostedClosed(msg) {
  if (hostedMatchId !== msg.matchId) return;
  hostedChoicesSection.classList.add('hidden');
  hostedResultText.textContent = 'Match wurde vom Host geschlossen.';
  hostedResultText.className = 'result lose';
  hostedCloseBtn.classList.add('hidden');
  setTimeout(() => {
    hostedMatchId = null;
    hostedState = null;
    backToStart();
  }, 2000);
}

function attemptAutoJoin(code) {
  mode = 'join-code';
  joinCodeInput.value = code;
  joinCodeMessage.textContent = '';
  showPanel(joinCodePanel);
  awaitingHostedEntry = true;
  wsSendWhenOpen({ type: 'join_hosted_match', code });
}

/* ---------------- Minecraft item search ---------------- */

function renderItemSearchResults(query) {
  itemSearchResults.textContent = '';
  if (!query) {
    itemSearchResults.classList.add('hidden');
    return;
  }
  const q = query.toLowerCase();
  const matches = mcItems.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 8);
  if (matches.length === 0) {
    itemSearchResults.classList.add('hidden');
    return;
  }
  matches.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.name;
    btn.addEventListener('click', () => selectItem(item));
    itemSearchResults.appendChild(btn);
  });
  itemSearchResults.classList.remove('hidden');
}

function selectItem(item) {
  selectedItem = item;
  selectedItemName.textContent = item.name;
  selectedItemDisplay.classList.remove('hidden');
  itemSearchInput.value = '';
  itemSearchInput.classList.add('hidden');
  itemSearchResults.classList.add('hidden');
}

function clearSelectedItem() {
  selectedItem = null;
  selectedItemDisplay.classList.add('hidden');
  itemSearchInput.classList.remove('hidden');
  itemSearchInput.value = '';
  itemSearchInput.focus();
}

/* ---------------- Wiring ---------------- */

choiceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice;
    if (mode === 'bot') playBotRound(choice);
    else if (mode === 'multiplayer') playMultiplayerRound(choice);
  });
});

hostedChoiceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice;
    if (!hostedMatchId || !hostedState) return;
    const me = hostedState.players.find((p) => p.id === myId);
    if (hostedState.role !== 'player' || hostedState.status !== 'ready' || !me || me.locked) return;

    hostedMyPendingChoice = choice;
    const [a, b] = hostedState.players;
    if (a && a.id === myId) hostedHandA.textContent = ICONS[choice];
    if (b && b.id === myId) hostedHandB.textContent = ICONS[choice];
    hostedStatusText.textContent = 'Du hast gewählt – warte auf Gegner…';
    hostedChoiceButtons.forEach((b2) => { b2.disabled = true; });

    wsSend({ type: 'hosted_choice', matchId: hostedMatchId, choice });
  });
});

modeBotBtn.addEventListener('click', () => {
  mode = 'bot';
  opponentLabel.textContent = 'Bot';
  resetArena();
  showPanel(gameSection);
});

modeMultiplayerBtn.addEventListener('click', joinQueue);

modeJoinCodeBtn.addEventListener('click', () => {
  mode = 'join-code';
  joinCodeMessage.textContent = '';
  joinCodeInput.value = '';
  showPanel(joinCodePanel);
});

modeHostBtn.addEventListener('click', () => {
  mode = 'host-setup';
  hostSetupMessage.textContent = '';
  showPanel(hostSetupPanel);
});

cancelQueueBtn.addEventListener('click', () => {
  wsSend({ type: 'leave_queue' });
  backToStart();
});

backToMenuBtn.addEventListener('click', () => {
  if (mode === 'multiplayer' && currentMatchId) {
    wsSend({ type: 'leave_match', matchId: currentMatchId });
  }
  if (mode === 'multiplayer') {
    wsSend({ type: 'leave_queue' });
  }
  currentMatchId = null;
  busy = false;
  backToStart();
});

rematchBtn.addEventListener('click', joinQueue);

joinCodeInput.addEventListener('input', () => {
  joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

joinCodeBtn.addEventListener('click', () => {
  const code = joinCodeInput.value.trim();
  if (code.length !== 6) {
    joinCodeMessage.textContent = 'Bitte einen gültigen 6-stelligen Code eingeben.';
    return;
  }
  joinCodeMessage.textContent = '';
  attemptAutoJoin(code);
});

joinCodeBackBtn.addEventListener('click', backToStart);

stakeTypeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    stakeTypeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    stakeType = btn.dataset.stakeType;
    stakeMoneyFields.classList.toggle('hidden', stakeType !== 'money');
    stakeItemFields.classList.toggle('hidden', stakeType !== 'item');
  });
});

itemSearchInput.addEventListener('input', () => {
  renderItemSearchResults(itemSearchInput.value.trim());
});

clearSelectedItemBtn.addEventListener('click', clearSelectedItem);

createHostMatchBtn.addEventListener('click', () => {
  const targetScore = parseInt(hostTargetScoreInput.value, 10);
  if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 50) {
    hostSetupMessage.textContent = 'Bitte eine gültige Punktzahl (1-50) angeben.';
    return;
  }

  let stake;
  if (stakeType === 'money') {
    const amount = parseFloat(stakeAmountInput.value);
    if (!(amount > 0)) {
      hostSetupMessage.textContent = 'Bitte einen gültigen Betrag angeben.';
      return;
    }
    stake = { type: 'money', amount };
  } else {
    if (!selectedItem) {
      hostSetupMessage.textContent = 'Bitte ein Minecraft-Item auswählen.';
      return;
    }
    const quantity = parseInt(stakeQuantityInput.value, 10) || 1;
    stake = {
      type: 'item',
      itemId: selectedItem.id,
      itemName: selectedItem.name,
      customLabel: stakeCustomLabelInput.value.trim(),
      quantity
    };
  }

  hostSetupMessage.textContent = '';
  awaitingHostedEntry = true;
  wsSendWhenOpen({ type: 'create_hosted_match', targetScore, stake });
});

hostSetupBackBtn.addEventListener('click', backToStart);

copyJoinLinkBtn.addEventListener('click', async () => {
  if (!hostedState) return;
  const url = `${window.location.origin}/game.html?join=${hostedState.code}`;
  try {
    await navigator.clipboard.writeText(url);
    const original = copyJoinLinkBtn.textContent;
    copyJoinLinkBtn.textContent = 'Kopiert!';
    setTimeout(() => { copyJoinLinkBtn.textContent = original; }, 1500);
  } catch {
    hostSetupMessage.textContent = url;
  }
});

hostedBackBtn.addEventListener('click', () => {
  if (hostedMatchId) {
    wsSend({ type: 'leave_hosted_match', matchId: hostedMatchId });
  }
  hostedMatchId = null;
  hostedState = null;
  hostedRevealResolve = null;
  hostedMyPendingChoice = null;
  backToStart();
});

hostedCloseBtn.addEventListener('click', () => {
  if (hostedMatchId) {
    wsSend({ type: 'close_hosted_match', matchId: hostedMatchId });
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

loadMe();
loadMinecraftItems();
