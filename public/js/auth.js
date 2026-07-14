const tabButtons = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.tab-panel');
const messageEl = document.getElementById('auth-message');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}-form`).classList.add('active');
    setMessage('');
  });
});

function setMessage(text, isSuccess = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle('success', isSuccess);
}

async function submitAuth(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Etwas ist schiefgelaufen.');
  }
  return data;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  try {
    await submitAuth('/api/login', { username, password });
    window.location.href = 'game.html';
  } catch (err) {
    setMessage(err.message);
  }
});

document.getElementById('join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('join-name').value;
  const code = document.getElementById('join-code').value;
  try {
    const data = await submitAuth('/api/guest-join', { name, code });
    window.location.href = `game.html?join=${data.code}`;
  } catch (err) {
    setMessage(err.message);
  }
});

document.getElementById('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('join');
  if (code) {
    document.getElementById('join-code').value = code.toUpperCase().slice(0, 6);
  }
})();

(async () => {
  const res = await fetch('/api/me');
  if (res.ok) {
    const data = await res.json();
    if (!data.isGuest) {
      window.location.href = 'game.html';
    }
  }
})();
