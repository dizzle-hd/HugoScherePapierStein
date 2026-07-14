const ICONS = { stein: '🪨', papier: '📄', schere: '✂️' };
const ROLE_BADGES = { Owner: '👑 Owner', Sponsor: '💎 Sponsor', Famous: '⭐ Famous' };

const usernameEl = document.getElementById('current-username');
const roleBadgeEl = document.getElementById('role-badge');
const statWins = document.getElementById('stat-wins');
const statDraws = document.getElementById('stat-draws');
const statLosses = document.getElementById('stat-losses');
const playerHand = document.getElementById('player-hand');
const computerHand = document.getElementById('computer-hand');
const centerDisplay = document.getElementById('center-display');
const resultText = document.getElementById('result-text');
const choiceButtons = document.querySelectorAll('.choice-btn');

const modeSelect = document.getElementById('mode-select');
const gameSection = document.getElementById('game-section');
const modeBotBtn = document.getElementById('mode-bot-btn');
const modeJoinCodeBtn = document.getElementById('mode-join-code-btn');
const modeHostBtn = document.getElementById('mode-host-btn');
const modeTournamentBtn = document.getElementById('mode-tournament-btn');
const backToMenuBtn = document.getElementById('back-to-menu-btn');

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
const hostedPendingPanel = document.getElementById('hosted-pending-panel');
const pendingSearchInput = document.getElementById('pending-search');
const pendingList = document.getElementById('pending-list');
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

const tournamentSetupPanel = document.getElementById('tournament-setup-panel');
const tournamentTargetScoreInput = document.getElementById('tournament-target-score');
const tournamentPrizesContainer = document.getElementById('tournament-prizes-container');
const createTournamentBtn = document.getElementById('create-tournament-btn');
const tournamentSetupMessage = document.getElementById('tournament-setup-message');
const tournamentSetupBackBtn = document.getElementById('tournament-setup-back-btn');

const tournamentSection = document.getElementById('tournament-section');
const tournamentCodeBanner = document.getElementById('tournament-code-banner');
const tournamentCodeDisplay = document.getElementById('tournament-code-display');
const tournamentCopyLinkBtn = document.getElementById('tournament-copy-link-btn');
const tournamentPendingPanel = document.getElementById('tournament-pending-panel');
const tournamentPendingSearchInput = document.getElementById('tournament-pending-search');
const tournamentPendingList = document.getElementById('tournament-pending-list');
const tournamentPrizesBanner = document.getElementById('tournament-prizes-banner');
const tournamentRosterPanel = document.getElementById('tournament-roster-panel');
const tournamentRosterCount = document.getElementById('tournament-roster-count');
const tournamentRosterList = document.getElementById('tournament-roster-list');
const startTournamentBtn = document.getElementById('start-tournament-btn');
const tournamentStatusText = document.getElementById('tournament-status-text');
const tournamentMyMatchupSection = document.getElementById('tournament-my-matchup');
const tournamentMyScoreBar = document.getElementById('tournament-my-score-bar');
const tournamentLabelA = document.getElementById('tournament-label-a');
const tournamentLabelB = document.getElementById('tournament-label-b');
const tournamentHandA = document.getElementById('tournament-hand-a');
const tournamentHandB = document.getElementById('tournament-hand-b');
const tournamentCenterDisplay = document.getElementById('tournament-center-display');
const tournamentResultText = document.getElementById('tournament-result-text');
const tournamentChoicesSection = document.getElementById('tournament-choices');
const tournamentChoiceButtons = document.querySelectorAll('.tournament-choice-btn');
const tournamentBracketEl = document.getElementById('tournament-bracket');
const tournamentStandingsEl = document.getElementById('tournament-standings');
const tournamentCloseBtn = document.getElementById('tournament-close-btn');
const tournamentBackBtn = document.getElementById('tournament-back-btn');

const ALL_PANELS = [
  modeSelect, gameSection, joinCodePanel, hostSetupPanel, hostedMatchSection,
  tournamentSetupPanel, tournamentSection
];

let mode = null; // 'bot' | 'join-code' | 'host-setup' | 'hosted' | 'tournament-setup' | 'tournament'
let busy = false;
let ws = null;

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
let hostedPaused = false;
let hostedResetTimer = null;

