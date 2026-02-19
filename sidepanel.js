// ── LEXLY SIDEPANEL SCRIPT ─────────────────────────────────────────
// CSP-compliant: zero inline event handlers anywhere.
// All DOM events wired via addEventListener + event delegation.

const API_BASE = 'https://lexly-backend.vercel.app/api'; // ← update to your deployed URL

// ── STATE ──────────────────────────────────────────────────────────
let token           = null;
let userName        = '';
let userEmail       = '';
let allWords        = [];
let definitionCache = {};

// ── INIT ───────────────────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.local.get(['lexly_token', 'lexly_email', 'lexly_name']);
  if (stored.lexly_token) {
    token     = stored.lexly_token;
    userEmail = stored.lexly_email || '';
    userName  = stored.lexly_name || '';
    showDash();
    await loadWords();
  }
}

// ── TAB SWITCH ─────────────────────────────────────────────────────
function switchTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-signup').classList.toggle('active', !isLogin);
  document.getElementById('panel-login').classList.toggle('active', isLogin);
  document.getElementById('panel-signup').classList.toggle('active', !isLogin);

  // Update intro text
  const title = document.querySelector('.auth-intro-title');
  const sub   = document.querySelector('.auth-intro-sub');
  if (title) title.textContent = isLogin ? 'Welcome back' : 'Create your account';
  if (sub)   sub.textContent   = isLogin
    ? 'Sign in to access your saved words and definitions.'
    : 'Start building your personal dictionary today.';

  clearMsg();
}

document.getElementById('tab-login').addEventListener('click',  () => switchTab('login'));
document.getElementById('tab-signup').addEventListener('click', () => switchTab('signup'));

// ── MESSAGES ───────────────────────────────────────────────────────
function clearMsg() {
  ['login-msg', 'signup-msg'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'form-msg'; }
  });
}

function setMsg(id, text, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `form-msg ${type}`;
}

// ── AUTH — LOGIN ────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { setMsg('login-msg', 'Please fill in all fields'); return; }

  setLoading('btn-login', true, 'Signing in…');
  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token; userEmail = email;
      await chrome.storage.local.set({ lexly_token: token, lexly_email: email });
      showDash();
      await loadWords();
    } else {
      setMsg('login-msg', data.error || 'Login failed');
    }
  } catch {
    setMsg('login-msg', 'Cannot reach Lexly server');
  }
  setLoading('btn-login', false, 'Sign In');
});

// ── AUTH — SIGNUP ───────────────────────────────────────────────────
document.getElementById('btn-signup').addEventListener('click', async () => {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-pass').value;
  if (!name || !email || !pass) { setMsg('signup-msg', 'Please fill in all fields'); return; }
  if (pass.length < 8) { setMsg('signup-msg', 'Password must be at least 8 characters'); return; }

  setLoading('btn-signup', true, 'Creating account…');
  try {
    const res  = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass }),
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token; userEmail = email;
      await chrome.storage.local.set({ lexly_token: token, lexly_email: email });
      showDash();
      await loadWords();
    } else {
      setMsg('signup-msg', data.error || 'Signup failed');
    }
  } catch {
    setMsg('signup-msg', 'Cannot reach Lexly server');
  }
  setLoading('btn-signup', false, 'Create Account');
});

// ── AUTH — SIGN OUT ─────────────────────────────────────────────────
document.getElementById('btn-signout').addEventListener('click', async () => {
  await chrome.storage.local.remove(['lexly_token', 'lexly_email']);
  token = null; userEmail = ''; allWords = []; definitionCache = {};
  showAuth();
});

// ── KEYBOARD SUBMIT ─────────────────────────────────────────────────
document.getElementById('login-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});
document.getElementById('signup-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-signup').click();
});

// ── LOADING HELPER ──────────────────────────────────────────────────
function setLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = label;
}

// ── SCREEN TRANSITIONS ──────────────────────────────────────────────
function showAuth() {
  document.getElementById('screen-dash').classList.add('hidden');
  document.getElementById('screen-auth').classList.remove('hidden');
}

function showDash() {
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-dash').classList.remove('hidden');
  document.getElementById('user-badge').textContent = userEmail;
}

