const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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
// Every admin holds exactly one role. All roles currently share the same
// hosting/approval permissions — the roles are labels for now, distinguishing
// them is a foundation for permission differences to be added later.
const ROLES = { drpacket: 'Owner', axxin: 'Sponsor', hugo: 'Famous' };

// Fixed accounts – the only accounts that can ever log in. There is no public
// registration; passwords are seeded below (bcrypt hashes, not plaintext).
const ADMIN_SEED = {
  axxin: { username: 'Axxin', passwordHash: '$2a$10$/oyP7K4pfyAN9gNpdO4YVOoiI.IhWAnb4kwxeOqIN4p7zWHShheLm' },
  drpacket: { username: 'DrPacket', passwordHash: '$2a$10$SpqN8Uy6wL364GG/31msYO.X6PiVlWwKd./7yvBLpw/VQCoKtFK.C' },
  hugo: { username: 'Hugo', passwordHash: '$2a$10$WLh6ifSEE63ectH9dznXpefNYQRMYG.epfT/t4sCjSiH3GhBc0DY2' }
};

function roleOf(username) {
  return ROLES[username] || null;
}

function isAdmin(username) {
  return Boolean(ROLES[username]);
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function seedAdmins() {
  const users = loadUsers();
  let changed = false;
  for (const [key, seed] of Object.entries(ADMIN_SEED)) {
    if (!users[key]) {
      users[key] = {
        username: seed.username,
        passwordHash: seed.passwordHash,
        stats: { wins: 0, losses: 0, draws: 0 }
      };
      changed = true;
    }
  }
  if (changed) saveUsers(users);
}

seedAdmins();

function judge(choiceA, choiceB) {
  if (choiceA === choiceB) return 'unentschieden';
  return BEATS[choiceA] === choiceB ? 'gewonnen' : 'verloren';
}

function applyResult(user, result) {
  if (result === 'gewonnen') user.stats.wins += 1;
  else if (result === 'verloren') user.stats.losses += 1;
  else user.stats.draws += 1;
}

// Guests have no account: they join a hosted match with just a display name.
// Their session "username" is an opaque internal id; the real-world name they
// typed is only ever kept here, in memory, for as long as their session lives.
const guestNames = new Map();

function isGuestIdentity(identity) {
  return typeof identity === 'string' && identity.startsWith('guest-');
}

function displayNameOf(identity) {
  if (guestNames.has(identity)) return guestNames.get(identity);
  const users = loadUsers();
  if (users[identity]) return users[identity].username;
  return identity;
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
  req.session.isGuest = false;
  res.json({ id: key, username: user.username, stats: user.stats, isAdmin: isAdmin(key), role: roleOf(key), isGuest: false });
});

app.post('/api/guest-join', (req, res) => {
  const { name, code } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 24) {
    return res.status(400).json({ error: 'Bitte einen Namen (1-24 Zeichen) angeben.' });
  }
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
    return res.status(400).json({ error: 'Bitte einen gültigen 6-stelligen Code angeben.' });
  }
  if (!hostedMatches.has(normalizedCode)) {
    return res.status(404).json({ error: 'Code nicht gefunden.' });
  }

  const guestId = `guest-${crypto.randomBytes(8).toString('hex')}`;
  guestNames.set(guestId, name.trim().slice(0, 24));

  req.session.username = guestId;
  req.session.isGuest = true;
  res.json({ id: guestId, username: guestNames.get(guestId), isGuest: true, code: normalizedCode });
});

app.post('/api/logout', (req, res) => {
  if (req.session.isGuest && req.session.username) {
    guestNames.delete(req.session.username);
  }
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  const identity = req.session.username;
  if (req.session.isGuest) {
    return res.json({ id: identity, username: displayNameOf(identity), stats: null, isAdmin: false, role: null, isGuest: true });
  }
  const users = loadUsers();
  const user = users[identity];
  if (!user) {
    return res.status(401).json({ error: 'Nicht angemeldet.' });
  }
  res.json({ id: identity, username: user.username, stats: user.stats, isAdmin: isAdmin(identity), role: roleOf(identity), isGuest: false });
});