let awaitingTournamentEntry = false;
let tournamentCode = null;
let tournamentState = null;
let tournamentRevealResolve = null;
let tournamentMyPendingChoice = null;
let tournamentPaused = false;
let tournamentResetTimer = null;
let firstPrizePicker = null;
let secondPrizePicker = null;
let thirdPrizePicker = null;

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

  if (data.role) {
    roleBadgeEl.textContent = ROLE_BADGES[data.role] || data.role;
    roleBadgeEl.classList.remove('hidden');
  }

  if (amIGuest) {
    document.querySelector('.stats').classList.add('hidden');
    if (!joinCode) {
      backToStart();
      return;
    }
  }

  if (amIAdmin) {
    modeHostBtn.classList.remove('hidden');
    modeTournamentBtn.classList.remove('hidden');
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
  centerDisplay.textContent = 'VS';

  if (data.error) {
    resultText.textContent = data.error;
    if (data.error.includes('Nicht angemeldet')) {
      window.location.href = 'index.html';
      return;
    }
    setChoicesDisabled(false);
    busy = false;
    return;
  }

  computerHand.textContent = ICONS[data.computerChoice];
  showResult(data.result, data.stats);

  setTimeout(() => {
    playerHand.textContent = '❔';
    computerHand.textContent = '❔';
    resultText.textContent = '';
    resultText.className = 'result';
    setChoicesDisabled(false);
    busy = false;
  }, 3000);
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

function describeStake(stake) {
  if (!stake) return '';
  if (stake.type === 'money') {
    return `${stake.amount.toFixed(2)} €`;
  }
  const label = stake.customLabel ? `${stake.itemName} (${stake.customLabel})` : stake.itemName;
  return `${stake.quantity}x ${label}`;
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
    if (mode === 'hosted') {
      hostedStatusText.textContent = 'Verbindung verloren.';
    } else if (mode === 'tournament') {
      tournamentStatusText.textContent = 'Verbindung verloren.';
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
  if (msg.type === 'hosted_state') {
    onHostedState(msg);
    return;
  }
  if (msg.type === 'tournament_state') {
    onTournamentState(msg);
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
  if (msg.type === 'hosted_rejected') {
    handleHostedRejected(msg);
    return;
  }
}

/* ---------------- Hosted matches (admin-run, code, single stake) ---------------- */

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

function renderHostedStakeBanner(state) {
  hostedStakeBanner.textContent = `🎯 Ziel: ${state.targetScore} Punkte  •  Einsatz: ${describeStake(state.stake)}`;
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
  hostedChoicesSection.classList.toggle('hidden', !isPlayer);
  hostedCloseBtn.classList.toggle('hidden', state.role !== 'host');

  if (hostedPaused) {
    hostedChoiceButtons.forEach((btn) => { btn.disabled = true; });
    return;
  }

  const me = state.players.find((p) => p.id === myId);
  const canChoose = isPlayer && state.status === 'ready' && me && !me.locked;
  hostedChoiceButtons.forEach((btn) => { btn.disabled = !canChoose; });
}

function scheduleHostedReset() {
  if (hostedResetTimer) clearTimeout(hostedResetTimer);
  hostedPaused = true;
  hostedResetTimer = setTimeout(() => {
    hostedResetTimer = null;
    hostedPaused = false;
    hostedHandA.textContent = '❔';
    hostedHandB.textContent = '❔';
    hostedResultText.textContent = '';
    hostedResultText.className = 'result';
    if (hostedState) {
      renderHostedButtons(hostedState);
      renderHostedStatusLine(hostedState);
    }
  }, 3000);
}

function clearHostedResetTimer() {
  if (hostedResetTimer) {
    clearTimeout(hostedResetTimer);
    hostedResetTimer = null;
  }
  hostedPaused = false;
}

function renderHostedStatusLine(state) {
  if (state.abortedBy) return;
  if (state.role === 'pending') {
    hostedStatusText.textContent = 'Warte auf Bestätigung durch den Host…';
    return;
  }
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

function renderHostedPendingList(state) {
  const isHost = state.role === 'host';
  hostedPendingPanel.classList.toggle('hidden', !isHost);
  if (!isHost) return;
  renderPendingListInto(pendingList, pendingSearchInput, state.pending, (guestId, action) => {
    wsSend({ type: `${action}_hosted_join`, matchId: hostedMatchId, guestId });
  });
}

function renderPendingListInto(listEl, searchInput, pending, onAction) {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = pending.filter((p) => p.name.toLowerCase().includes(query));

  listEl.textContent = '';
  if (filtered.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'pending-empty';
    empty.textContent = pending.length === 0 ? 'Keine offenen Beitrittsanfragen.' : 'Keine Treffer.';
    listEl.appendChild(empty);
    return;
  }

  filtered.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'pending-row';

    const nameEl = document.createElement('span');
    nameEl.textContent = p.name;

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'pending-accept-btn';
    acceptBtn.textContent = '✓ Annehmen';
    acceptBtn.addEventListener('click', () => onAction(p.id, 'approve'));

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'pending-reject-btn';
    rejectBtn.textContent = '✗ Ablehnen';
    rejectBtn.addEventListener('click', () => onAction(p.id, 'reject'));

    row.appendChild(nameEl);
    row.appendChild(acceptBtn);
    row.appendChild(rejectBtn);
    listEl.appendChild(row);
  });
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
  clearHostedResetTimer();

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
  hostedPaused = true;

  renderHostedScoreboard(finalState);
  renderHostedLabels(finalState);
  renderHostedButtons(finalState);
  renderHostedStatusLine(finalState);
  renderHostedPendingList(finalState);

  if (finalState.abortedBy) {
    hostedPaused = false;
    renderHostedFinal(finalState);
    return;
  }
  if (finalState.lastRound) {
    renderHostedReveal(finalState);
  }
  if (finalState.status === 'finished') {
    hostedPaused = false;
    renderHostedFinal(finalState);
    return;
  }

  scheduleHostedReset();
}

function onHostedState(state) {
  const prevStatus = hostedState ? hostedState.status : null;
  const enteringCountdown = state.status === 'countdown' && prevStatus !== 'countdown';
  hostedState = state;
  hostedMatchId = state.matchId;

  if (awaitingHostedEntry) {
    awaitingHostedEntry = false;
    awaitingTournamentEntry = false;
    mode = 'hosted';
    clearHostedResetTimer();
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
  renderHostedPendingList(state);

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
  awaitingTournamentEntry = false;
  if (mode === 'host-setup') {
    hostSetupMessage.textContent = msg.message;
  } else if (mode === 'join-code') {
    joinCodeMessage.textContent = msg.message;
  } else if (mode === 'tournament-setup') {
    tournamentSetupMessage.textContent = msg.message;
  } else if (mode === 'tournament') {
    tournamentStatusText.textContent = msg.message;
  }
}

function handleHostedClosed(msg) {
  if (hostedMatchId === msg.matchId) {
    clearHostedResetTimer();
    hostedChoicesSection.classList.add('hidden');
    hostedResultText.textContent = 'Match wurde vom Host geschlossen.';
    hostedResultText.className = 'result lose';
    hostedCloseBtn.classList.add('hidden');
    setTimeout(() => {
      hostedMatchId = null;
      hostedState = null;
      backToStart();
    }, 2000);
    return;
  }
  if (tournamentCode === msg.matchId) {
    clearTournamentResetTimer();
    tournamentChoicesSection.classList.add('hidden');
    tournamentResultText.textContent = 'Turnier wurde vom Host beendet.';
    tournamentResultText.className = 'result lose';
    tournamentCloseBtn.classList.add('hidden');
    startTournamentBtn.classList.add('hidden');
    setTimeout(() => {
      tournamentCode = null;
      tournamentState = null;
      backToStart();
    }, 2000);
  }
}

function handleHostedRejected(msg) {
  if (hostedMatchId === msg.matchId) {
    clearHostedResetTimer();
    hostedChoicesSection.classList.add('hidden');
    hostedResultText.textContent = 'Der Host hat deine Beitrittsanfrage abgelehnt.';
    hostedResultText.className = 'result lose';
    hostedStatusText.textContent = '';
    setTimeout(() => {
      hostedMatchId = null;
      hostedState = null;
      backToStart();
    }, 2500);
    return;
  }
  if (tournamentCode === msg.matchId) {
    clearTournamentResetTimer();
    tournamentResultText.textContent = 'Der Host hat deine Beitrittsanfrage abgelehnt.';
    tournamentResultText.className = 'result lose';
    tournamentStatusText.textContent = '';
    setTimeout(() => {
      tournamentCode = null;
      tournamentState = null;
      backToStart();
    }, 2500);
  }
}

function attemptAutoJoin(code) {
  mode = 'join-code';
  joinCodeInput.value = code;
  joinCodeMessage.textContent = '';
  showPanel(joinCodePanel);
  awaitingHostedEntry = true;
  awaitingTournamentEntry = true;
  wsSendWhenOpen({ type: 'join_hosted_match', code });
}

/* ---------------- Tournaments (admin-run, code, bracket, prizes) ---------------- */

function renderTournamentPrizesBanner(state) {
  const parts = [`🥇 ${describeStake(state.prizes.first)}`];
  if (state.prizes.second) parts.push(`🥈 ${describeStake(state.prizes.second)}`);
  if (state.prizes.third) parts.push(`🥉 ${describeStake(state.prizes.third)}`);
  tournamentPrizesBanner.textContent = `🎯 ${state.targetScore} Punkte pro Match  •  ${parts.join('  •  ')}`;
}

function renderTournamentPendingList(state) {
  const isHost = state.role === 'host';
  tournamentPendingPanel.classList.toggle('hidden', !isHost);
  if (!isHost) return;
  renderPendingListInto(tournamentPendingList, tournamentPendingSearchInput, state.pending, (guestId, action) => {
    wsSend({ type: `${action}_hosted_join`, matchId: tournamentCode, guestId });
  });
}

function renderTournamentRoster(state) {
  const showRoster = state.status === 'registration' || state.role === 'host';
  tournamentRosterPanel.classList.toggle('hidden', !showRoster);
  if (!showRoster) return;

  tournamentRosterCount.textContent = `(${state.players.length})`;
  tournamentRosterList.textContent = '';
  state.players.forEach((p) => {
    const chip = document.createElement('span');
    chip.className = 'roster-chip' + (p.eliminated ? ' eliminated' : '');
    chip.textContent = p.name + (p.id === myId ? ' (Du)' : '');
    tournamentRosterList.appendChild(chip);
  });

  const canStart = state.role === 'host' && state.status === 'registration';
  startTournamentBtn.classList.toggle('hidden', !canStart);
  startTournamentBtn.disabled = state.players.length < 2;
}

function matchupRowClass(matchup, playerEntry) {
  if (matchup.status !== 'finished' && matchup.status !== 'bye') return '';
  if (!matchup.winner) return '';
  return playerEntry && playerEntry.id === matchup.winner ? 'winner' : 'loser';
}

function buildMatchupCard(matchup) {
  const card = document.createElement('div');
  card.className = 'bracket-matchup' + (matchup.status === 'ready' || matchup.status === 'countdown' ? ' matchup-live' : '');

  matchup.players.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'bracket-matchup-row ' + matchupRowClass(matchup, p);
    const name = document.createElement('span');
    name.textContent = p ? (p.name + (p.id === myId ? ' (Du)' : '')) : 'Freilos';
    const score = document.createElement('span');
    score.textContent = p ? String(p.score) : '';
    row.appendChild(name);
    row.appendChild(score);
    card.appendChild(row);
  });

  return card;
}

function renderTournamentBracket(state) {
  tournamentBracketEl.textContent = '';
  if (!state.bracket) return;

  state.bracket.rounds.forEach((round, i) => {
    const roundWrap = document.createElement('div');
    roundWrap.className = 'bracket-round';
    const heading = document.createElement('h4');
    const isFinal = i === state.bracket.rounds.length - 1 && round.length === 1;
    heading.textContent = isFinal ? 'Finale' : `Runde ${i + 1}`;
    roundWrap.appendChild(heading);

    const matchupsWrap = document.createElement('div');
    matchupsWrap.className = 'bracket-matchups';
    round.forEach((m) => matchupsWrap.appendChild(buildMatchupCard(m)));
    roundWrap.appendChild(matchupsWrap);

    tournamentBracketEl.appendChild(roundWrap);
  });

  if (state.bracket.thirdPlaceMatchup) {
    const roundWrap = document.createElement('div');
    roundWrap.className = 'bracket-round';
    const heading = document.createElement('h4');
    heading.textContent = 'Spiel um Platz 3';
    roundWrap.appendChild(heading);
    const matchupsWrap = document.createElement('div');
    matchupsWrap.className = 'bracket-matchups';
    matchupsWrap.appendChild(buildMatchupCard(state.bracket.thirdPlaceMatchup));
    roundWrap.appendChild(matchupsWrap);
    tournamentBracketEl.appendChild(roundWrap);
  }
}

function renderTournamentStandings(state) {
  if (state.status !== 'finished' || !state.standings) {
    tournamentStandingsEl.classList.add('hidden');
    return;
  }
  tournamentStandingsEl.classList.remove('hidden');
  tournamentStandingsEl.textContent = '';

  const rows = [
    ['place-1', '🥇', state.standings.first, state.prizes.first],
    ['place-2', '🥈', state.standings.second, state.prizes.second],
    ['place-3', '🥉', state.standings.third, state.prizes.third]
  ];

  rows.forEach(([cls, medal, winner, prize]) => {
    if (!winner || !prize) return;
    const row = document.createElement('div');
    row.className = `tournament-standings-row ${cls}`;
    const you = winner.id === myId ? ' (Du)' : '';
    row.textContent = `${medal} ${winner.name}${you} — ${describeStake(prize)}`;
    tournamentStandingsEl.appendChild(row);
  });
}

function renderTournamentMatchupScoreboard(matchup) {
  tournamentMyScoreBar.textContent = '';
  const [a, b] = matchup.players;
  tournamentMyScoreBar.appendChild(buildScoreBlock(a, 'left'));
  const sep = document.createElement('span');
  sep.className = 'score-sep';
  sep.textContent = ':';
  tournamentMyScoreBar.appendChild(sep);
  tournamentMyScoreBar.appendChild(buildScoreBlock(b, 'right'));
}

function renderTournamentMatchupLabels(matchup) {
  const [a, b] = matchup.players;
  tournamentLabelA.textContent = a ? (a.name + (a.id === myId ? ' (Du)' : '')) : '?';
  tournamentLabelB.textContent = b ? (b.name + (b.id === myId ? ' (Du)' : '')) : '?';
}

function renderTournamentChoiceButtons(matchup) {
  const interactive = matchup.status === 'ready' || matchup.status === 'countdown';
  tournamentChoicesSection.classList.toggle('hidden', !interactive);

  if (tournamentPaused) {
    tournamentChoiceButtons.forEach((btn) => { btn.disabled = true; });
    return;
  }
  const me = matchup.players.find((p) => p && p.id === myId);
  const canChoose = matchup.status === 'ready' && me && !me.locked;
  tournamentChoiceButtons.forEach((btn) => { btn.disabled = !canChoose; });
}

function renderTournamentHandsPreReveal(matchup) {
  const [a, b] = matchup.players;
  tournamentHandA.textContent = (a && a.id === myId && tournamentMyPendingChoice) ? ICONS[tournamentMyPendingChoice] : '❔';
  tournamentHandB.textContent = (b && b.id === myId && tournamentMyPendingChoice) ? ICONS[tournamentMyPendingChoice] : '❔';
}

function renderTournamentMatchupReveal(matchup) {
  const [a, b] = matchup.players;
  const choices = matchup.lastRound.choices;
  tournamentHandA.textContent = a && choices[a.id] ? ICONS[choices[a.id]] : '❔';
  tournamentHandB.textContent = b && choices[b.id] ? ICONS[choices[b.id]] : '❔';

  let text;
  let cls = 'result';
  if (!matchup.lastRound.winner) {
    text = 'Unentschieden – nächste Runde!';
    cls += ' draw';
  } else {
    const iWon = matchup.lastRound.winner === myId;
    text = iWon ? 'Du gewinnst die Runde! 🎉' : 'Du verlierst die Runde.';
    cls += iWon ? ' win' : ' lose';
  }
  tournamentResultText.textContent = text;
  tournamentResultText.className = cls;
}

function renderTournamentMatchupFinal(state, matchup) {
  tournamentChoicesSection.classList.add('hidden');
  const iWon = matchup.winner === myId;
  let text = iWon ? 'Du gewinnst dein Match! 🎉' : 'Du verlierst dein Match.';
  let cls = 'result ' + (iWon ? 'win' : 'lose');

  if (iWon && state.status === 'finished' && state.standings && state.standings.first && state.standings.first.id === myId) {
    text = `🏆 Du hast das Turnier gewonnen! Preis: ${describeStake(state.prizes.first)}`;
  } else if (!iWon) {
    text += ' Du bist ausgeschieden.';
  } else {
    text += ' Warte auf die nächste Runde…';
  }

  tournamentResultText.textContent = text;
  tournamentResultText.className = cls;
}

function renderTournamentMyMatchup(state) {
  const m = state.myMatchup;
  if (!m) {
    tournamentMyMatchupSection.classList.add('hidden');
    return;
  }
  tournamentMyMatchupSection.classList.remove('hidden');
  renderTournamentMatchupScoreboard(m);
  renderTournamentMatchupLabels(m);
  renderTournamentChoiceButtons(m);
}

function renderTournamentStatusLine(state) {
  if (state.role === 'pending') {
    tournamentStatusText.textContent = 'Warte auf Bestätigung durch den Host…';
    return;
  }
  if (state.role !== 'player') {
    tournamentStatusText.textContent = '';
    return;
  }
  const me = state.players.find((p) => p.id === myId);
  if (state.status === 'registration') {
    tournamentStatusText.textContent = 'Warte auf Turnierstart durch den Host…';
    return;
  }
  if (me && me.eliminated) {
    tournamentStatusText.textContent = '';
    return;
  }
  if (!state.myMatchup) {
    tournamentStatusText.textContent = 'Du bist weiter im Turnier – warte auf die nächste Runde…';
    return;
  }
  if (state.myMatchup.status === 'bye') {
    tournamentStatusText.textContent = 'Freilos – du bist automatisch weiter!';
    return;
  }
  if (state.myMatchup.status === 'ready') {
    const mp = state.myMatchup.players.find((p) => p && p.id === myId);
    tournamentStatusText.textContent = mp && mp.locked ? 'Du hast gewählt – warte auf Gegner…' : '';
    return;
  }
  tournamentStatusText.textContent = '';
}

function scheduleTournamentReset() {
  if (tournamentResetTimer) clearTimeout(tournamentResetTimer);
  tournamentPaused = true;
  tournamentResetTimer = setTimeout(() => {
    tournamentResetTimer = null;
    tournamentPaused = false;
    tournamentHandA.textContent = '❔';
    tournamentHandB.textContent = '❔';
    tournamentResultText.textContent = '';
    tournamentResultText.className = 'result';
    if (tournamentState && tournamentState.myMatchup) {
      renderTournamentChoiceButtons(tournamentState.myMatchup);
    }
    if (tournamentState) renderTournamentStatusLine(tournamentState);
  }, 3000);
}

function clearTournamentResetTimer() {
  if (tournamentResetTimer) {
    clearTimeout(tournamentResetTimer);
    tournamentResetTimer = null;
  }
  tournamentPaused = false;
}

async function runTournamentCountdown(state) {
  clearTournamentResetTimer();

  renderTournamentHandsPreReveal(state.myMatchup);
  tournamentHandA.classList.add('shake');
  tournamentHandB.classList.add('shake');

  const revealPromise = new Promise((resolve) => { tournamentRevealResolve = resolve; });
  await runCountdown(tournamentCenterDisplay);
  const finalState = await revealPromise;

  tournamentHandA.classList.remove('shake');
  tournamentHandB.classList.remove('shake');
  tournamentCenterDisplay.textContent = 'VS';
  tournamentMyPendingChoice = null;
  tournamentPaused = true;

  renderTournamentRoster(finalState);
  renderTournamentPendingList(finalState);
  renderTournamentBracket(finalState);
  renderTournamentMyMatchup(finalState);
  renderTournamentStatusLine(finalState);

  const m = finalState.myMatchup;
  if (m && m.lastRound) {
    renderTournamentMatchupReveal(m);
  }
  if (m && m.status === 'finished') {
    tournamentPaused = false;
    renderTournamentMatchupFinal(finalState, m);
    renderTournamentStandings(finalState);
    return;
  }

  scheduleTournamentReset();
}

function onTournamentState(state) {
  const prevMatchupStatus = tournamentState && tournamentState.myMatchup ? tournamentState.myMatchup.status : null;
  const prevMatchupId = tournamentState && tournamentState.myMatchup ? tournamentState.myMatchup.id : null;
  const newMatchupStatus = state.myMatchup ? state.myMatchup.status : null;
  const enteringCountdown = newMatchupStatus === 'countdown' && prevMatchupStatus !== 'countdown';
  const matchupChanged = state.myMatchup && state.myMatchup.id !== prevMatchupId;

  tournamentState = state;
  tournamentCode = state.code;

  if (awaitingTournamentEntry) {
    awaitingTournamentEntry = false;
    awaitingHostedEntry = false;
    mode = 'tournament';
    clearTournamentResetTimer();
    showPanel(tournamentSection);
    tournamentCodeBanner.classList.toggle('hidden', state.role !== 'host');
    tournamentCodeDisplay.textContent = state.code;
  }

  renderTournamentPrizesBanner(state);

  if (tournamentRevealResolve) {
    if (newMatchupStatus !== 'countdown') {
      const resolve = tournamentRevealResolve;
      tournamentRevealResolve = null;
      resolve(state);
    }
    return;
  }

  if (matchupChanged && !enteringCountdown) {
    clearTournamentResetTimer();
    tournamentHandA.textContent = '❔';
    tournamentHandB.textContent = '❔';
    tournamentResultText.textContent = '';
    tournamentResultText.className = 'result';
  }

  renderTournamentRoster(state);
  renderTournamentPendingList(state);
  renderTournamentBracket(state);
  renderTournamentMyMatchup(state);
  renderTournamentStatusLine(state);
  renderTournamentStandings(state);

  if (enteringCountdown) {
    runTournamentCountdown(state);
    return;
  }

  const m = state.myMatchup;
  if (m && m.lastRound) {
    renderTournamentMatchupReveal(m);
  }
  if (m && m.status === 'finished' && !tournamentPaused) {
    renderTournamentMatchupFinal(state, m);
  }
}

/* ---------------- Reusable prize/stake picker widget ---------------- */

function buildStakePicker(label, required) {
  const wrap = document.createElement('div');
  wrap.className = 'prize-picker';

  const header = document.createElement('div');
  header.className = 'prize-picker-header';
  const title = document.createElement('span');
  title.textContent = label;
  header.appendChild(title);

  let enabled = required;
  let toggle = null;
  if (!required) {
    toggle = document.createElement('input');
    toggle.type = 'checkbox';
    header.appendChild(toggle);
  }
  wrap.appendChild(header);

  const body = document.createElement('div');
  body.className = 'prize-picker-body';
  if (!required) body.classList.add('hidden');

  const tabs = document.createElement('div');
  tabs.className = 'stake-type-tabs';
  const moneyTab = document.createElement('button');
  moneyTab.type = 'button';
  moneyTab.className = 'stake-type-btn active';
  moneyTab.textContent = '💶 Geld';
  const itemTab = document.createElement('button');
  itemTab.type = 'button';
  itemTab.className = 'stake-type-btn';
  itemTab.textContent = '⛏️ Minecraft-Item';
  tabs.appendChild(moneyTab);
  tabs.appendChild(itemTab);
  body.appendChild(tabs);

  const moneyWrap = document.createElement('div');
  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.min = '0.01';
  amountInput.step = '0.01';
  amountInput.placeholder = 'Betrag in €';
  moneyWrap.appendChild(amountInput);
  body.appendChild(moneyWrap);

  const itemWrap = document.createElement('div');
  itemWrap.classList.add('hidden');
  const itemSearch = document.createElement('input');
  itemSearch.type = 'text';
  itemSearch.placeholder = 'Minecraft-Item suchen';
  const itemResults = document.createElement('div');
  itemResults.className = 'item-search-results hidden';
  const selectedDisplay = document.createElement('div');
  selectedDisplay.className = 'selected-item-display hidden';
  const selectedName = document.createElement('span');
  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.className = 'link-btn';
  changeBtn.textContent = 'Ändern';
  selectedDisplay.appendChild(selectedName);
  selectedDisplay.appendChild(changeBtn);
  const customLabelInput = document.createElement('input');
  customLabelInput.type = 'text';
  customLabelInput.placeholder = 'Eigene Bezeichnung (optional)';
  customLabelInput.maxLength = 80;
  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.min = '1';
  quantityInput.value = '1';
  itemWrap.appendChild(itemSearch);
  itemWrap.appendChild(itemResults);
  itemWrap.appendChild(selectedDisplay);
  itemWrap.appendChild(customLabelInput);
  itemWrap.appendChild(quantityInput);
  body.appendChild(itemWrap);

  wrap.appendChild(body);

  let localStakeType = 'money';
  let selected = null;

  moneyTab.addEventListener('click', () => {
    localStakeType = 'money';
    moneyTab.classList.add('active');
    itemTab.classList.remove('active');
    moneyWrap.classList.remove('hidden');
    itemWrap.classList.add('hidden');
  });
  itemTab.addEventListener('click', () => {
    localStakeType = 'item';
    itemTab.classList.add('active');
    moneyTab.classList.remove('active');
    itemWrap.classList.remove('hidden');
    moneyWrap.classList.add('hidden');
  });

  itemSearch.addEventListener('input', () => {
    const q = itemSearch.value.trim().toLowerCase();
    itemResults.textContent = '';
    if (!q) {
      itemResults.classList.add('hidden');
      return;
    }
    const matches = mcItems.filter((it) => it.name.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) {
      itemResults.classList.add('hidden');
      return;
    }
    matches.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.name;
      b.addEventListener('click', () => {
        selected = it;
        selectedName.textContent = it.name;
        selectedDisplay.classList.remove('hidden');
        itemSearch.value = '';
        itemSearch.classList.add('hidden');
        itemResults.classList.add('hidden');
      });
      itemResults.appendChild(b);
    });
    itemResults.classList.remove('hidden');
  });

  changeBtn.addEventListener('click', () => {
    selected = null;
    selectedDisplay.classList.add('hidden');
    itemSearch.classList.remove('hidden');
    itemSearch.value = '';
    itemSearch.focus();
  });

  if (toggle) {
    toggle.addEventListener('change', () => {
      enabled = toggle.checked;
      body.classList.toggle('hidden', !enabled);
    });
  }

  return {
    element: wrap,
    reset() {
      amountInput.value = '';
      customLabelInput.value = '';
      quantityInput.value = '1';
      selected = null;
      selectedDisplay.classList.add('hidden');
      itemSearch.classList.remove('hidden');
      itemSearch.value = '';
      if (toggle) {
        toggle.checked = false;
        enabled = false;
        body.classList.add('hidden');
      }
    },
    getStake(setError) {
      if (!enabled) return null;
      if (localStakeType === 'money') {
        const amount = parseFloat(amountInput.value);
        if (!(amount > 0)) {
          setError('Bitte einen gültigen Betrag angeben.');
          return undefined;
        }
        return { type: 'money', amount };
      }
      if (!selected) {
        setError('Bitte ein Minecraft-Item auswählen.');
        return undefined;
      }
      const quantity = parseInt(quantityInput.value, 10) || 1;
      return {
        type: 'item',
        itemId: selected.id,
        itemName: selected.name,
        customLabel: customLabelInput.value.trim(),
        quantity
      };
    }
  };
}

