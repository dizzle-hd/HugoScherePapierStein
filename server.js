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

// Guests have no account: they join a hosted match/tournament with just a
// display name. Their session "username" is an opaque internal id; the
// real-world name they typed is only ever kept here, in memory, for as long
// as their session lives.
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
  if (!hostedMatches.has(normalizedCode) && !tournaments.has(normalizedCode)) {
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

function send(identity, payload) {
  const ws = sockets.get(identity);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function opponentOf(entity, identity) {
  return entity.players.find((u) => u !== identity);
}

/* ---------------- Shared: codes, stakes ---------------- */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const hostedMatches = new Map(); // code -> hosted match state
const tournaments = new Map(); // code -> tournament state

function generateCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (hostedMatches.has(code) || tournaments.has(code));
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

/* ---------------- Hosted matches (admin-run, code to join, single stake) ---------------- */

function hostedRecipients(match) {
  return new Set([match.host, ...match.players, ...match.spectators, ...match.pending]);
}

function playerRoleFor(entity, identity) {
  if (identity === entity.host) return 'host';
  if (entity.players.includes(identity)) return 'player';
  if (entity.pending.includes(identity)) return 'pending';
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

/* ---------------- Tournaments (admin-run, code to join, bracket, prizes) ---------------- */

function isValidPrizes(prizes) {
  if (!prizes || typeof prizes !== 'object') return false;
  if (!isValidStake(prizes.first)) return false;
  if (prizes.second != null && !isValidStake(prizes.second)) return false;
  if (prizes.third != null && !isValidStake(prizes.third)) return false;
  return true;
}

function sanitizePrizes(prizes) {
  return {
    first: sanitizeStake(prizes.first),
    second: prizes.second ? sanitizeStake(prizes.second) : null,
    third: prizes.third ? sanitizeStake(prizes.third) : null
  };
}

function tournamentRecipients(tournament) {
  return new Set([tournament.host, ...tournament.players, ...tournament.spectators, ...tournament.pending]);
}

function makeMatchup(round, index, a, b) {
  const matchup = {
    id: `r${round}m${index}`,
    round,
    players: [a, b],
    scores: {},
    choices: {},
    status: (a && b) ? 'ready' : 'bye',
    lastRound: null,
    winner: null
  };
  if (a) matchup.scores[a] = 0;
  if (b) matchup.scores[b] = 0;
  if (matchup.status === 'bye') matchup.winner = a || b || null;
  return matchup;
}

function allMatchupsOf(tournament) {
  const list = tournament.bracket ? tournament.bracket.rounds.flat() : [];
  if (tournament.thirdPlaceMatchup) list.push(tournament.thirdPlaceMatchup);
  return list;
}

function findMatchup(tournament, matchupId) {
  return allMatchupsOf(tournament).find((m) => m.id === matchupId) || null;
}

function findActiveMatchupFor(tournament, identity) {
  return allMatchupsOf(tournament).find((m) =>
    m.players.includes(identity) && (m.status === 'ready' || m.status === 'countdown')
  ) || null;
}

// The most recent matchup this player is/was part of, regardless of status —
// unlike findActiveMatchupFor, this stays populated right after a matchup
// finishes so the client can still render that matchup's reveal/result
// before (maybe) moving on to a new one next round.
function findMyMatchup(tournament, identity) {
  const theirs = allMatchupsOf(tournament).filter((m) => m.players.includes(identity));
  return theirs.length ? theirs[theirs.length - 1] : null;
}

function isEliminated(tournament, identity) {
  if (tournament.status === 'registration') return false;
  const theirs = allMatchupsOf(tournament).filter((m) => m.players.includes(identity));
  if (theirs.length === 0) return false;
  const last = theirs[theirs.length - 1];
  if (last.status !== 'finished' && last.status !== 'bye') return false;
  return last.winner !== identity;
}

function buildBracket(tournament) {
  const shuffled = [...tournament.players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const size = Math.max(2, Math.pow(2, Math.ceil(Math.log2(shuffled.length))));
  const byeCount = size - shuffled.length;
  // Give each bye its own matchup (paired with null) instead of padding the
  // list with nulls at the end, which could pair two byes against each other.
  const byePlayers = shuffled.slice(0, byeCount);
  const activePlayers = shuffled.slice(byeCount);

  const round0 = [];
  for (const p of byePlayers) {
    round0.push(makeMatchup(0, round0.length, p, null));
  }
  for (let i = 0; i < activePlayers.length; i += 2) {
    round0.push(makeMatchup(0, round0.length, activePlayers[i], activePlayers[i + 1]));
  }
  tournament.bracket = { rounds: [round0] };
}

function checkTournamentCompletion(tournament) {
  const rounds = tournament.bracket.rounds;
  const lastRound = rounds[rounds.length - 1];
  const mainDone = lastRound.length === 1 && (lastRound[0].status === 'finished' || lastRound[0].status === 'bye');
  if (!mainDone) return;

  const thirdDone = !tournament.prizes.third || !tournament.thirdPlaceMatchup ||
    tournament.thirdPlaceMatchup.status === 'finished' || tournament.thirdPlaceMatchup.status === 'bye';
  if (!thirdDone) return;

  const finalMatch = lastRound[0];
  tournament.standings.first = finalMatch.winner;
  tournament.standings.second = finalMatch.players.find((p) => p && p !== finalMatch.winner) || null;
  if (tournament.thirdPlaceMatchup) {
    tournament.standings.third = tournament.thirdPlaceMatchup.winner;
  }
  tournament.status = 'finished';
}

function advanceTournament(tournament) {
  const round = tournament.bracket.rounds[tournament.bracket.rounds.length - 1];
  if (!round.every((m) => m.status === 'finished' || m.status === 'bye')) return;

  if (round.length === 2 && tournament.prizes.third && !tournament.thirdPlaceMatchup) {
    const losers = round
      .map((m) => m.players.find((p) => p && p !== m.winner))
      .filter(Boolean);
    if (losers.length === 2) {
      tournament.thirdPlaceMatchup = makeMatchup(-1, 0, losers[0], losers[1]);
    }
  }

  const winners = round.map((m) => m.winner).filter(Boolean);
  if (winners.length > 1) {
    const nextRoundIndex = tournament.bracket.rounds.length;
    const nextRound = [];
    for (let i = 0; i < winners.length; i += 2) {
      nextRound.push(makeMatchup(nextRoundIndex, nextRound.length, winners[i], winners[i + 1] ?? null));
    }
    tournament.bracket.rounds.push(nextRound);
  }

  checkTournamentCompletion(tournament);
}

// How long to keep a just-finished matchup as each player's "myMatchup"
// before the bracket is advanced to the next round. Without this delay,
// advanceTournament() can build (and hand out) the next matchup in the very
// same tick a semifinal resolves, so a client's reveal animation for the
// finished matchup would never get its own broadcast — players would jump
// straight into the next matchup without ever seeing "you won this round".
const TOURNAMENT_ADVANCE_DELAY_MS = 3300;

function resolveMatchupRound(tournament, matchup) {
  const [a, b] = matchup.players;
  const choiceA = matchup.choices[a];
  const choiceB = matchup.choices[b];
  const resultForA = judge(choiceA, choiceB);

  let roundWinner = null;
  if (resultForA === 'gewonnen') roundWinner = a;
  else if (resultForA === 'verloren') roundWinner = b;

  if (roundWinner) matchup.scores[roundWinner] += 1;

  matchup.lastRound = { choices: { [a]: choiceA, [b]: choiceB }, winner: roundWinner };
  matchup.choices = {};

  if (roundWinner && matchup.scores[roundWinner] >= tournament.targetScore) {
    matchup.status = 'finished';
    matchup.winner = roundWinner;
    setTimeout(() => {
      if (matchup === tournament.thirdPlaceMatchup) {
        checkTournamentCompletion(tournament);
      } else {
        advanceTournament(tournament);
      }
      broadcastTournamentState(tournament);
    }, TOURNAMENT_ADVANCE_DELAY_MS);
  } else {
    matchup.status = 'ready';
  }
}

function forfeitTournamentMatchup(tournament, identity) {
  const matchup = findActiveMatchupFor(tournament, identity);
  if (!matchup) return;
  const remaining = matchup.players.find((p) => p && p !== identity);
  matchup.status = 'finished';
  matchup.winner = remaining || null;
  matchup.choices = {};
  setTimeout(() => {
    if (matchup === tournament.thirdPlaceMatchup) {
      checkTournamentCompletion(tournament);
    } else {
      advanceTournament(tournament);
    }
    broadcastTournamentState(tournament);
  }, TOURNAMENT_ADVANCE_DELAY_MS);
}

function serializeMatchup(m) {
  return {
    id: m.id,
    round: m.round,
    players: m.players.map((p) => (p ? { id: p, name: displayNameOf(p), score: m.scores[p] ?? 0, locked: Boolean(m.choices[p]) } : null)),
    status: m.status,
    lastRound: m.lastRound,
    winner: m.winner
  };
}

function serializeStandings(tournament) {
  const wrap = (id) => (id ? { id, name: displayNameOf(id) } : null);
  return {
    first: wrap(tournament.standings.first),
    second: wrap(tournament.standings.second),
    third: wrap(tournament.standings.third)
  };
}

function buildTournamentStatePayload(tournament, identity) {
  const role = playerRoleFor(tournament, identity);
  const myMatchup = role === 'player' ? findMyMatchup(tournament, identity) : null;

  return {
    type: 'tournament_state',
    code: tournament.code,
    status: tournament.status,
    targetScore: tournament.targetScore,
    prizes: tournament.prizes,
    role,
    players: tournament.players.map((p) => ({
      id: p,
      name: displayNameOf(p),
      eliminated: isEliminated(tournament, p)
    })),
    pending: role === 'host' ? tournament.pending.map((p) => ({ id: p, name: displayNameOf(p) })) : [],
    bracket: tournament.bracket ? {
      rounds: tournament.bracket.rounds.map((round) => round.map(serializeMatchup)),
      thirdPlaceMatchup: tournament.thirdPlaceMatchup ? serializeMatchup(tournament.thirdPlaceMatchup) : null
    } : null,
    standings: tournament.status === 'finished' ? serializeStandings(tournament) : null,
    myMatchup: myMatchup ? serializeMatchup(myMatchup) : null
  };
}

function broadcastTournamentState(tournament) {
  for (const identity of tournamentRecipients(tournament)) {
    send(identity, buildTournamentStatePayload(tournament, identity));
  }
}

/* ---------------- WS message handling ---------------- */

function handleMessage(identity, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
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

    const code = generateCode();
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

  if (msg.type === 'create_tournament') {
    if (!isAdmin(identity)) {
      send(identity, { type: 'hosted_error', message: 'Nur Admins können ein Turnier erstellen.' });
      return;
    }
    const targetScore = Number(msg.targetScore);
    if (!Number.isInteger(targetScore) || targetScore < 1 || targetScore > 50) {
      send(identity, { type: 'hosted_error', message: 'Ungültige Punktzahl (1-50).' });
      return;
    }
    if (!isValidPrizes(msg.prizes)) {
      send(identity, { type: 'hosted_error', message: 'Ungültige Preise.' });
      return;
    }

    const code = generateCode();
    const tournament = {
      code,
      host: identity,
      targetScore,
      prizes: sanitizePrizes(msg.prizes),
      players: [],
      pending: [],
      spectators: new Set(),
      status: 'registration',
      bracket: null,
      thirdPlaceMatchup: null,
      standings: { first: null, second: null, third: null }
    };
    tournaments.set(code, tournament);
    broadcastTournamentState(tournament);
    return;
  }

  if (msg.type === 'join_hosted_match') {
    const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';

    const match = hostedMatches.get(code);
    if (match) {
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

    const tournament = tournaments.get(code);
    if (tournament) {
      const alreadyIn = identity === tournament.host || tournament.players.includes(identity) ||
        tournament.pending.includes(identity) || tournament.spectators.has(identity);

      if (!alreadyIn) {
        if (tournament.status === 'registration') {
          if (isGuestIdentity(identity)) {
            tournament.pending.push(identity);
          } else {
            tournament.players.push(identity);
          }
        } else {
          tournament.spectators.add(identity);
        }
      }

      broadcastTournamentState(tournament);
      return;
    }

    send(identity, { type: 'hosted_error', message: 'Code nicht gefunden.' });
    return;
  }

  if (msg.type === 'approve_hosted_join') {
    const match = hostedMatches.get(msg.matchId);
    if (match) {
      if (match.host !== identity) return;
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

    const tournament = tournaments.get(msg.matchId);
    if (tournament) {
      if (tournament.host !== identity) return;
      const guestId = msg.guestId;
      if (!tournament.pending.includes(guestId)) return;

      tournament.pending = tournament.pending.filter((p) => p !== guestId);
      tournament.players.push(guestId);
      broadcastTournamentState(tournament);
    }
    return;
  }

  if (msg.type === 'reject_hosted_join') {
    const match = hostedMatches.get(msg.matchId);
    if (match) {
      if (match.host !== identity) return;
      const guestId = msg.guestId;
      if (!match.pending.includes(guestId)) return;

      match.pending = match.pending.filter((p) => p !== guestId);
      send(guestId, { type: 'hosted_rejected', matchId: match.code });
      broadcastHostedState(match);
      return;
    }

    const tournament = tournaments.get(msg.matchId);
    if (tournament) {
      if (tournament.host !== identity) return;
      const guestId = msg.guestId;
      if (!tournament.pending.includes(guestId)) return;

      tournament.pending = tournament.pending.filter((p) => p !== guestId);
      send(guestId, { type: 'hosted_rejected', matchId: tournament.code });
      broadcastTournamentState(tournament);
    }
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

  if (msg.type === 'start_tournament') {
    const tournament = tournaments.get(msg.code);
    if (!tournament || tournament.host !== identity) return;
    if (tournament.status !== 'registration') return;
    if (tournament.players.length < 2) {
      send(identity, { type: 'hosted_error', message: 'Mindestens 2 Spieler nötig, um zu starten.' });
      return;
    }

    buildBracket(tournament);
    tournament.status = 'in_progress';
    advanceTournament(tournament);
    broadcastTournamentState(tournament);
    return;
  }

  if (msg.type === 'tournament_choice') {
    const tournament = tournaments.get(msg.code);
    if (!tournament || tournament.status !== 'in_progress') return;
    const matchup = findMatchup(tournament, msg.matchupId);
    if (!matchup || matchup.status !== 'ready') return;
    if (!matchup.players.includes(identity)) return;
    if (!CHOICES.includes(msg.choice)) return;
    if (matchup.choices[identity]) return;

    matchup.choices[identity] = msg.choice;

    if (Object.keys(matchup.choices).length === 2) {
      matchup.status = 'countdown';
      broadcastTournamentState(tournament);

      setTimeout(() => {
        const t = tournaments.get(msg.code);
        if (!t) return;
        const m = findMatchup(t, msg.matchupId);
        if (!m || m.status !== 'countdown') return;
        resolveMatchupRound(t, m);
        broadcastTournamentState(t);
      }, 3000);
    } else {
      broadcastTournamentState(tournament);
    }
    return;
  }

  if (msg.type === 'leave_hosted_match') {
    const match = hostedMatches.get(msg.matchId);
    if (match) {
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

    const tournament = tournaments.get(msg.matchId);
    if (tournament) {
      if (tournament.status === 'registration') {
        tournament.players = tournament.players.filter((p) => p !== identity);
        tournament.pending = tournament.pending.filter((p) => p !== identity);
      } else if (tournament.status === 'in_progress' && tournament.players.includes(identity)) {
        forfeitTournamentMatchup(tournament, identity);
      } else {
        tournament.spectators.delete(identity);
      }
      broadcastTournamentState(tournament);
    }
    return;
  }

  if (msg.type === 'close_hosted_match') {
    const match = hostedMatches.get(msg.matchId);
    if (match) {
      if (match.host !== identity) return;
      const recipients = hostedRecipients(match);
      hostedMatches.delete(match.code);
      for (const user of recipients) {
        send(user, { type: 'hosted_closed', matchId: match.code });
      }
      return;
    }

    const tournament = tournaments.get(msg.matchId);
    if (tournament) {
      if (tournament.host !== identity) return;
      const recipients = tournamentRecipients(tournament);
      tournaments.delete(tournament.code);
      for (const user of recipients) {
        send(user, { type: 'hosted_closed', matchId: tournament.code });
      }
    }
    return;
  }
}

function handleDisconnect(identity) {
  if (sockets.get(identity) !== this) return;
  sockets.delete(identity);

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

  for (const tournament of tournaments.values()) {
    if (tournament.status === 'registration') {
      if (tournament.players.includes(identity) || tournament.pending.includes(identity)) {
        tournament.players = tournament.players.filter((p) => p !== identity);
        tournament.pending = tournament.pending.filter((p) => p !== identity);
        broadcastTournamentState(tournament);
      }
    } else if (tournament.status === 'in_progress' && tournament.players.includes(identity)) {
      forfeitTournamentMatchup(tournament, identity);
      broadcastTournamentState(tournament);
    } else if (tournament.spectators.has(identity)) {
      tournament.spectators.delete(identity);
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
