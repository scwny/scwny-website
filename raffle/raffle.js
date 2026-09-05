import { DATA_URL, REFRESH_SECONDS } from './config.js';
import { parseTickets, ticketMatches } from './tickets.js';
import { normalizeRows, normalizeSettings, photoUrls, summarize } from './data.js';

const STORAGE_KEY = 'scwny.raffle.myTickets';
const MAX_BACKOFF_SECONDS = 120;

const el = {
  title: document.getElementById('title'),
  message: document.getElementById('message'),
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  tickets: document.getElementById('tickets'),
  ticketsHelp: document.getElementById('tickets-help'),
  wins: document.getElementById('wins'),
  winsHeading: document.getElementById('wins-heading'),
  winsList: document.getElementById('wins-list'),
  search: document.getElementById('search'),
  results: document.getElementById('results'),
};

const state = {
  rows: [],
  settings: normalizeSettings({}),
  updated: null,
  loadedOnce: false,
  myNumbers: new Set(),
  invalidTokens: [],
  search: '',
  timer: null,
  backoffSeconds: REFRESH_SECONDS,
};

// ---------- data source ----------

function resolveDataUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') return './sample-data.json';
  const override = params.get('data');
  if (override && /^https?:\/\//i.test(override)) return override;
  return DATA_URL;
}

const dataUrl = resolveDataUrl();

// ---------- storage ----------

function loadSavedTickets() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveTickets(text) {
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Storage unavailable (private mode, blocked). The feature still works for this visit.
  }
}

// ---------- fetching and refresh ----------

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

function clearError() {
  el.error.hidden = true;
  el.error.textContent = '';
}

function scheduleNext(seconds) {
  window.clearTimeout(state.timer);
  if (document.visibilityState !== 'visible') return;
  state.timer = window.setTimeout(fetchData, seconds * 1000);
}

async function fetchData() {
  window.clearTimeout(state.timer);

  if (!dataUrl) {
    showError('No data source is configured yet. Add the Apps Script URL to raffle/config.js.');
    el.status.textContent = '';
    el.results.setAttribute('aria-busy', 'false');
    return;
  }

  try {
    const response = await fetch(dataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? payload.error : 'Unexpected response');
    }

    state.rows = normalizeRows(payload.rows);
    state.settings = normalizeSettings(payload.settings);
    state.updated = new Date();
    state.loadedOnce = true;
    state.backoffSeconds = REFRESH_SECONDS;

    clearError();
    render();
    scheduleNext(REFRESH_SECONDS);
  } catch (err) {
    const wait = state.backoffSeconds;
    state.backoffSeconds = Math.min(wait * 2, MAX_BACKOFF_SECONDS);
    showError(`Couldn't load results. Retrying in ${wait} seconds…`);
    if (!state.loadedOnce) {
      el.status.textContent = '';
      el.results.setAttribute('aria-busy', 'false');
    }
    console.error('Raffle results fetch failed:', err);
    scheduleNext(wait);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchData();
  } else {
    window.clearTimeout(state.timer);
  }
});

// ---------- rendering ----------