function initTournamentPrizePickers() {
  if (firstPrizePicker) return;
  firstPrizePicker = buildStakePicker('🥇 1. Platz', true);
  secondPrizePicker = buildStakePicker('🥈 2. Platz (optional)', false);
  thirdPrizePicker = buildStakePicker('🥉 3. Platz (optional)', false);
  tournamentPrizesContainer.appendChild(firstPrizePicker.element);
  tournamentPrizesContainer.appendChild(secondPrizePicker.element);
  tournamentPrizesContainer.appendChild(thirdPrizePicker.element);
}

/* ---------------- Minecraft item search (host-setup panel) ---------------- */

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
    if (mode === 'bot') playBotRound(btn.dataset.choice);
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

tournamentChoiceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.choice;
    if (!tournamentCode || !tournamentState || !tournamentState.myMatchup) return;
    const m = tournamentState.myMatchup;
    const me = m.players.find((p) => p && p.id === myId);
    if (tournamentState.role !== 'player' || m.status !== 'ready' || !me || me.locked) return;

    tournamentMyPendingChoice = choice;
    const [a, b] = m.players;
    if (a && a.id === myId) tournamentHandA.textContent = ICONS[choice];
    if (b && b.id === myId) tournamentHandB.textContent = ICONS[choice];
    tournamentStatusText.textContent = 'Du hast gewählt – warte auf Gegner…';
    tournamentChoiceButtons.forEach((b2) => { b2.disabled = true; });

    wsSend({ type: 'tournament_choice', code: tournamentCode, matchupId: m.id, choice });
  });
});

