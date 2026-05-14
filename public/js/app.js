const HISTORY_KEY = 'runtune_history';

const state = {
  genres: [],
  currentWorkout: null,
  mood: 'random',
};

// ─── Init ─────────────────────────────────────────────────────────────────

async function init() {
  await Promise.all([loadUser(), loadGenres()]);
  setupNav();
  setupForm();
  showView('input');
}

// ─── User ─────────────────────────────────────────────────────────────────

async function loadUser() {
  try {
    const data = await api('/api/me');
    if (data.image) {
      const avatar = document.getElementById('user-avatar');
      avatar.style.backgroundImage = `url(${data.image})`;
    }
  } catch { /* non-critical */ }
}

// ─── Genres ───────────────────────────────────────────────────────────────

async function loadGenres() {
  const label = document.getElementById('genres-label');
  try {
    const data = await api('/api/genres');
    state.genres = data.genres;
    const display = data.genres.slice(0, 3).join(', ');
    label.textContent = `Gêneros detectados: ${display}`;
  } catch {
    label.textContent = 'Não foi possível carregar seus gêneros.';
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view === 'history') renderHistory();
      showView(view);
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    showView('input');
    setNavActive('input');
  });

  document.getElementById('retry-btn').addEventListener('click', () => {
    showView('input');
    setNavActive('input');
  });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${name}`);
    v.classList.toggle('hidden', v.id !== `view-${name}`);
  });
}

function setNavActive(view) {
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
  });
}

// ─── Form ─────────────────────────────────────────────────────────────────

function setupForm() {
  const form = document.getElementById('workout-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSearch();
  });

  document.getElementById('hours').addEventListener('input', function () {
    if (this.value !== '' && parseInt(this.value) > 24) this.value = 24;
    if (parseInt(this.value) < 0) this.value = 0;
  });

  document.getElementById('minutes').addEventListener('input', function () {
    if (this.value !== '' && parseInt(this.value) > 60) this.value = 60;
    if (parseInt(this.value) < 0) this.value = 0;
  });

  document.querySelectorAll('.mood-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.mood = btn.dataset.mood;
    });
  });

  // Default selection
  document.querySelector('.mood-option[data-mood="random"]').classList.add('selected');
}

async function handleSearch() {
  const distanceEl = document.getElementById('distance');
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const errorEl = document.getElementById('form-error');

  const distance = parseFloat(distanceEl.value);
  const hours = parseInt(hoursEl.value) || 0;
  const minutes = parseInt(minutesEl.value) || 0;
  const totalMinutes = hours * 60 + minutes;

  errorEl.classList.add('hidden');

  if (!distance || distance < 1) {
    return showError(errorEl, 'Informe uma distância válida (mínimo 1 km).');
  }
  if (totalMinutes < 5) {
    return showError(errorEl, 'Informe um tempo válido (mínimo 5 minutos).');
  }

  state.currentWorkout = { distance, totalMinutes, mood: state.mood };

  setLoading(true);

  try {
    const data = await api('/api/suggestions', {
      method: 'POST',
      body: JSON.stringify({ durationMinutes: totalMinutes, mood: state.mood })
    });

    const listenedIds = new Set(getHistory().map(h => h.album.id).filter(Boolean));
    const fresh = data.suggestions.filter(a => !listenedIds.has(a.id));
    const toShow = fresh.length > 0 ? fresh : data.suggestions;
    renderSuggestions(toShow, distance, totalMinutes);
    showView('suggestions');
    setNavActive(null);
  } catch (err) {
    showError(errorEl, err.message || 'Erro ao buscar álbuns. Tente novamente.');
  } finally {
    setLoading(false);
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function setLoading(on) {
  const btn = document.getElementById('search-btn');
  btn.disabled = on;
  btn.querySelector('.btn-text').classList.toggle('hidden', on);
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !on);
}

// ─── Suggestions ──────────────────────────────────────────────────────────

function renderSuggestions(albums, distance, totalMinutes) {
  const list = document.getElementById('suggestions-list');
  const subtitle = document.getElementById('suggestions-subtitle');

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const timeStr = h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}min`;
  const moodLabel = { motivated: 'modo tranquilo', unmotivated: 'modo energia', random: 'aleatório' };
  subtitle.textContent = `${distance}km · ${timeStr} · ${moodLabel[state.mood]}`;

  list.innerHTML = '';

  albums.forEach(album => {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.innerHTML = `
      ${album.image
        ? `<img class="album-cover" src="${album.image}" alt="${escHtml(album.name)}" loading="lazy">`
        : `<div class="album-cover-placeholder">${musicIcon()}</div>`
      }
      <div class="album-info">
        <div class="album-name" title="${escHtml(album.name)}">${escHtml(album.name)}</div>
        <div class="album-artist">${escHtml(album.artist)}</div>
        <div class="album-footer">
          <div class="album-duration">
            ${clockIcon()}
            ${album.durationMin} min
          </div>
          <button class="btn-listen" data-url="${escHtml(album.spotifyUrl || '')}">
            ${spotifyIcon()}
            Ouvir
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-listen').addEventListener('click', (e) => {
      const url = e.currentTarget.dataset.url;
      if (url) window.open(url, '_blank', 'noopener');
      saveToHistory(album, state.currentWorkout);
      showToast('Adicionado ao histórico');
    });

    list.appendChild(card);
  });
}

// ─── History ──────────────────────────────────────────────────────────────

function saveToHistory(album, workout) {
  const history = getHistory();
  const entry = {
    id: Date.now(),
    date: new Date().toLocaleDateString('pt-BR'),
    distance: workout.distance,
    durationMin: workout.totalMinutes,
    album: {
      id: album.id,
      name: album.name,
      artist: album.artist,
      image: album.image,
      spotifyUrl: album.spotifyUrl
    }
  };
  history.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function deleteHistoryEntry(id) {
  const updated = getHistory().filter(h => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  renderHistory();
  showToast('Removido do histórico');
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const history = getHistory();

  list.innerHTML = '';

  if (history.length === 0) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const h = Math.floor(entry.durationMin / 60);
    const m = entry.durationMin % 60;
    const timeStr = h > 0 ? `${h}h${m > 0 ? m + 'min' : ''}` : `${m}min`;

    item.innerHTML = `
      ${entry.album.image
        ? `<img class="history-cover" src="${entry.album.image}" alt="${escHtml(entry.album.name)}" loading="lazy">`
        : `<div class="history-cover-placeholder">${musicIcon(24)}</div>`
      }
      <div class="history-info">
        <div class="history-stats">${entry.distance}km · ${timeStr}</div>
        <div class="history-album">${escHtml(entry.album.name)}</div>
        <div class="history-artist">${escHtml(entry.album.artist)}</div>
      </div>
      <div class="history-right">
        <div class="history-date">${entry.date}</div>
        <button class="btn-delete" data-id="${entry.id}" title="Remover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    `;

    if (entry.album.spotifyUrl) {
      item.querySelector('.history-info').style.cursor = 'pointer';
      item.querySelector('.history-info').addEventListener('click', () => {
        window.open(entry.album.spotifyUrl, '_blank', 'noopener');
      });
    }

    item.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteHistoryEntry(entry.id);
    });

    list.appendChild(item);
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, 2200);
}

// ─── API ──────────────────────────────────────────────────────────────────

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro desconhecido');
  return data;
}

// ─── Icons ────────────────────────────────────────────────────────────────

function musicIcon(size = 32) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="${size}" height="${size}">
    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>`;
}

function clockIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>`;
}

function spotifyIcon() {
  return `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────

init();