// ── LOAD WORDS ──────────────────────────────────────────────────────
async function loadWords() {
  const container = document.getElementById('words-container');
  container.innerHTML = `
    <div class="words-loading">
      <div class="def-spinner"></div>
      Loading your words…
    </div>
  `;

  try {
    const res  = await fetch(`${API_BASE}/words`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      allWords = data.words || [];
      updateStats();
      renderWords(allWords);
    } else {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-body">Could not load words. Try again.</div>
        </div>`;
    }
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-body">Cannot reach server.</div>
      </div>`;
  }
}

// ── STATS ───────────────────────────────────────────────────────────
function updateStats() {
  document.getElementById('stat-count').textContent = allWords.length;

  const today      = new Date().toDateString();
  const todayCount = allWords.filter(w => {
    try { return new Date(w.created_at).toDateString() === today; }
    catch { return false; }
  }).length;
  document.getElementById('stat-today').textContent = todayCount;

  const label = document.getElementById('list-label');
  if (label) {
    label.textContent = allWords.length === 0
      ? ''
      : allWords.length === 1 ? '1 word' : `${allWords.length} words`;
  }
}

// ── RENDER WORDS ────────────────────────────────────────────────────
// No onclick attributes — all interaction handled by event delegation below.
function renderWords(words) {
  const container = document.getElementById('words-container');

  if (!words.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-glyph">Aa</div>
        <div class="empty-title">Your dictionary is empty</div>
        <div class="empty-body">
          Highlight any word on a webpage and click <strong>Save</strong> to add it here.
        </div>
      </div>`;
    return;
  }

  container.innerHTML = words.map((w, i) => `
    <div class="word-card" data-id="${w.id}" style="animation-delay:${i * 25}ms">
      <div class="card-head">
        <div class="card-left">
          <div class="card-pip"></div>
          <span class="card-word">${escHtml(w.word)}</span>
        </div>
        <div class="card-meta">
          <span class="card-date">${formatDate(w.created_at)}</span>
          <svg class="card-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <polyline points="4,6 8,10 12,6"/>
          </svg>
        </div>
      </div>
      <div class="card-def">
        <div class="card-def-inner">
          <div class="def-text" data-def-id="${w.id}">${escHtml(definitionCache[w.id] || w.meaning || '')}</div>
          <div class="def-footer">
            <button class="btn-delete" data-delete-id="${w.id}">Remove word</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// ── EVENT DELEGATION — word list container ───────────────────────────
// Handles card expand/collapse AND delete button — no inline handlers needed.
document.getElementById('words-container').addEventListener('click', async (e) => {
  // ── Delete button ──────────────────────────────────────────────
  const deleteBtn = e.target.closest('[data-delete-id]');
  if (deleteBtn) {
    e.stopPropagation();
    await deleteWord(deleteBtn.dataset.deleteId);
    return;
  }

  // ── Card toggle ────────────────────────────────────────────────
  const card = e.target.closest('.word-card');
  if (!card) return;
  await toggleCard(card);
});

// ── TOGGLE CARD ─────────────────────────────────────────────────────
async function toggleCard(card) {
  const wordId = card.dataset.id;
  const defEl  = card.querySelector('[data-def-id]');
  const isOpen = card.classList.contains('open');

  // Close all other cards first
  document.querySelectorAll('.word-card.open').forEach(c => c.classList.remove('open'));
  if (isOpen) return; // was open → just close, done

  card.classList.add('open');

  // Already have definition cached or stored
  if (definitionCache[wordId]) {
    defEl.textContent = definitionCache[wordId];
    return;
  }
  if (defEl.textContent.trim()) return; // already populated from server

  // Fetch from backend (AI call)
  defEl.innerHTML = `<div class="def-loading"><div class="def-spinner"></div> Asking AI…</div>`;

  try {
    const res  = await fetch(`${API_BASE}/words/${wordId}/meaning`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok && data.meaning) {
      definitionCache[wordId] = data.meaning;
      defEl.textContent = data.meaning;
    } else {
      defEl.textContent = 'Could not fetch definition.';
    }
  } catch {
    defEl.textContent = 'Error fetching definition.';
  }
}

// ── DELETE WORD ─────────────────────────────────────────────────────
async function deleteWord(wordId) {
  const card = document.querySelector(`.word-card[data-id="${wordId}"]`);
  if (card) { card.style.opacity = '0.35'; card.style.pointerEvents = 'none'; }

  try {
    const res = await fetch(`${API_BASE}/words/${wordId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) {
      allWords = allWords.filter(w => w.id !== wordId);
      delete definitionCache[wordId];
      updateStats();
      // Filter-aware: re-render with whatever is currently searched
      const q = document.getElementById('search-input').value.toLowerCase().trim();
      renderWords(q ? allWords.filter(w => w.word.toLowerCase().includes(q)) : allWords);
    } else if (card) {
      card.style.opacity = ''; card.style.pointerEvents = '';
    }
  } catch {
    if (card) { card.style.opacity = ''; card.style.pointerEvents = ''; }
  }
}

// ── SEARCH ──────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderWords(q ? allWords.filter(w => w.word.toLowerCase().includes(q)) : allWords);
});

// ── UTILS ────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d   = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── START ────────────────────────────────────────────────────────────
init();