modeBotBtn.addEventListener('click', () => {
  mode = 'bot';
  resetArena();
  showPanel(gameSection);
});

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

modeTournamentBtn.addEventListener('click', () => {
  mode = 'tournament-setup';
  tournamentSetupMessage.textContent = '';
  initTournamentPrizePickers();
  showPanel(tournamentSetupPanel);
});

backToMenuBtn.addEventListener('click', () => {
  busy = false;
  backToStart();
});

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
  clearHostedResetTimer();
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

pendingSearchInput.addEventListener('input', () => {
  if (hostedState) renderHostedPendingList(hostedState);
});

createTournamentBtn.addEventListener('click', () => {
  const targetScore = parseInt(tournamentTargetScoreInput.value, 10);
  if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 50) {
    tournamentSetupMessage.textContent = 'Bitte eine gültige Punktzahl (1-50) angeben.';
    return;
  }

  let errorMsg = null;
  const setError = (m) => { errorMsg = m; };
  const first = firstPrizePicker.getStake(setError);
  if (errorMsg) { tournamentSetupMessage.textContent = errorMsg; return; }
  const second = secondPrizePicker.getStake(setError);
  if (errorMsg) { tournamentSetupMessage.textContent = errorMsg; return; }
  const third = thirdPrizePicker.getStake(setError);
  if (errorMsg) { tournamentSetupMessage.textContent = errorMsg; return; }

  tournamentSetupMessage.textContent = '';
  awaitingTournamentEntry = true;
  wsSendWhenOpen({ type: 'create_tournament', targetScore, prizes: { first, second, third } });
});

