// ── LEXLY CONTENT SCRIPT ──────────────────────────────────────────
// Detects text selection, shows floating "Save this word?" bubble.
// Communicates with backend via fetch (token from chrome.storage).

(() => {
  const API_BASE = 'https://lexly-backend.vercel.app/api'; // ← change to your deployed URL
  let bubble = null;
  let pendingWord = '';
  let hideTimer = null;

  // ── CREATE BUBBLE DOM ────────────────────────────────────────────

  function createBubble() {
    const el = document.createElement('div');
    el.className = 'lexly-bubble';
    el.innerHTML = `
      <div class="lexly-bubble-inner">
        <div class="lexly-icon">L</div>
        <div class="lexly-content">
          <div class="lexly-word-label">
            Save <em id="lexly-word-display"></em>?
          </div>
          <div class="lexly-sub">Add to your Lexly dictionary</div>
        </div>
        <div class="lexly-actions">
          <button class="lexly-btn-save" id="lexly-save-btn">Save</button>
          <button class="lexly-btn-close" id="lexly-close-btn">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);

    el.querySelector('#lexly-save-btn').addEventListener('click', handleSave);
    el.querySelector('#lexly-close-btn').addEventListener('click', hideBubble);

    return el;
  }

  function getBubble() {
    if (!bubble || !document.body.contains(bubble)) {
      bubble = createBubble();
    }
    return bubble;
  }

  // ── POSITION & SHOW ──────────────────────────────────────────────

  function showBubble(word, rect) {
    clearTimeout(hideTimer);
    pendingWord = word;

    const b = getBubble();
    const inner = b.querySelector('.lexly-bubble-inner');

    // Reset to default state
    inner.innerHTML = `
      <div class="lexly-icon">L</div>
      <div class="lexly-content">
        <div class="lexly-word-label">Save <em id="lexly-word-display"></em>?</div>
        <div class="lexly-sub">Add to your Lexly dictionary</div>
      </div>
      <div class="lexly-actions">
        <button class="lexly-btn-save" id="lexly-save-btn">Save</button>
        <button class="lexly-btn-close" id="lexly-close-btn">✕</button>
      </div>
    `;
    inner.querySelector('#lexly-save-btn').addEventListener('click', handleSave);
    inner.querySelector('#lexly-close-btn').addEventListener('click', hideBubble);
    inner.querySelector('#lexly-word-display').textContent = word;

    // Position above selection centre
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const centreX = rect.left + rect.width / 2 + scrollX;
    const topY    = rect.top + scrollY - 70;

    b.style.left = `${centreX}px`;
    b.style.top  = `${Math.max(topY, scrollY + 10)}px`;

    // Force reflow before adding visible class (for transition)
    b.classList.remove('lexly-visible');
    void b.offsetWidth;
    b.classList.add('lexly-visible');
  }

  function hideBubble() {
    if (!bubble) return;
    bubble.classList.remove('lexly-visible');
    hideTimer = setTimeout(() => {
      bubble?.remove();
      bubble = null;
    }, 250);
  }

  // ── SAVE HANDLER ─────────────────────────────────────────────────

  async function handleSave() {
    const word = pendingWord;
    if (!word) return;

    const inner = bubble?.querySelector('.lexly-bubble-inner');
    if (!inner) return;

    // Show saving state
    inner.innerHTML = `
      <div class="lexly-toast">
        <div class="lexly-spinner"></div>
        <div class="lexly-toast-text">Saving <span>${word}</span>…</div>
      </div>
    `;

    // Get auth token
    let token;
    try {
      const stored = await chrome.storage.local.get(['lexly_token']);
      token = stored.lexly_token;
    } catch {
      token = null;
    }

    if (!token) {
      showToast(inner, '🔒', word, 'Sign in to Lexly first!', true);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/words`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ word }),
      });

      if (res.status === 409) {
        showToast(inner, '📚', word, 'Already in your dictionary');
      } else if (res.ok) {
        showToast(inner, '✅', word, 'Saved to your dictionary!');
      } else {
        showToast(inner, '⚠️', word, 'Could not save — try again', true);
      }
    } catch {
      showToast(inner, '⚠️', word, 'No connection to Lexly', true);
    }
  }

  function showToast(inner, icon, word, message, isError = false) {
    inner.innerHTML = `
      <div class="lexly-toast">
        <div class="lexly-toast-icon">${icon}</div>
        <div class="lexly-toast-text" style="color:${isError ? '#f08080' : '#0C9EA4'}">
          ${message}
        </div>
      </div>
    `;
    setTimeout(hideBubble, isError ? 2500 : 1800);
  }

  // ── SELECTION DETECTION ──────────────────────────────────────────

  let selectionTimer = null;

  document.addEventListener('mouseup', (e) => {
    // Don't trigger inside the bubble itself
    if (bubble && bubble.contains(e.target)) return;

    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 2) {
        hideBubble();
        return;
      }

      // Only words or short 2-word phrases
      const wordCount = text.split(/\s+/).length;
      if (wordCount > 3 || text.length > 60) {
        hideBubble();
        return;
      }

      // Skip if selection is inside the bubble
      if (bubble && bubble.contains(selection.anchorNode)) return;

      try {
        const range = selection.getRangeAt(0);
        const rect  = range.getBoundingClientRect();
        if (rect.width > 0) {
          showBubble(text, rect);
        }
      } catch {
        // selection may have been cleared
      }
    }, 80);
  });

  // Hide when clicking outside
  document.addEventListener('mousedown', (e) => {
    if (bubble && !bubble.contains(e.target)) {
      hideBubble();
    }
  });

  // Hide on scroll (re-positioning is complex; just dismiss)
  document.addEventListener('scroll', hideBubble, { passive: true });
  window.addEventListener('resize', hideBubble, { passive: true });

})();