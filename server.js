const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parseCookie } = require('cookie');
const cookieSignature = require('cookie-signature');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const CHOICES = ['stein', 'papier', 'schere'];
const BEATS = { stein: 'schere', schere: 'papier', papier: 'stein' };
const SESSION_SECRET = process.env.SESSION_SECRET || 'schere-stein-papier-secret';
const sessionStore = new session.MemoryStore();
const ADMIN_USERNAMES = ['axxin', 'drpacket', 'hugo'];

function isAdmin(username) {
  return ADMIN_USERNAMES.includes(username);
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function judge(choiceA, choiceB) {
  if (choiceA === choiceB) return 'unentschieden';
  return BEATS[choiceA] === choiceB ? 'gewonnen' : 'verloren';
}

function applyResult(user, result) {
  if (result === 'gewonnen') user.stats.wins += 1;
  else if (result === 'verloren') user.stats.losses += 1;
  else user.stats.draws += 1;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

function requireAuth(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({ error: 'Nicht angemeldet.' });
  }
  next();
}

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich.' });
  }
  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 3) {
    return res.status(400).json({ error: 'Benutzername muss mindestens 3 Zeichen lang sein.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein.' });
  }

  const users = loadUsers();
  const key = trimmedUsername.toLowerCase();
  if (users[key]) {
    return res.status(409).json({ error: 'Benutzername bereits vergeben.' });
  }

  users[key] = {
    username: trimmedUsername,
    passwordHash: bcrypt.hashSync(password, 10),
    stats: { wins: 0, losses: 0, draws: 0 }
  };
  saveUsers(users);

  req.session.username = key;
  res.json({ username: trimmedUsername, stats: users[key].stats, isAdmin: isAdmin(key) });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Benutzername und Passwort erforderlich.' });
  }
  const key = username.trim().toLowerCase();
  const users = loadUsers();
  const user = users[key];
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch.' });
  }

  req.session.username = key;
  res.json({ username: user.username, stats: user.stats, isAdmin: isAdmin(key) });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  const users = loadUsers();
  const user = users[req.session.username];
  if (!user) {
    return res.status(401).json({ error: 'Nicht angemeldet.' });
  }
  res.json({ username: user.username, stats: user.stats, isAdmin: isAdmin(req.session.username) });
});

app.post('/api/play', requireAuth, (req, res) => {
  const { choice } = req.body || {};
  if (!CHOICES.includes(choice)) {
    return res.status(400).json({ error: 'Ungueltige Auswahl.' });
  }

  const users = loadUsers();
  const user = users[req.session.username];
  if (!user) {
    return res.status(401).json({ error: 'Nicht angemeldet.' });
  }

  const computerChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
  const result = judge(choice, computerChoice);
  applyResult(user, result);
  saveUsers(users);

  res.json({ playerChoice: choice, computerChoice, result, stats: user.stats });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// key: username -> the single active socket for that user (last connection wins)
const sockets = new Map();
let queue = []; // usernames waiting for an opponent
const matches = new Map(); // matchId -> { players: [username, username], choices: {} }
let nextMatchId = 1;

function send(username, payload) {
  const ws = sockets.get(username);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function removeFromQueue(username) {
  queue = queue.filter((u) => u !== username);
}

function opponentOf(match, username) {
  return match.players.find((u) => u !== username);
}

function endMatch(matchId) {
  matches.delete(matchId);
}

function tryMatchmake() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    const matchId = String(nextMatchId++);
    matches.set(matchId, { players: [a, b], choices: {} });
    send(a, { type: 'match_found', matchId, opponent: b });
    send(b, { type: 'match_found', matchId, opponent: a });
  }
}

/* ---------------- Hosted matches (admin-run, code to join, stakes) ---------------- */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const hostedMatches = new Map(); // code -> hosted match state

function generateHostedCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (hostedMatches.has(code));
  return code;
}

function isValidStake(stake) {
  if (!stake || typeof stake !== 'object') return false;
  if (stake.type === 'money') {
    return typeof stake.amount === 'number' && stake.amount > 0 && Number.isFinite(stake.amount);
  }
  if (stake.type === 'item') {
    return (
      typeof stake.itemId === 'string' && stake.itemId.length > 0 &&
      typeof stake.itemName === 'string' && stake.itemName.length > 0 &&
      Number.isInteger(stake.quantity) && stake.quantity > 0
    );
  }
  return false;
}