app.post('/api/play', requireAuth, (req, res) => {
  if (req.session.isGuest) {
    return res.status(403).json({ error: 'Gäste können nur an ihrem gehosteten Match teilnehmen.' });
  }
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

// key: identity (account key or guest id) -> the single active socket for that identity
const sockets = new Map();
let queue = []; // identities waiting for an opponent
const matches = new Map(); // matchId -> { players: [identity, identity], choices: {} }
let nextMatchId = 1;

function send(identity, payload) {
  const ws = sockets.get(identity);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function removeFromQueue(identity) {
  queue = queue.filter((u) => u !== identity);
}

function opponentOf(match, identity) {
  return match.players.find((u) => u !== identity);
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
    send(a, { type: 'match_found', matchId, opponent: displayNameOf(b) });
    send(b, { type: 'match_found', matchId, opponent: displayNameOf(a) });
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
  return new Set([match.host, ...match.players, ...match.spectators, ...match.pending]);
}

function playerRoleFor(match, identity) {
  if (identity === match.host) return 'host';
  if (match.players.includes(identity)) return 'player';
  if (match.pending.includes(identity)) return 'pending';
  return 'spectator';
}

function buildHostedStatePayload(match, identity) {
  const role = playerRoleFor(match, identity);
  return {
    type: 'hosted_state',
    matchId: match.code,
    code: match.code,
    status: match.status,
    targetScore: match.targetScore,
    stake: match.stake,
    role,
    hostName: displayNameOf(match.host),
    players: match.players.map((p) => ({
      id: p,
      name: displayNameOf(p),
      score: match.scores[p],
      locked: Boolean(match.choices[p])
    })),
    pending: role === 'host' ? match.pending.map((p) => ({ id: p, name: displayNameOf(p) })) : [],
    lastRound: match.lastRound,
    winner: match.winner,
    abortedBy: match.abortedBy || null
  };
}

function broadcastHostedState(match) {
  for (const identity of hostedRecipients(match)) {
    send(identity, buildHostedStatePayload(match, identity));
  }
}

function forfeitHostedMatch(match, leavingIdentity) {
  if (match.status === 'finished') return;
  const remaining = opponentOf(match, leavingIdentity);
  match.status = 'finished';
  match.winner = remaining || null;
  match.abortedBy = leavingIdentity;
  match.choices = {};
  broadcastHostedState(match);
}

function handleMessage(identity, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'join_queue') {
    if (isGuestIdentity(identity)) return;
    if (queue.includes(identity)) return;
    for (const match of matches.values()) {
      if (match.players.includes(identity)) return;
    }
    queue.push(identity);
    send(identity, { type: 'queue_joined' });
    tryMatchmake();
    return;
  }

  if (msg.type === 'leave_queue') {
    removeFromQueue(identity);
    return;
  }

  if (msg.type === 'choice') {
    const match = matches.get(msg.matchId);
    if (!match || !match.players.includes(identity)) return;
    if (!CHOICES.includes(msg.choice)) return;
    if (match.choices[identity]) return;

    match.choices[identity] = msg.choice;
    const opponent = opponentOf(match, identity);
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
            opponent: displayNameOf(opp),
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
    if (!match || !match.players.includes(identity)) return;
    const opponent = opponentOf(match, identity);
    send(opponent, { type: 'opponent_left', matchId: msg.matchId });
    endMatch(msg.matchId);
    return;
  }

  if (msg.type === 'create_hosted_match') {
    if (!isAdmin(identity)) {
      send(identity, { type: 'hosted_error', message: 'Nur Admins können ein Spiel hosten.' });
      return;
    }
    const targetScore = Number(msg.targetScore);
    if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 50) {
      send(identity, { type: 'hosted_error', message: 'Ungültige Punktzahl (1-50).' });
      return;
    }
    if (!isValidStake(msg.stake)) {
      send(identity, { type: 'hosted_error', message: 'Ungültiger Einsatz.' });
      return;
    }

    const code = generateHostedCode();
    const match = {
      code,
      host: identity,
      targetScore,
      stake: sanitizeStake(msg.stake),
      players: [],
      pending: [],
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
      send(identity, { type: 'hosted_error', message: 'Code nicht gefunden.' });
      return;
    }

    const alreadyInMatch = identity === match.host || match.players.includes(identity) ||
      match.pending.includes(identity) || match.spectators.has(identity);

    if (!alreadyInMatch) {
      const openSlots = 2 - match.players.length - match.pending.length;
      if (openSlots > 0 && match.status !== 'finished') {
        if (isGuestIdentity(identity)) {
          // Guests must be approved by the host first so nobody can join
          // under a name that isn't theirs.
          match.pending.push(identity);
        } else {
          match.players.push(identity);
          match.scores[identity] = 0;
          if (match.players.length === 2) {
            match.status = 'ready';
          }
        }
      } else {
        match.spectators.add(identity);
      }
    }

    broadcastHostedState(match);
    return;
  }

  if (msg.type === 'approve_hosted_join') {
    const match = hostedMatches.get(msg.matchId);
    if (!match || match.host !== identity) return;
    const guestId = msg.guestId;
    if (!match.pending.includes(guestId)) return;
    if (match.players.length >= 2) return;

    match.pending = match.pending.filter((p) => p !== guestId);
    match.players.push(guestId);
    match.scores[guestId] = 0;
    if (match.players.length === 2) {
      match.status = 'ready';
    }
    broadcastHostedState(match);
    return;
  }

  if (msg.type === 'reject_hosted_join') {
    const match = hostedMatches.get(msg.matchId);
    if (!match || match.host !== identity) return;
    const guestId = msg.guestId;
    if (!match.pending.includes(guestId)) return;

    match.pending = match.pending.filter((p) => p !== guestId);
    send(guestId, { type: 'hosted_rejected', matchId: match.code });
    broadcastHostedState(match);
    return;
  }

  if (msg.type === 'hosted_choice') {
    const match = hostedMatches.get(msg.matchId);
    if (!match) return;
    if (!match.players.includes(identity)) return;
    if (match.status !== 'ready') return;
    if (!CHOICES.includes(msg.choice)) return;
    if (match.choices[identity]) return;

    match.choices[identity] = msg.choice;

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
    if (match.players.includes(identity)) {
      forfeitHostedMatch(match, identity);
    } else if (match.pending.includes(identity)) {
      match.pending = match.pending.filter((p) => p !== identity);
      broadcastHostedState(match);
    } else {
      match.spectators.delete(identity);
    }
    return;
  }

  if (msg.type === 'close_hosted_match') {
    const match = hostedMatches.get(msg.matchId);
    if (!match || match.host !== identity) return;
    const recipients = hostedRecipients(match);
    hostedMatches.delete(match.code);
    for (const user of recipients) {
      send(user, { type: 'hosted_closed', matchId: match.code });
    }
  }
}

function handleDisconnect(identity) {
  if (sockets.get(identity) !== this) return;
  sockets.delete(identity);
  removeFromQueue(identity);
  for (const [matchId, match] of matches.entries()) {
    if (match.players.includes(identity)) {
      const opponent = opponentOf(match, identity);
      send(opponent, { type: 'opponent_left', matchId });
      endMatch(matchId);
    }
  }
  for (const match of hostedMatches.values()) {
    if (match.players.includes(identity)) {
      forfeitHostedMatch(match, identity);
    } else if (match.pending.includes(identity)) {
      match.pending = match.pending.filter((p) => p !== identity);
      broadcastHostedState(match);
    } else {
      match.spectators.delete(identity);
    }
  }
}

function getIdentityFromRequest(req, callback) {
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
  getIdentityFromRequest(req, (identity) => {
    if (!identity) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, identity);
    });
  });
});

wss.on('connection', (ws, req, identity) => {
  const existing = sockets.get(identity);
  if (existing && existing !== ws) {
    existing.close();
  }
  sockets.set(identity, ws);

  ws.on('message', (raw) => handleMessage(identity, raw));
  ws.on('close', handleDisconnect.bind(ws, identity));
});

server.listen(PORT, () => {
  console.log(`Server laeuft auf http://localhost:${PORT}`);
});