tournamentSetupBackBtn.addEventListener('click', backToStart);

tournamentCopyLinkBtn.addEventListener('click', async () => {
  if (!tournamentState) return;
  const url = `${window.location.origin}/game.html?join=${tournamentState.code}`;
  try {
    await navigator.clipboard.writeText(url);
    const original = tournamentCopyLinkBtn.textContent;
    tournamentCopyLinkBtn.textContent = 'Kopiert!';
    setTimeout(() => { tournamentCopyLinkBtn.textContent = original; }, 1500);
  } catch {
    tournamentSetupMessage.textContent = url;
  }
});

tournamentPendingSearchInput.addEventListener('input', () => {
  if (tournamentState) renderTournamentPendingList(tournamentState);
});

startTournamentBtn.addEventListener('click', () => {
  if (!tournamentCode) return;
  wsSend({ type: 'start_tournament', code: tournamentCode });
});

tournamentBackBtn.addEventListener('click', () => {
  if (tournamentCode) {
    wsSend({ type: 'leave_hosted_match', matchId: tournamentCode });
  }
  clearTournamentResetTimer();
  tournamentCode = null;
  tournamentState = null;
  tournamentRevealResolve = null;
  tournamentMyPendingChoice = null;
  if (firstPrizePicker) {
    firstPrizePicker.reset();
    secondPrizePicker.reset();
    thirdPrizePicker.reset();
  }
  backToStart();
});

tournamentCloseBtn.addEventListener('click', () => {
  if (tournamentCode) {
    wsSend({ type: 'close_hosted_match', matchId: tournamentCode });
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = 'index.html';
});

loadMe();
loadMinecraftItems();