function sanitizeStake(stake) {
  if (stake.type === 'money') {
    return { type: 'money', amount: stake.amount, currency: 'EUR' };
  }
  return {
    type: 'item',
    itemId: stake.itemId,
    itemName: stake.itemName,
    customLabel: typeof stake.customLabel === 'string' ? stake.customLabel.trim().slice(0, 80) : '',
    quantity: stake.quantity
  };
}

function hostedRecipients(match) {
  return new Set([match.host, ...match.players, ...match.spectators]);
}

function buildHostedStatePayload(match, username) {
  const role = username === match.host ? 'host' : (match.players.includes(username) ? 'player' : 'spectator');
  return {
    type: 'hosted_state',
    matchId: match.code,
    code: match.code,
    status: match.status,
    targetScore: match.targetScore,
    stake: match.stake,
    role,
    host: match.host,
    players: match.players.map((p) => ({
      username: p,
      score: match.scores[p],
      locked: Boolean(match.choices[p])
    })),
    opponent: role === 'player' ? (opponentOf(match, username) || null) : null,
    lastRound: match.lastRound,
    winner: match.winner,
    abortedBy: match.abortedBy || null
  };
}

function broadcastHostedState(match) {
  for (const user of hostedRecipients(match)) {
    send(user, buildHostedStatePayload(match, user));
  }
}

function forfeitHostedMatch(match, leavingUsername) {
  if (match.status === 'finished') return;
  const remaining = opponentOf(match, leavingUsername);
  match.status = 'finished';
  match.winner = remaining || null;
  match.abortedBy = leavingUsername;
  match.choices = {};
  broadcastHostedState(match);
}

function handleMessage(username, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'join_queue') {
    if (queue.includes(username)) return;
    for (const match of matches.values()) {
      if (match.players.includes(username)) return;
    }
    queue.push(username);
    send(username, { type: 'queue_joined' });
    tryMatchmake();
    return;
  }

  if (msg.type === 'leave_queue') {
    removeFromQueue(username);
    return;
  }

  if (msg.type === 'choice') {
    const match = matches.get(msg.matchId);
    if (!match || !match.players.includes(username)) return;
    if (!CHOICES.includes(msg.choice)) return;
    if (match.choices[username]) return;

    match.choices[username] = msg.choice;
    const opponent = opponentOf(match, username);
    send(opponent, { type: 'opponent_locked_in' });

    if (Object.keys(match.choices).length === 2) {
      send(match.players[0], { type: 'start_countdown', matchId: msg.matchId });
      send(match.players[1], { type: 'start_countdown', matchId: msg.matchId });

      setTimeout(() => {
        const current = matches.get(msg.matchId);
        if (!current) return;

        const users = loadUsers();
        for (const player of current.players) {
          const opp = opponentOf(current, player);
          const myChoice = current.choices[player];
          const oppChoice = current.choices[opp];
          const result = judge(myChoice, oppChoice);

          const userRecord = users[player];
          let stats = null;
          if (userRecord) {
            applyResult(userRecord, result);
            stats = userRecord.stats;
          }

          send(player, {
            type: 'reveal',
            matchId: msg.matchId,
            yourChoice: myChoice,
            opponentChoice: oppChoice,
            opponent: opp,
            result,
            stats
          });
        }
        saveUsers(users);
        endMatch(msg.matchId);
      }, 3000);
    }
    return;
  }

  if (msg.type === 'leave_match') {
    const match = matches.get(msg.matchId);
    if (!match || !match.players.includes(username)) return;
    const opponent = opponentOf(match, username);
    send(opponent, { type: 'opponent_left', matchId: msg.matchId });
    endMatch(msg.matchId);
    return;
  }

  if (msg.type === 'create_hosted_match') {
    if (!isAdmin(username)) {
      send(username, { type: 'hosted_error', message: 'Nur Admins können ein Spiel hosten.' });
      return;
    }
    const targetScore = Number(msg.targetScore);
    if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 50) {
      send(username, { type: 'hosted_error', message: 'Ungültige Punktzahl (1-50).' });
      return;
    }
    if (!isValidStake(msg.stake)) {
      send(username, { type: 'hosted_error', message: 'Ungültiger Einsatz.' });
      return;
    }

    const code = generateHostedCode();
    const match = {
      code,
      host: username,
      targetScore,
      stake: sanitizeStake(msg.stake),
      players: [],
      scores: {},
      choices: {},
      status: 'waiting',
      lastRound: null,
      winner: null,
      abortedBy: null,
      spectators: new Set()
    };
    hostedMatches.set(code, match);
    broadcastHostedState(match);
    return;
  }

  if (msg.type === 'join_hosted_match') {
    const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
    const match = hostedMatches.get(code);
    if (!match) {
      send(username, { type: 'hosted_error', message: 'Code nicht gefunden.' });
      return;
    }

    if (username !== match.host && !match.players.includes(username)) {
      if (match.players.length < 2 && match.status !== 'finished') {
        match.players.push(username);
        match.scores[username] = 0;
        if (match.players.length === 2) {
          match.status = 'ready';
        }
      } else {
        match.spectators.add(username);
      }
    }

    broadcastHostedState(match);
    return;
  }

  if (msg.type === 'hosted_choice') {
    const match = hostedMatches.get(msg.matchId);
    if (!match) return;
    if (!match.players.includes(username)) return;
    if (match.status !== 'ready') return;
    if (!CHOICES.includes(msg.choice)) return;
    if (match.choices[username]) return;

    match.choices[username] = msg.choice;

    if (Object.keys(match.choices).length === 2) {
      match.status = 'countdown';
      broadcastHostedState(match);

      setTimeout(() => {
        const current = hostedMatches.get(msg.matchId);
        if (!current || current.status !== 'countdown') return;

        const [playerA, playerB] = current.players;
        const choiceA = current.choices[playerA];
        const choiceB = current.choices[playerB];
        const resultForA = judge(choiceA, choiceB);

        let roundWinner = null;
        if (resultForA === 'gewonnen') roundWinner = playerA;
        else if (resultForA === 'verloren') roundWinner = playerB;

        if (roundWinner) {
          current.scores[roundWinner] += 1;
        }

        current.lastRound = {
          choices: { [playerA]: choiceA, [playerB]: choiceB },
          winner: roundWinner
        };
        current.choices = {};

        if (roundWinner && current.scores[roundWinner] >= current.targetScore) {
          current.status = 'finished';
          current.winner = roundWinner;
        } else {
          current.status = 'ready';
        }

        broadcastHostedState(current);
      }, 3000);
    } else {
      broadcastHostedState(match);
    }
    return;
  }

  if (msg.type === 'leave_hosted_match') {
    const match = hostedMatches.get(msg.matchId);
    if (!match) return;
    if (match.players.includes(username)) {
      forfeitHostedMatch(match, username);
    } else {
      match.spectators.delete(username);
    }
    return;
  }

  if (msg.type === 'close_hosted_match') {
    const match = hostedMatches.get(msg.matchId);
    if (!match || match.host !== username) return;
    const recipients = hostedRecipients(match);
    hostedMatches.delete(match.code);
    for (const user of recipients) {
      send(user, { type: 'hosted_closed', matchId: match.code });
    }
  }
}

