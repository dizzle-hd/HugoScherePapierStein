const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const CHOICES = ['stein', 'papier', 'schere'];

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'schere-stein-papier-secret',
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
  res.json({ username: trimmedUsername, stats: users[key].stats });
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
  res.json({ username: user.username, stats: user.stats });
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
  res.json({ username: user.username, stats: user.stats });
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

  let result = 'unentschieden';
  if (choice !== computerChoice) {
    const beats = { stein: 'schere', schere: 'papier', papier: 'stein' };
    result = beats[choice] === computerChoice ? 'gewonnen' : 'verloren';
  }

  if (result === 'gewonnen') user.stats.wins += 1;
  else if (result === 'verloren') user.stats.losses += 1;
  else user.stats.draws += 1;

  saveUsers(users);

  res.json({ playerChoice: choice, computerChoice, result, stats: user.stats });
});

app.listen(PORT, () => {
  console.log(`Server laeuft auf http://localhost:${PORT}`);
});