function isWin(row) {
  return row.ticket !== '' && ticketMatches(row.ticket, state.myNumbers);
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function render() {
  document.title = `${state.settings.title} · SCWNY`;
  el.title.textContent = state.settings.title;
  el.message.textContent = state.settings.message;
  el.message.hidden = state.settings.message === '';

  const { total, drawn } = summarize(state.rows);
  const updated = state.updated ? ` · Updated ${formatTime(state.updated)}` : '';
  el.status.textContent = total === 0
    ? `No baskets listed yet${updated}`
    : `${drawn} of ${total} baskets drawn${updated}`;

  renderTicketsHelp();
  renderWins();
  renderResults();
  el.results.setAttribute('aria-busy', 'false');
}

function renderTicketsHelp() {
  el.ticketsHelp.replaceChildren();
  const count = state.myNumbers.size;

  if (count === 0 && state.invalidTokens.length === 0) {
    el.ticketsHelp.textContent = 'Enter your numbers to see your wins highlighted. Saved on this device.';
    return;
  }

  const parts = [`${count} ticket${count === 1 ? '' : 's'} saved.`];
  if (count > 0 && state.loadedOnce && !state.rows.some(isWin)) parts.push('No wins yet.');
  el.ticketsHelp.append(parts.join(' '));

  if (state.invalidTokens.length > 0) {
    const span = document.createElement('span');
    span.className = 'invalid';
    span.textContent = ` Couldn't read: ${state.invalidTokens.join(', ')}`;
    el.ticketsHelp.appendChild(span);
  }
}

function renderWins() {
  const wins = state.rows.filter(isWin);
  if (wins.length === 0) {
    el.wins.hidden = true;
    el.winsList.replaceChildren();
    return;
  }
  el.winsHeading.textContent = wins.length === 1 ? 'You won 1 basket!' : `You won ${wins.length} baskets!`;
  el.winsList.replaceChildren(
    ...wins.map((row) => {
      const li = document.createElement('li');
      li.textContent = `Basket ${row.basket} · ${row.description} · Ticket ${row.ticket}`;
      return li;
    }),
  );
  el.wins.hidden = false;
}

function matchesSearch(row, query) {
  if (!query) return true;
  return [row.basket, row.description, row.ticket].some((value) => value.toLowerCase().includes(query));
}

function openDetailBaskets() {
  return new Set(
    [...el.results.querySelectorAll('details[open]')].map((details) => details.dataset.basket),
  );
}

function renderResults() {
  const query = state.search.trim().toLowerCase();
  const rows = state.rows.filter((row) => matchesSearch(row, query));
  const anyPhoto = state.rows.some((row) => photoUrls(row.photo) !== null);
  const keepOpen = openDetailBaskets();

  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = state.rows.length === 0
      ? 'No baskets have been posted yet.'
      : 'No baskets match your search.';
    el.results.replaceChildren(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'list';

  const headerRow = table.createTHead().insertRow();
  const headers = [
    ['Basket', 'num'],
    ['Description', 'desc'],
    ['Winning Ticket', 'ticket'],
    ...(anyPhoto ? [['Photo', 'thumb']] : []),
  ];
  for (const [label, className] of headers) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = className;
    th.textContent = label;
    headerRow.appendChild(th);
  }

  const tbody = table.createTBody();
  for (const row of rows) tbody.appendChild(renderRow(row, anyPhoto, keepOpen));

  el.results.replaceChildren(table);
}

function renderRow(row, anyPhoto, keepOpen) {
  const win = isWin(row);
  const tr = document.createElement('tr');
  tr.className = win ? 'basket win' : 'basket';

  const num = tr.insertCell();
  num.className = 'num';
  num.textContent = row.basket;

  const desc = tr.insertCell();
  desc.className = 'desc';
  const title = document.createElement('div');
  title.className = 'desc-title';
  title.textContent = row.description;
  if (win) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = 'You';
    title.appendChild(badge);
  }
  desc.appendChild(title);

  if (row.details !== '' || row.donatedBy !== '') {
    const details = document.createElement('details');
    details.dataset.basket = row.basket;
    details.open = keepOpen.has(row.basket);
    const summary = document.createElement('summary');
    summary.textContent = 'Details';
    details.appendChild(summary);
    if (row.details !== '') {
      const p = document.createElement('p');
      p.textContent = row.details;
      details.appendChild(p);
    }
    if (row.donatedBy !== '') {
      const p = document.createElement('p');
      p.className = 'donor';
      p.textContent = `Donated by ${row.donatedBy}`;
      details.appendChild(p);
    }
    desc.appendChild(details);
  }

  const ticket = tr.insertCell();
  ticket.className = row.ticket === '' ? 'ticket pending' : 'ticket';
  ticket.textContent = row.ticket === '' ? 'Not drawn yet' : row.ticket;

  if (anyPhoto) {
    const thumb = tr.insertCell();
    thumb.className = 'thumb';
    const urls = photoUrls(row.photo);
    if (urls) {
      const link = document.createElement('a');
      link.href = urls.full;
      link.target = '_blank';
      link.rel = 'noopener';
      const img = document.createElement('img');
      img.src = urls.thumb;
      img.alt = `Photo of basket ${row.basket}`;
      img.loading = 'lazy';
      link.appendChild(img);
      thumb.appendChild(link);
    }
  }

  return tr;
}

// ---------- input handling ----------

function applyTickets(text) {
  const { numbers, invalid } = parseTickets(text);
  state.myNumbers = numbers;
  state.invalidTokens = invalid;
  renderTicketsHelp();
  if (state.loadedOnce) {
    renderWins();
    renderResults();
  }
}

el.tickets.addEventListener('input', () => {
  saveTickets(el.tickets.value);
  applyTickets(el.tickets.value);
});

el.search.addEventListener('input', () => {
  state.search = el.search.value;
  if (state.loadedOnce) renderResults();
});

// ---------- start ----------

el.tickets.value = loadSavedTickets();
applyTickets(el.tickets.value);
fetchData();