function handleDisconnect(username) {
  if (sockets.get(username) !== this) return;
  sockets.delete(username);
  removeFromQueue(username);
  for (const [matchId, match] of matches.entries()) {
    if (match.players.includes(username)) {
      const opponent = opponentOf(match, username);
      send(opponent, { type: 'opponent_left', matchId });
      endMatch(matchId);
    }
  }
  for (const match of hostedMatches.values()) {
    if (match.players.includes(username)) {
      forfeitHostedMatch(match, username);
    } else {
      match.spectators.delete(username);
    }
  }
}

function getUsernameFromRequest(req, callback) {
  const header = req.headers.cookie;
  if (!header) return callback(null);
  const cookies = parseCookie(header);
  const raw = cookies['connect.sid'];
  if (!raw) return callback(null);
  if (!raw.startsWith('s:')) return callback(null);
  const sid = cookieSignature.unsign(raw.slice(2), SESSION_SECRET);
  if (!sid) return callback(null);
  sessionStore.get(sid, (err, sessionData) => {
    if (err || !sessionData || !sessionData.username) return callback(null);
    callback(sessionData.username);
  });
}

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  getUsernameFromRequest(req, (username) => {
    if (!username) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, username);
    });
  });
});

wss.on('connection', (ws, req, username) => {
  const existing = sockets.get(username);
  if (existing && existing !== ws) {
    existing.close();
  }
  sockets.set(username, ws);

  ws.on('message', (raw) => handleMessage(username, raw));
  ws.on('close', handleDisconnect.bind(ws, username));
});

server.listen(PORT, () => {
  console.log(`Server laeuft auf http://localhost:${PORT}`);
});
